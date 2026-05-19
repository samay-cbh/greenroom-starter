# Settlement v2: Submission Memo

**Case study:** Greenroom — Product slice + prototype
**Companion artifacts:** [`prd.md`](prd.md) (full PRD), [`CASE-STUDY-NOTES.md`](CASE-STUDY-NOTES.md) (build notes + demo path)

---

## TL;DR

Greenroom's settlement tool was built when most deals were flat guarantees. The market has moved. **62.6% of deals — led by vs deals at 35.0% — cannot be calculated in-platform.** 82% of venues do settlement in spreadsheets. Greenroom processes $3.4M in gross box office across 537 historical settlements with `calculation_json` null on every single one — meaning every "OK, wire monday" TM signoff is false confidence, not real oversight. I chose to ship three coupled features — **F0 (parser with forced-choice on ambiguity) + F1 (vs deal engine) + F2 (auditable statement)** — that take one show (Coastal Spell, the canonical $720 dispute) from "Mariana in a Google Sheet at 2am" to "in-platform with a versioned, linkable audit trail." North star: % of vs deals settled fully in-platform with non-null `calculation_json`. Baseline ~0%; target 60% in 6 months.

---

## Why this slice

I considered three alternatives before locking in:

- **F2 alone.** Lowest risk. Ships display polish to the 18% who already use the tool — doesn't touch the 82% on spreadsheets, doesn't break the dispute pattern.
- **F1 alone.** Math runs, but inputs stay ambiguous and outputs stay opaque. Mariana still hits "the engine paid $11,564.80 but I think it should be $12,284.80" with no traceable lines. Capability without trust artifact.
- **F5 (expense hub) alone.** Solves "half my Wednesday chasing expenses" (high empathy), but moves zero new settlements in-platform. RICE 65 vs F2's 612.

I picked the coupled slice because the Coastal Spell dispute reduces to one variable — is the marketing recoup a deduction off gross or inside the expense cap? — and that variable lives at the intersection of all three features. F0 forces the choice at deal entry. F1 reads the confirmed choice. F2 surfaces it in the audit trail. Each feature without the others leaves the dispute live.

**Decision: F2 ships first** (sequenced for risk). Lands `calculation_json` baseline for the 18% of flat-deal users before F0/F1 risk. When F1 lands, it plugs into a worksheet pattern already in production rather than landing alongside an unfamiliar display.

---

## The data behind the choice

I queried `data/greenroom.db` directly. Every number in this memo and `prd.md` is grounded in the dataset, not in a memo or assumption.

| Signal | Value | Source |
|---|---|---|
| Total settled shows | 537 | `COUNT(*)` from `settlements` |
| Deal types unsupported by engine | **62.6%** (336 / 537) | `deal_type NOT IN ('flat','percentage_of_gross')` |
| vs deal share | **35.0%** (188 / 537) | `deal_type = 'vs'` |
| Settlements with empty `calculation_json` | **100%** | `WHERE calculation_json IS NULL` |
| Vs deal dispute rate | **7.5%** (14 / 188) | Joined with `status = 'disputed'` |
| Flat deal dispute rate | **1.6%** (3 / 187) | Same |
| **Vs-to-flat dispute multiplier** | **4.6×** | 7.5% / 1.6% |
| Disputes from unsupported deal types | **88%** (22 / 25) | Sum across vs + % of net + door |
| Gross box office (settled rows) | **$3.4M** | `SUM(gross_box_office)` |
| Payouts through unsupported deal types | **$1.6M** | `SUM(total_to_artist)` for unsupported types |

What this says for prioritization:

- **Not an edge case.** A clear majority of revenue moves through deal types the tool can't handle. The 82% spreadsheet rate is a downstream symptom.
- **Concentrated dispute pattern.** 88% of disputes come from unsupported types; vs deals dispute at 4.6× the baseline. Vs is the highest-leverage move per dispute prevented.
- **Provable trust deficit.** Zero of 537 historical settlements have audit trails. TM signoff comments confirm Sarah Kim's interview: signoff is not validation.
- **Coastal Spell is representative.** One ambiguous sentence cost $720 + multi-day email + agent goodwill. The full failure chain (ambiguous deal → opaque math → no audit) repeats across the 22 disputes from unsupported types.

RICE on the current slice (Reach = 340 paying venues): **F2 = 612, F1 = 377, F0 = 285** — all clear 250. Nothing else in the backlog does (RICE breakdown lives in `prd.md` §8).

---

## What the slice does (Coastal Spell, walked through)

Coastal Spell — March 14, 2025. Deal email:

> *"$5,000 vs 80% of net after expenses, whichever greater. Expenses capped $2,500. Hospitality cap $500. +$1,000 bonus over $25k gross. **Marketing recoup of $900 against gross**."*

One sentence read two ways. Mariana: the recoup comes off gross before expenses are computed. WME: "against gross" is shorthand for "comes out of the expense bucket the cap limits." At the disputed numbers (expenses $2,500, recoup $900), the difference is **$720**.

**F0 — Deal-term parser, forced choice on ambiguity.** The booker visits `/confirm-terms`. The page parses `dealNotesFreetext` server-side and renders: the original email verbatim, parsed fields with confidence badges (guarantee $5,000, 80%, cap $2,500, bonus $1,000 over $25k gross — all high confidence), and **one amber forced-choice card** — the parser sees "against gross" AND an explicit cap, surfaces this as an ambiguity, quotes the source phrase back, presents both interpretations with rationale. The booker cannot submit until the choice is resolved. The result is persisted as a **Deal Terms Schema v1** record (`deals.deal_terms_json`) with `deal_terms_version: "deal_terms_v1"`, a `deductions[]` array carrying the recoup row's `cap_scope`, plus the verbatim `source_text` for audit.

The product idea: ambiguity gets resolved at deal entry (Wednesday email to the agent) rather than at settlement (2am Friday). The 80-word email needed three more sentences to be unambiguous; they never got written because deal emails are written at 11pm by overworked agents. F0 makes "three more sentences" into "two radio buttons + rationale."

**F1 — vs deal calculation engine.** When the booker hits settle, the engine reads the confirmed terms and runs the canonical vs formula:

```
Gross − fees − pre-cap deductions − MIN(expenses + in-cap deductions, cap) = Net
Artist payout = MAX(guarantee, artist% × Net) + triggered bonuses
```

Deductions are sorted by `ordering_priority` before routing — the engine doesn't assume placement. Net-basis deductions return `supported: false` with a clear reason (fail loud, never silent miscalculation). Every vs calc writes a **versioned `CalculationRecord`** to `settlements.calculation_json`: `version: 1`, full `termsSnapshot`, ordered `steps[]`, `guaranteeComparison` with both values + winner label, totals. Three golden tests pin the math: recoup outside cap = **$11,564.80**, inside cap = **$12,284.80**, delta = **$720** (engine-asserted), plus a flat-deal regression test.

**F2 — Auditable statement.** The settle page renders an `AuditableWorksheet` for vs deals. What's on screen: confirmed-terms banner ("Calculated against confirmed deal terms — $5,000 vs 80%, recoup off gross") with a `View terms →` link back to F0; per-line source badges (`deal` / `pos` / `receipt` / `manual` / `absorbed`); absorbed-by-venue section surfaced separately so the agent sees costs the venue ate; explicit guarantee-comparison row ("Artist share $X vs guarantee $Y — paying the [winner]"); and a **counterfactual block** when the other recoup reading would have paid a different total ("If the team had picked recoup in cap, the total would be $13,484.80 — a $720 higher payout"). The `calculation_json` is the durable artifact the North Star measures.

---

## Design choices and tradeoffs

1. **F2 → F1 → F0 sequencing for risk.** F2 lands the audit-trail baseline for the 18% flat-deal users first. F1 plugs into a worksheet pattern already in production. F0 lands last when its consuming surfaces are validated.

2. **Deterministic regex parser, not LLM, for the prototype.** `ParsedDealTerms` is the swap point — production replaces the regex body with a model call; nothing downstream changes. This decouples shipping the *trust artifact* from shipping *parser quality*. F0's product idea (forced choice on ambiguity) is independent of how the ambiguity is detected.

3. **Deal Terms Schema v1 as the durable contract.** `deal_terms_version` discriminator; deductions modeled as a generic `deductions[]` with `id`, `basis`, `cap_scope`, `ordering_priority` — not hardcoded to marketing recoup. Hospitality overage, production overage, or any future modifier becomes a row addition, not a schema migration. Pre-v1 confirmed terms are auto-migrated by `parseDealTermsJson` — no forced re-confirm.

4. **Fail loud on unsupported behavior.** Net-basis deductions return `supported: false`. Net-basis bonus tiers report as `notTriggered` with a clear reason. Silent wrong math is the worst possible outcome — it propagates to TM signoff, to wired payments, to disputes weeks later.

5. **Honest seed, not dramatic seed.** Coastal's seed has $1,600 of non-absorbed expenses + a $900 recoup = exactly $2,500 (the cap). At those numbers, both recoup readings produce the same total. I could have re-engineered the seed for a dramatic demo. I didn't — "real venue data is messy" is more important than dramatic. The app explains the cap-binding case in-product (`CapBindingNote`) and a one-line script (`scripts/seed-coastal-terms.ts pre 1000`) switches into the divergent case for Loom. The audit record captures which reading was confirmed either way — which is the actual product point.

6. **Idempotent persistence.** The `calculation_json` write strips `calculatedAt` from the comparison fingerprint, so re-renders don't push garbage updates. (Caught during the senior-engineer review pass.)

---

## What I cut, and why

| Cut | Reason |
|---|---|
| Real LLM for F0 | Deterministic stub. `ParsedDealTerms` contract is the swap point — production replaces the regex body, nothing downstream changes. |
| Door deals, % of net, walkout pots, tier ratchets | PRD §9. Share components with the vs engine — extend after vs is stable and tested. |
| F3 (structured deal entry), F5 (expense hub) | PRD §8 — next ship. Build on the F0 vocabulary; can ship in parallel with the slice's follow-ons. |
| PDF export, TM mobile auth preview | PRD §13 / F7. Both depend on F2's audit-trail data being valuable — sequence after we've proven that. |
| Flat-deal `calculation_json` | F2 AC 7 says "every settlement" — prototype only persists for vs. Flat path is unchanged byte-for-byte (test 3 asserts this). One-day extension after the vs pattern is validated. |
| TM signoff anchored to calc version | F2 AC 8. Lifecycle work — needs a settlement state-machine edit. Deferred to the next slice. |
| Brand-new vs-show settlement creation | Prototype only `UPDATE`s existing settlement rows. Creating new rows pulls in lifecycle/timestamp logic out of scope. Coastal already has a settlement row, so the demo works. |

I'd rather ship six things at depth than ten at the surface. Each cut is a deliberate sequencing decision.

---

## How I'd validate

The math is correct (golden tests prove it). What I don't know yet is whether the *audit-trail product* — the per-line provenance, the explicit guarantee comparison, the confirmed-terms banner — changes the *settlement conversation* the way user research suggests.

**Ship F0 + F1 + F2 to The Crescent first.** Observe the next three vs deal settlements end-to-end.

**The core question:** does Diego (Pale Lake tour manager) look at the worksheet steps and ask **fewer questions than he does today**? Today he goes line-by-line and Mariana explains from memory. If F2 is working, his question count drops and the ones he does ask point at specific lines rather than at the whole number.

| Signal | What it means | Target |
|---|---|---|
| Clarifying questions raised at the table | Audit-trail clarity | ≥40% reduction vs baseline |
| Time: settlement opened → TM signoff | PRD primary metric | <20 min (today ~45) |
| Follow-up emails the next morning | Does the statement answer questions before they're asked? | 0 for 2 of 3 |
| Does Mariana open the Google Sheet? | Binary, leading | No, for all 3 |
| Marcus's 1am approval | Does he have to ask which line is the deduction? | No |

If all three clear without sheet fallback and Diego's question count drops → expand to two more WME-heavy venues. If not → return to interview transcripts to find what the statement still doesn't surface before broadening rollout.

**Leading indicators to instrument:** vs deals with confirmed structured terms before show night (leads North Star by 2–7 days); calculation accuracy rate (tool payout vs wired amount); TM signoff event captured with "calc expanded" (validates F2 is producing review, not rubber stamps).

**Guardrails:** flat deal dispute rate — don't regress the 34.8% currently working. Settlement tool error rate — engine errors push bookers back to spreadsheets; page on first occurrence.

---

## What I'd ship next

Sequenced for leverage, not feature count:

1. **F3 — Structured Deal Terms** (RICE 193). The free-text deal email is the upstream cause F0 only partially addresses. F3 replaces it as the primary input path. Every venue (340) enters every deal through it. Builds on the v1 schema F0 already established — the contract is already there. Over time F0 becomes vestigial.

2. **F5 — Centralized Expense Hub** (RICE 65). The "half my Wednesday chasing expenses" problem. Independent of F0/F1/F2; can ship in parallel with F3. Reach base 279 (the 82% on spreadsheets). Impact flagged for review — Mariana's "that alone would change my life" suggests it may be undercounted.

3. **% of net (standalone) and Door deals** (PRD §9). Cheapest engine extensions — they reuse vs components. ~120 + ~30 settlements respectively, both at higher-than-baseline dispute rates. Days, not weeks.

4. **PDF export + TM mobile preview** (F2 AC 6 + F7). After F2 proves the audit-trail data is valuable. PDF is a structural extension of the HTML view. Mobile auth is its own scope (Diego's pre-review request).

5. **TM signoff anchored to calc version** (F2 AC 8). Lifecycle work. After F3 reduces ambiguity at deal entry, this becomes "lock-in" of the agreed calculation rather than a recovery mechanism.

6. **Walkout potential (WOP) and tier ratchets** (PRD §9). New schema, design work needed before backlog entry. Lower observed prevalence — model after the vs engine is stable.

**Ordering rationale:** F3 + F5 collapse the upstream and mid-week parts of Mariana's workflow that this slice only partially addresses. Door and % of net are the lowest-cost engine extensions. PDF and mobile come after the audit data proves its value to the TM. WOP and ratchets need design before they enter the backlog.

---

## Closing

Settlement is the trust moment between the venue and the artist. Every show ends with it. Today, that moment runs on a Google Sheet at 2am because Greenroom's engine can't handle 62.6% of deals and produces zero audit trail across 537 historical settlements covering $3.4M in gross.

The three-feature slice makes one show — the canonical $720 Coastal Spell dispute — go end-to-end in-platform with a versioned, linkable audit trail. It ships the *trust artifact*, not just the *calculation capability*. Validation at The Crescent answers what golden tests can't: does the audit view change the settlement conversation? If yes, F3 expands the input surface and F5 collapses the mid-week scramble. If not, the same three settlements tell us what's still missing.

The bet is that the audit trail is the actual product — not the math. The math is table stakes for the 62.6% of deals the tool can't currently handle. The audit trail is what makes the tour manager sign in 10 minutes instead of 45, and what gives the agent a number they don't have to dispute the next morning. That's the lever for the CEO memo's "most important thing the product touches."
