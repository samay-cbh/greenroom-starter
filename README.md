<div align="center">

# Greenroom — Settlement v2

**Vs Deal Calculator + Settlement Transparency**

Greenroom Applied AI PM case study prototype

</div>

---

## TL;DR

Greenroom's settlement tool was built when most deals were flat guarantees. **62.6% of historical deals — led by vs deals at 35.0% — cannot be calculated in-platform.** 100% of 537 settlements have null `calculation_json`: every TM signoff is false confidence, not real oversight.

This branch ships three coupled features that take **Coastal Spell** (the canonical $720 marketing-recoup dispute) from "Mariana in a Google Sheet at 2am" to in-platform settlement with a versioned audit trail:

**F0 (deal-term parser + forced choice) → F1 (vs deal engine) → F2 (auditable statement)**

Hardened in this submission pass so that **any vs show settles** (not just Coastal-shaped emails) and the worksheet shows **every step traceable** — running balance after each line, cap-status badges, and an explicit "in-cap bucket → cap" row so the cap operation is never invisible.

North star: % of vs deals settled fully in-platform with non-null `calculation_json`.

---

## What was built

| Feature | What it does | Where it lives |
|---|---|---|
| **F0** — Deal-term parser + forced choice | Parses `dealNotesFreetext` AND falls back to the deal record (`guaranteeAmount`, `percentage`, `expenseCap`, gross-threshold rows from `bonusesJson`) so any vs show — not just Coastal-shaped emails — can be confirmed. Generic `Ambiguity` loop: confirm form iterates `parsed.ambiguities`, builds `deductions[]` from `parsed.extracted.deductions` + per-id resolutions. Persists **Deal Terms Schema v1** to `deals.deal_terms_json` | `lib/dealParser.ts`, `/shows/[id]/confirm-terms` |
| **F1** — Vs deal engine | `MAX(guarantee, artist% × net) + bonuses` with ordered deductions. Worksheet rows carry `runningBalance` and a `capStatus` tag (`pre_cap` / `in_cap` / `absorbed` / `cap_binding` / `cap_at` / `cap_within`); an explicit "In-cap bucket subtotal" row precedes the cap; the cap row is now always emitted (even when savings = 0) so the cap operation is visible at boundary cases | `lib/dealMath.ts` |
| **F2** — Auditable statement | Per-line source badges, per-line **cap-status badges**, **running balance** under each amount, guarantee comparison, counterfactual block, persisted `calculation_json` | `/shows/[id]/settle` |
| **Shared contract** | `DealTermsV1` → `CalculationRecord` pipeline. `Ambiguity.field` is a generic dotted path (`deductions.{id}.cap_scope`) with `string` option values so new ambiguity types ride the same UI | `lib/dealTerms.ts` |

F0 is a **deterministic regex stub**, not an LLM. Production swaps the parser body; the `ParsedDealTerms` contract and downstream pipeline stay the same.

### Vs deal formula (F1)

```
Gross − fees − pre-cap deductions − MIN(expenses + in-cap deductions, cap) = Net
Artist payout = MAX(guarantee, artist% × Net) + triggered bonuses
```

Deductions are sorted by `ordering_priority` before routing. Net-basis deductions fail loud (`supported: false`) rather than silently miscalculating.

---

## Setup

**Requirements:** Node.js 20+, Git.

```bash
git clone https://github.com/vasanthpanuganti/greenroom-starter-case-study
cd greenroom-starter-case-study
git checkout feature/vs-deal-calculator-settlement-transparency
npm install
npm run db:reset    # clean DB — Coastal Spell starts with no confirmed terms
npm run dev         # http://localhost:3000
npm test            # 18 tests (engine goldens, parser contract, blocker, transparency)
```

> Stop any running dev server before `db:reset` on Windows — SQLite file locks can block the reset.

---

## Demo path (Coastal Spell)

**Show:** `show_coastal_spell_dispute` — March 14, 2025. The deal email has one ambiguous sentence: *"expenses capped at $2,500, marketing recoup of $900 against gross."*

### Step 1 — Settle page (blocked)

Open **[http://localhost:3000/shows/show_coastal_spell_dispute/settle](http://localhost:3000/shows/show_coastal_spell_dispute/settle)**

- Vs deal, no confirmed terms yet
- Amber blocker card: tool can't settle vs yet
- CTA: **Confirm deal terms**

### Step 2 — Confirm terms (F0)

Click through to `/shows/show_coastal_spell_dispute/confirm-terms`

- Original deal email preserved verbatim at the top
- Parsed fields with confidence badges (guarantee, %, cap, bonus tier)
- One forced-choice ambiguity: marketing recoup cap scope
  - **Mariana's read:** recoup deducted off gross before expenses
  - **WME's read:** recoup inside the $2,500 expense cap
- Submit is blocked until the ambiguity is resolved

### Step 3 — Settle page (auditable worksheet)

After confirming terms, return to settle:

- Confirmed-terms banner with link back to the form
- Worksheet with per-line source labels (`deal` / `pos` / `manual` / `absorbed`)
- Per-line **cap-status badges** (`pre-cap`, `in cap`, `at cap`, `cap binds`, `within cap`, `absorbed`) and a **running balance** under each amount
- Explicit "In-cap bucket subtotal" row showing the bucket the cap operates on, followed by a cap row even when savings = $0 (boundary case: `at cap`)
- Explicit guarantee comparison row
- `settlements.calculation_json` populated (verify with `npx tsx scripts/check-coastal-calc.ts`)

Reload confirm-terms after step 3 to see the **Terms already confirmed** state with a Re-confirm option.

### Optional — Show the $720 counterfactual in the UI

At seed defaults, expenses + recoup = exactly the cap ($2,500), so both readings produce the same total. To show the diverge case live:

```bash
npx tsx scripts/seed-coastal-terms.ts pre 1000
```

The worksheet renders an amber counterfactual block: *"If the team had picked recoup in cap, the total would be $13,484.80 — a $720.00 higher payout."*

Revert: `npx tsx scripts/seed-coastal-terms.ts pre 2500`

---

## The Coastal Spell numbers

| Reading | Net | 80% share | Total to artist |
|---|---|---|---|
| Recoup outside cap (Mariana) | $14,456 | $11,564.80 | $11,564.80 |
| Recoup inside cap (WME) | $15,356 | $12,284.80 | $12,284.80 |
| **Δ** | | | **$720** |

The $720 matches the concession Marcus authorized in `data/dispute-thread.md`. Asserted in golden tests — not just prose.

---

## Tests

```bash
npm test
```

18 tests across three suites — node's built-in test runner via `tsx`:

**Engine goldens (`lib/__tests__/dealMath.test.ts`)**

1. Coastal Spell — recoup **outside** cap → **$11,564.80**
2. Coastal Spell — recoup **inside** cap → **$12,284.80** ($720 delta asserted)
3. Flat deal regression — existing flat path unchanged
4. **Uncapped vs with two pre-cap deductions** → engine handles non-Coastal vs shows
5. **Cap binds (in-cap recoup, bucket > cap)** → exercises `cap_binding` path
6. vs deal without confirmed terms → `confirm_terms` blocker
7. Net-basis deduction → `terms_not_supported` blocker (fail loud)
8. **Running balance** is set on every deduction-phase step, ending at netBoxOffice
9. **Coastal Spell emits cap rows even when savings = 0** (boundary case → `cap_at`)
10. **`cap_binding` capStatus** surfaces when bucket > cap
11. **`pre_cap` / `in_cap` capStatuses** are tagged on deduction rows
12. **Uncapped vs deductions stay `pre_cap`** and skip the bucket/cap rows

**Parser contract (`lib/__tests__/dealParser.test.ts`)** — Coastal-style email emits a forced-choice cap_scope ambiguity; unspecified recoup still forces a choice; no-recoup email emits zero ambiguities; bonus tiers parse onto `extracted.bonus_tiers`.

**Blocker mapping (`lib/__tests__/settlementBlocker.test.ts`)** — stale JSON → `terms_invalid`; confirm CTA wiring.

---

## Files changed

| Path | Why |
|---|---|
| `lib/dealTerms.ts` | Deal Terms Schema v1, `CalculationRecord` (now with `runningBalance` + `capStatus`), generic `Ambiguity` shape, migration helpers |
| `lib/dealParser.ts` | F0 deterministic parser stub + `mergeDealRecordFallbacks(parsed, deal)` so deal-record fields fill in where the prose didn't |
| `lib/dealMath.ts` | F1 vs branch + `calculateVsDeal()`; emits running balance, per-row capStatus, in-cap bucket subtotal, always-on cap row |
| `lib/settlementBlocker.ts` | Pre-settle gating — confirmed terms required for vs |
| `lib/__tests__/dealMath.test.ts` | 12 engine tests (originals + 5 transparency/multi-deduction additions) |
| `lib/__tests__/dealParser.test.ts` | Parser contract: ambiguity emission, generic field path |
| `app/shows/[id]/confirm-terms/` | F0 confirm UI + server action; form loops over `parsed.ambiguities` and per-id deduction amounts |
| `app/shows/[id]/settle/page.tsx` | F2 auditable worksheet — running balance, `CapStatusBadge`, cap-bucket row + `calculation_json` persistence |
| `db/schema.ts` | `deals.deal_terms_json` column |
| `scripts/seed-coastal-terms.ts` | Demo helper — toggle recoup cap scope |
| `scripts/check-coastal-calc.ts` | Demo helper — log calculation summary |
| `scripts/db-reset.ts` | Cross-platform `npm run db:reset` |

---

## Out of scope (not built)

- Real LLM in F0 (regex stub only)
- Door deals, % of net, walkout pots, tier ratchets
- F3 (structured deal entry), F5 (expense hub), F4/F6/F7
- PDF export, TM mobile auth, net-basis deductions/bonuses
- Creating new settlement rows on first settle (Coastal Spell already has one)
- Manually adding deductions the parser missed (form surfaces parser-extracted deductions; adding a new deduction type at confirmation is Phase B scope)
- Merging `bonusesJson` rows that aren't `gross_threshold` (sellout / attendance / tier ratchets stay engine-side — Phase B)

---

## Companion docs

| Doc | Contents |
|---|---|
| [`MEMO.md`](MEMO.md) | 3–5 page submission memo |
| [`prd.md`](prd.md) | Full PRD with metrics, RICE, validation plan |
| [`CASE-STUDY-NOTES.md`](CASE-STUDY-NOTES.md) | Build notes, open questions, submission checklist |
| [`SLICE-DEFENSE-MEMO.md`](SLICE-DEFENSE-MEMO.md) | Why F0 + F1 + F2, and what was considered instead |

**Research context:** `data/dispute-thread.md` (Coastal Spell dispute), `data/ceo-memo.md`, `data/transcripts/*.md`

---

## Troubleshooting

**Database looks wrong or demo state is stale**

```bash
npm run db:reset
```

**Port 3000 in use**

```bash
npm run dev -- -p 3001
```

**Inspect the database**

```bash
npm run db:studio
```
