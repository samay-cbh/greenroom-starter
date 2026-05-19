# Case Study Build Notes

Notes for the reviewer. The PRD is in `prd.md`. The README is unchanged from the starter.

## What was built

The slice described in PRD §7: **F0 (AI Deal Term Parser) → F1 (vs Deal Engine) → F2 (Auditable Statement)**, as a prototype against the existing starter codebase. Extension work, not greenfield — `dealMath.ts`, the settle page, and `settlements.calculation_json` were already there; the work is wiring them end-to-end for vs deals.

| PRD feature | Where it lives | Status |
|---|---|---|
| F0 — Deterministic parser + forced-choice confirmation | `lib/dealParser.ts`, `app/shows/[id]/confirm-terms/` | Regex stub, **not** an LLM. Production swaps the regex body for a model call; the `ParsedDealTerms` contract stays. |
| F1 — vs deal engine | `lib/dealMath.ts` (vs branch) | Full formula, including a `deductions[]` loop sorted by `ordering_priority` (marketing-recoup `cap_scope` toggle) and bonus tiers. Flat and % of gross paths untouched. |
| F2 — Auditable statement | `app/shows/[id]/settle/page.tsx` (`AuditableWorksheet`) | Per-line source badges, separate absorbed section, explicit guarantee comparison row, counterfactual block, cap-binding note. |
| Shared contract | `lib/dealTerms.ts` | **Deal Terms Schema v1** in `dealTermsJson` (`deal_terms_version: "deal_terms_v1"`). Discriminator-keyed migration for any pre-v1 JSON. F0 = deterministic parser (no LLM). Downstream binds to `DealTermsV1` → `CalculationRecord` (v1). |

## Demo path

```
1. http://localhost:3000/shows/show_coastal_spell_dispute/settle
     → vs deal, no confirmed terms yet
     → see amber "tool can't settle vs yet" card + brand CTA "The math doesn't have to live in a spreadsheet anymore"

2. Click "Confirm deal terms" → /shows/show_coastal_spell_dispute/confirm-terms
     → original deal email at the top (preserved verbatim)
     → parsed fields with confidence badges (guarantee, %, cap, bonus tier)
     → one ambiguity surfaced: marketing recoup cap scope, with the quoted source phrase
       and both interpretations laid out (Mariana's read vs WME's read, with rationale)

3. Pick a recoup interpretation → submit
     → writes DealTermsV1 JSON to deals.dealTermsJson
     → redirects to /shows/.../settle

4. Settle page now renders the auditable worksheet:
     → confirmed-terms banner (linkback to the form, "calculated against confirmed terms — $5,000 vs 80%, recoup off gross")
     → cap-binding advisory: explains that with this show's actual expenses + recoup ≤ cap, both
       readings produce the same total here, and the audit record captures which was confirmed
     → worksheet with per-line source labels (deal / POS / manual / absorbed)
     → explicit guarantee comparison row ("Artist share $X vs guarantee $Y — paying the higher")
     → settlements.calculation_json now populated (verifiable via `scripts/check-coastal-calc.ts`)
```

Reload the confirm-terms page after step 3 to see the "Terms already confirmed" state with a Re-confirm option.

## The Coastal Spell numbers

The PRD references the March 14 2025 Coastal Spell dispute (`data/dispute-thread.md`). The deal email had one ambiguous sentence: *"expenses capped at $2,500, marketing recoup of $900 against gross."* Mariana read the recoup as a separate deduction off gross; WME read it as inside the $2,500 cap.

| Reading | Net | 80% share | Total to artist | Source |
|---|---|---|---|---|
| Recoup pre-cap (Mariana) | $14,456 | $11,564.80 | $11,564.80 | Golden test 1, `lib/__tests__/dealMath.test.ts` |
| Recoup in-cap (WME) | $15,356 | $12,284.80 | $12,284.80 | Golden test 2, same file |
| Δ | | | **$720** | Asserted in test 2 |

The $720 is the dollar amount Marcus authorized as a concession (`data/dispute-thread.md`, March 19 email). It's an engine-asserted test, not just a number in prose.

### Why the live demo at seed defaults shows the same total for both readings

The Coastal Spell **seed** has $1,600 of non-absorbed expenses (sound/lights/production/hospitality/backline) + a $900 marketing recoup line = exactly $2,500, which equals the expense cap. The two readings diverge only when `expenses + recoup > cap` — at the seed's numbers, the cap doesn't bind, so both readings produce the same net.

The dispute-thread email assumes expenses alone are $2,500 (recoup additional); that's the canonical case the golden tests prove.

To see the diverge case live in the UI, run:

```
npx tsx scripts/seed-coastal-terms.ts pre 1000
```

That writes confirmed terms with a $1,000 cap. The auditable worksheet now renders the **counterfactual block** in amber: *"If the team had picked recoup in cap at confirmation, the total would be $13,484.80 — a $720.00 higher payout. The audit record captures which reading was confirmed."*

Revert with `npx tsx scripts/seed-coastal-terms.ts pre 2500`.

This was a deliberate decision (see "Open questions" below): keep the seed data realistic per the README's "real venue data is messy" framing, and let the app explain the limitation honestly rather than re-engineering the seed to make the demo more dramatic.

## What was explicitly NOT built

Per PRD §5 (Not Goals) and §9 (Ship Later), and to keep the prototype scope tight:

- **No real LLM** in F0. `lib/dealParser.ts` is regex-based. The `ParsedDealTerms` contract is the swap point — once a real model returns the same shape, the rest of the pipeline (confirm UI → server action → engine) is unchanged.
- **No write API beyond `dealTermsJson`.** Settling a brand-new vs show (no existing settlement row) would currently not persist `calculation_json` because the page only `UPDATE`s existing rows — creating a settlement row pulls in lifecycle/timestamp logic out of scope. Coastal Spell already has a settlement row, so the demo works.
- **Door deals, % of net, walkout pots, tier ratchets** — all still hit the existing not-supported fallback.
- **F3 (structured deal entry form), F5 (expense hub)** — next-ship per PRD §8. Not built.
- **F4, F6, F7** — later per PRD §5.
- **PDF export, mobile auth model, expense category source provenance from real systems** — out of scope; statement is HTML-only, expense source defaults to `"manual"`.
- **`bonus_tiers.percent_above_threshold`** — schema field present, engine path deferred. Coastal Spell uses `flat_amount + threshold_amount` on `basis: "gross"`. A bonus tier with no `flat_amount` falls back to `percent_above_threshold × (gross − threshold_amount)`, but no fixture or demo exercises that branch in v1.
- **Net-basis deductions / bonuses** — v1 engine `fails loud` (`supported: false`) on any deduction with `basis: "net"`, and reports net-basis bonus tiers as not-triggered. Coastal doesn't exercise either.

## PRD §13 open questions — how this prototype handled them

| Question | Placeholder used | Where to look |
|---|---|---|
| Which AI model for F0 extraction? | Deterministic regex stub | `lib/dealParser.ts` block comment at top |
| Exact calculation paths in the production dataset? | vs deal with configurable marketing-recoup position + bonus tiers only | `lib/dealMath.ts` `calculateVsDeal()` block comment |
| Mariana's spreadsheet rounding convention? | `Math.round(x*100)/100` (round-half-to-even on cents) | `lib/dealMath.ts` `calculateVsDeal()` block comment |
| WOP schema? | Out of scope; not modeled | PRD §9 |
| TM mobile auth for pre-review? | Out of scope; same auth as desktop | PRD §13 |

## Tests

```
npm test
```

Runs three golden tests via node's built-in test runner (no new dependencies):

1. Coastal Spell, recoup OUTSIDE cap → $11,564.80
2. Coastal Spell, recoup INSIDE cap → $12,284.80 ($720 delta vs test 1, asserted)
3. Flat deal regression — proves the existing flat path is byte-identical to pre-F1 behaviour

## Files changed at a glance

| Path | Why |
|---|---|
| `lib/dealTerms.ts` (new) | Shared contract: **Deal Terms Schema v1** (`DealTermsV1`), `ParsedDealTerms`, `CalculationRecord`, plus helpers (`parseDealTermsJson`, `migrateLegacyTerms`, `getMarketingRecoup`, `flipRecoupCapScope`, `recoupInterpretationsCollapse`). `ConfirmedDealTerms` kept as deprecated alias. |
| `lib/dealMath.ts` | New vs branch + `calculateVsDeal()` reads `deductions[]` sorted by `ordering_priority`, fails loud on net-basis deductions. Flat / % of gross unchanged. |
| `lib/dealParser.ts` (new) | F0 deterministic stub. Emits schema-shaped `extracted` (`guarantee_amount`, `artist_percent`, `expense_cap`, `deductions[]`, `bonus_tiers[]`) and `deductions.marketing_recoup.cap_scope` ambiguity. |
| `lib/__tests__/dealMath.test.ts` (new) | 3 golden tests; fixtures are full v1 records; asserts `deal_terms_version` on the snapshot. |
| `app/shows/[id]/settle/page.tsx` | Read `dealTermsJson`, run engine, persist `calculation_json`, render `AuditableWorksheet` + counterfactual (via `flipRecoupCapScope`) + cap-binding note. |
| `app/shows/[id]/confirm-terms/page.tsx` (new) | Server component: parses email server-side, shows already-confirmed status view, "Parser-extracted draft" badge. |
| `app/shows/[id]/confirm-terms/confirm-form.tsx` (new) | Client component: builds `DealTermsV1` on submit; forced-choice radios for `cap_scope`. |
| `app/shows/[id]/confirm-terms/actions.ts` (new) | Server action: validates `deal_terms_version`, each deduction's `basis` + `cap_scope`. Writes `dealTermsJson`. |
| `db/schema.ts` | One new column: `deals.deal_terms_json` (stores `DealTermsV1` JSON). Comment-only change to point to the v1 type. |
| `package.json` | One new script: `"test"` (and `db:reset` cross-platform helper). |
| `scripts/seed-coastal-terms.ts` (new) | Demo helper: writes `DealTermsV1` with `cap_scope: outside_cap` (pre) / `inside_cap` (in). |
| `scripts/check-coastal-calc.ts` (new) | Demo helper: logs `deal_terms_version` + recoup `cap_scope` + winner. |
| `prd.md` | Full PRD: numerical corrections, F1 absorbed-expenses formula line, §10 "Decision: F2 ships first", §11 validation plan (Crescent / Diego). |

## Submission checklist

**PRD (`prd.md`)** — ready to attach or paste into your memo:

- Metrics aligned (62.6%, $3.4M gross audit trail, 4.6× dispute multiplier, F3/F5 RICE components)
- F1 formula includes absorbed-expenses line
- §10 names the F2-first ship decision with rationale
- §11 includes validation plan (The Crescent, three vs settlements, Diego question)

**Prototype** — verify before Loom:

```bash
npm install
# Stop any running `npm run dev` first (Windows locks the SQLite file)
npm run db:reset          # clean DB — Coastal Spell has no confirmed terms yet
npm run dev               # http://localhost:3000 (or next free port)
npm test                  # 3/3 golden tests
```

Walk the demo path in [Demo path](#demo-path). Optional: run `npx tsx scripts/seed-coastal-terms.ts pre 1000` to show the $720 counterfactual block instead of the cap-binding note.

**What to commit** (suggested; omit local-only paths):

- Code: `lib/`, `app/shows/[id]/`, `db/schema.ts`, `package.json`, `package-lock.json`
- Docs: `prd.md`, `CASE-STUDY-NOTES.md`
- Skip: `.cursor/`, `.next/`, `data/greenroom.db` (modified by local demo runs — reviewers reset via `npm run db:reset`)

**Deliverables per README:** fork URL + 3–5 page memo (from `prd.md`) + 5–10 min Loom walking memo + prototype together.
