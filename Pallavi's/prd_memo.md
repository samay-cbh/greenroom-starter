# PRD: Deal Modeling for Settlement

**Author:** Pallavi Gupta, Applied AI PM
**Date:** 2026-05-20
**Status:** Draft for case-study submission
**Read time:** ~5 minutes

---

## 1. TL;DR

A $720 dispute at The Crescent cost the venue ~$80K in lost routing over the following year. Disputes like this trace back to deal terms captured as ambiguous freetext at intake, not to the 2am math. The slice is to make the deal a structured, locked, two-sided artifact at intake: V1 of vs-net deals with AI-assisted parsing, forced disambiguation, and agent approval, covering ~96% of the past 24 months of deals.

---

## 2. Problem and context

### 2.1 The business signal

> "Settlement. This is where we are most clearly failing." (CEO memo, Pri Shankar, Q4)

- 18% of Greenroom's customers actively use the in-app settlement tool. The other 82%, including most of the largest accounts, default to spreadsheets. (CEO memo)
- Pri's frame: *"We are winning on completeness and losing on craft."*
- Strategic stakes: Live Nation and AEG are consolidating venues. The independents who survive are the ones agents trust to settle cleanly. Settlement is the load-bearing surface for that thesis.

### 2.2 The trust cost of bad settlement

Marcus Holland, GM at The Crescent, on a $720 dispute three years ago:

> "Eighteen months later I noticed all of their roster had stopped routing through us. I called the agent and asked. She told me, very nicely, that she'd been routing through The Basement for those tours instead. That was about $80K in gross revenue we lost over a year." (`data/transcripts/marcus.md:29`)

Sarah Kim (WME), on how agents route around bad-settlement venues:

> "There are venues I route hard, venues I route reluctantly, and venues I avoid. Settlement is one of three or four signals I use." (`data/transcripts/sarah-kim.md:37-38`)

The dispute itself is small money. The opportunity-cost downstream is not. The venue rarely learns it's been quietly downgraded on routing lists.

### 2.3 The dispute picture, surfaced

Greenroom's own dashboard understates the problem by 2x.

| Source | Dispute count | Rate |
|---|---|---|
| In-app Reports tab (status = disputed) | 20 | 4.0% |
| Hidden in `recoups_json` on settlements marked `paid` or `finalized` | 22 | 4.4% |
| **True universe** | **42** | **8.4%** |

(Source: `Pallavi's/evidence_verification.ipynb` §3-§5, 501 shows, 2024-05-18 to 2026-05-16.)

**Cross-agency spread (not one bad actor):**

| Agency | Disputes | Share |
|---|---|---|
| Independent | 18 | 43% |
| Wasserman | 9 | 21% |
| WME | 7 | 17% |
| Paradigm | 4 | 10% |
| CAA | 4 | 10% |

Per-agent clustering is sharper than per-agency: top 6 agents = 30 of 42 disputes (71%). Daniel Hwang (WME) alone has 6 disputes, **5 of which are hidden marketing-recoup pushbacks invisible in the Reports tab**.

### 2.4 The intake pain

Deals arrive as short, compressed prose, often containing ambiguous clauses that go un-highlighted at intake.

> "The deal email was written by my colleague Andrea and to be totally honest, it was 80 words long and ambiguous." (`data/transcripts/sarah-kim.md:27`)

> "Deal emails get written at 11pm by overworked agents." (`data/transcripts/sarah-kim.md:33`)

The canonical Coastal Spell deal hinged on a single clause: *"expenses capped at $2,500, marketing recoup of $900 against gross."*

**The clause was ambiguous the day it was written.** The dispute didn't surface for 90 days, until settlement forced one reading or the other. **Deal modeling moves the resolution from show-night to the morning after intake.**

Mariana on the pattern:

> "I want to flag this is the third time we've had a marketing recoup interpretation issue this year, all with WME." (`data/dispute-thread.md:86`)

---

## 3. Why deal modeling, not the other five

Settlement is not one workflow but several adjacent problems wearing one name: deal modeling, audit trails, real-time prediction, the 2am walkthrough, post-show agent communication, dispute resolution.

The others all sit downstream of deal modeling. If the deal is unstructured at intake:

- The audit trail has nothing to anchor to.
- Real-time prediction has no formula to run.
- The 2am walkthrough is a renegotiation, not a reconciliation.
- Post-show agent communication is about reopening terms, not confirming them.
- Disputes are inevitable, because the source-of-truth never existed.

Fix the spine, and the others become tractable.

**The freetext column looked unstructured at first read.** Pattern mining across the 501-deal corpus showed otherwise: **12 templates cover 328 non-flat deals with zero unmatched** (V1 through V9 for vs deals, plus N1 % net, G1 % gross, D1 door). 316 of 501 deals (63%) are tool-unsupported today and get typed into `deal_notes_freetext`. V1 alone is 40 deals, the single largest unsupported template. (`evidence_verification.ipynb` §6)

Without a stable taxonomy there's no schema; without a schema there's no lockable artifact. The pattern discovery is what made this slice buildable.

Coastal Spell is a V1 with a recoup-interpretation ambiguity. Building V1 with structured recoup is the literal Coastal Spell prevention case AND the Hwang-pattern prevention case.

---

## 4. Target user and moment of use

**Primary user: lead booker** (Mariana Reyes at The Crescent, four years on the job). She receives the deal email, types what fits into Greenroom's fields, and dumps the rest into freetext. She does the 2am settlement in a spreadsheet because the tool can't handle Vs math.

**Moment of use:** the morning after the deal email lands. Not 2am. Not show-night. The intake desk is the leverage point because everything downstream inherits its ambiguity.

**Secondary users (served by the same artifact):**
- **Agent** (Sarah Kim in our research; Daniel Hwang in the Coastal Spell case): approves the deal from inbox. Gets a structured record to point to if anything drifts.
- **Tour manager** (Diego): receives the locked deal as a carbon-copy / FYI once approved. At settlement (next ship, not built in this prototype), the original deal terms trace back to a single artifact he can verify against.

**Design partner: the lead booker.** When a deal doesn't fit V1–V9, she flags it through a "None of these" path that feeds the taxonomy-extension queue. Quarterly review to confirm coverage holds.

---

## 5. Proposed solution

A deal capture flow that turns an 80-word email into a structured, locked, two-sided artifact.

**The flow:**

1. Mariana opens "New Deal," pastes the email.
2. AI reads the email and matches it to one of the front-loaded patterns (V1–V9, N1, G1, D1). V1 gets a full structured capture; other patterns are classified and flagged for follow-on builds.
3. AI also flags ambiguous clauses with the specific phrase that triggered the flag. Mariana cannot save until every flag is resolved.
4. Mariana clicks "Send for approval." The agent receives an email with the structured deal and two buttons: **Approve** or **Send back**.
5. Approve locks the deal. Send back opens a reason field, returns to Mariana, loops until approved.
6. Any post-lock edit auto-tags as **drift**, triggers a drift email with old vs new, and requires agent re-approval.

**AI design choice.** The parse is a single LLM call with the 12-pattern taxonomy front-loaded into the prompt. The model does two jobs at once: fit the deal to the closest pattern, and flag any clause that doesn't fit cleanly or carries interpretation risk. Front-loading turns a generic extraction task into a constrained classification-plus-ambiguity-detection task. Easier to QA, cheaper to run, and the failure mode is honest ("I can't fit this") rather than confidently wrong.

**Recoup is modeled as a full axis**, not a single number. Each recoup line carries `category`, `cap_amount`, `treatment` (in_cap or on_top_of_cap), and a trigger note. The Coastal Spell ambiguity is structurally impossible in this schema: "marketing recoup, $900, in_cap" is a different object from "marketing recoup, $900, on_top_of_cap."

**Hwang-pattern prevention move.** If the email mentions no recoups at all, the form still forces "agent didn't specify; confirm: no recoups allowed in this deal." Silence becomes a deliberate field, not a default.

**What the prototype demonstrates:**

```
Deals index  →  New Deal (paste email)  →  AI parse + ambiguity flags
          →  Disambiguation modal  →  Send for approval (agent view)
          →  Approve / Send back  →  Locked deal
```

The clickable prototype walks this flow end-to-end on the Coastal Spell case. It is UI-only with synthetic data and a pre-filled AI parse, not a live LLM call. *Drift detection is described above but not built in the prototype.*

---

## 6. Success criteria

| Metric | Today | Target | Horizon |
|---|---|---|---|
| Dispute rate on new deals | 8.4% (42 disputes across 501 deals, 24-month spread) | 75% reduction on the cohort of deals booked post-launch | Rolling 3-month window after launch |
| Shared mental model on deal terms | Marcus, Mariana, the agent, and the tour manager each carry their own prediction of how the deal math resolves | All parties reference the same locked artifact for deal terms; the only remaining variable is expenses + bonuses | Validated in user interviews, 1 quarter post-launch |
| Freetext dump usage | `deal_notes_freetext` carries the unmodeled half of 63% of deals today | Mariana's use of freetext drops materially; new deals get captured as structured artifacts | 3 months post-launch |
| Agent-side approval flow utilization | Not tracked today; no agent confirmation exists on how the deal was captured | ≥75% of pre-show deal artifacts get an explicit Approve or Send back from the agent | 3 months post-launch |
| Variant coverage holds | 12 patterns cover 328 non-flat deals, zero unmatched across 24 months | ≥90% of new deals fit V1–V9 / N1 / G1 / D1; rest fall to freetext fallback; Mariana extends taxonomy as design partner | Quarterly review |

*Settlement mental-load reduction is not a success criterion for this slice. Expense aggregation and bonus calculation still live outside the tool by design and will be addressed in a follow-on. The win here is dispute prevention and shared mental model on the deal terms themselves.*

---

## 7. Trade-offs and what we cut

**Cut: Vs sub-variants V2 through V9.** Schema must be extensible; UI and parsing in v1 covers V1 only. V1 alone is the largest single template (40 deals).

**Cut: bonus modeling.** Prove the core taxonomy (V1–V9 plus N1, G1, D1) works first. Bonuses sit on top of that spine and can be added once the core is validated.

**Cut: expense aggregation.** Mariana's Wednesday expense-chase pain. Not downstream of deal capture. Separate slice, called out, not built.

**Cut: rate-your-agents view.** A4 evidence said surface patterns from data, not from gut. The dispute breakdown in §2.3 does this work already.

**Cut: real-time in-show prediction.** Reopens the workload-elimination claim the evidence retired.

**Cut: settlement-against-the-locked-deal.** Named as the next ship, not built. The same artifact, same state machine, same approval surface, post-show. Marginal build cost is 2-3 hours if this slice ships clean. The pair is mechanically tight; sequencing them is a scope discipline, not an architectural one.

**Alternatives considered:**

- *Build the 2am walkthrough first.* Rejected. The walkthrough fails because the deal underneath it is mush. Fixing the surface without fixing the spine treats the symptom.
- *Build dispute resolution first.* Rejected. Disputes are downstream artifacts. The product job is to prevent them, not adjudicate them.
- *Hard-block settlement on un-acknowledged drift.* Rejected. At 2am the agent is asleep. Soft-warn banner is the realistic UX.

---

## 8. Edge cases and data messiness

**Deals that fit no pattern.** The "None of these, flag for variant review" path keeps Mariana's existing freetext-entry behavior available. The deal still saves; it just doesn't promise structured math. At settlement, the UI flags "this deal was captured outside the taxonomy" so the booker knows the spine is partial.

**Bespoke bonus terms.** A small tail of deals (3.8%) carry bonus clauses too custom for any schema. They remain as freetext in the email thread and are not parsed in this slice. Honest 96% ceiling.

**Recoup categories outside the enum.** Marketing, specialty backline, hospitality overage, production overage, other. "Other" is a freetext fallback that logs to a review queue for taxonomy extension.

**Prose-vs-structured-data drift in the seed itself.** The DB lists Coastal Spell's rep as Tom Neary / Wasserman. The canonical dispute thread (`data/dispute-thread.md`) is between Mariana and Daniel Hwang / WME. The prototype follows the prose because the email chain is the canonical case. The schema's inability to model a per-deal agent override (deals inherit the artist's default rep) is itself a settlement-relevant gap and a candidate for a later schema change.

---

**Appendix references:**
`data/ceo-memo.md` · `data/transcripts/marcus.md` · `data/transcripts/sarah-kim.md` · `data/transcripts/mariana.md` · `data/dispute-thread.md` · `Pallavi's/evidence_verification.ipynb` · `Pallavi's/dealnotes_inductive_codes.md`
