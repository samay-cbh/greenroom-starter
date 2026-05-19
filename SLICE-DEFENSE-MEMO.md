# Slice Defense Memo

**Subject:** Why I chose F0 + F1 + F2, and what I considered instead
**Companion:** [`MEMO.md`](MEMO.md) (submission memo), [`prd.md`](prd.md) (full PRD), thematic analysis below grounded in `data/transcripts/` + `data/ceo-memo.md` + `data/dispute-thread.md`

---

## The six themes the research revealed

I coded the four interviews (Mariana, Diego, Marcus, Sarah Kim), the CEO memo, and the Coastal Spell dispute thread, and the same six patterns repeated across stakeholders:

1. **Functional abandonment** — 82% of venues bypass the tool because it can't handle vs deals. The DB confirms: 62.6% of historical deal types are unsupported, and `calculation_json` is null on every one of 537 settlements.
2. **Trust is the real product, math is the mechanism** — Sarah ("do I trust the math"), Mariana ("half about the money, half about the proof"), Marcus (30-second signoffs run on trust in Mariana, not in the system).
3. **Deferred ambiguity** — Coastal Spell: an 80-word email caused a $720 concession and agent goodwill loss three months later. Sarah: "the deal email needed three more sentences."
4. **Premature synchronization** — The settlement *conversation* is supposed to be a review of pre-computed numbers; in practice it's the first computation, done at 2am with an audience. Mariana spends half her Wednesday chasing expenses to avoid this.
5. **Hidden attrition signal** — Marcus traces a single bad settlement to $80K in lost gross over 18 months when an agent quietly stopped routing. The cost is invisible to Greenroom.
6. **Asymmetric finalization** — Sarah opens settlement statements "as a black box in the morning." The dispute thread runs through email three business days after signoff.

---

## The realistic choices I considered

I mapped each candidate feature to the themes it would address. ✓ = primary mechanism, ◐ = partial.

| Option | T1 abandonment | T2 trust | T3 ambiguity | T4 premature sync | T5 attrition | T6 asymmetric | RICE |
|---|---|---|---|---|---|---|---|
| F2 alone (audit statement) | ◐ | ✓ | — | — | ◐ | — | 612 |
| F1 alone (vs engine) | ✓ | — | — | — | ◐ | — | 377 |
| F5 alone (expense hub) | — | — | — | ✓ | — | — | 65 |
| F4 (Wednesday risk flag) | — | — | ◐ | ◐ | — | — | 167 |
| F7 (TM mobile preview) | — | ◐ | — | — | — | ✓ | 153 |
| **F0 + F1 + F2 (chosen)** | **✓** | **✓** | **✓** | ◐ | **✓** | ◐ | 612+377+285 |

The honest read: no slice covers all six themes. The question is which 4–5 themes are *causally linked* and therefore have to be addressed together.

---

## Why F0 + F1 + F2 wins

**Themes 1, 2, 3, and 5 are the same problem.** Functional abandonment (T1) is caused by inability to handle the dominant deal type (engine gap) AND lack of trust artifact (T2). The trust deficit is caused by ambiguity in deal terms (T3) AND opaque math output. The hidden attrition (T5) is the downstream consequence of failures rooted in T2 and T3. These four themes form one causal chain — and that chain collapses into a single worked example: **Coastal Spell**.

The Coastal Spell dispute is the simultaneous test of all four:
- T1: vs deal — engine can't handle it today.
- T3: marketing-recoup ambiguity (`"$900 against gross"` + an explicit cap) — the parser must force the choice at deal entry.
- T2 + T5: the dispute exists because Mariana had no traceable audit trail to point at. $720 + agent goodwill + the third repeat with WME this year.

A slice that addresses T2 without T3 (F2 alone) ships better display of math we still can't run. A slice that addresses T1 without T2 (F1 alone) ships correct math the TM can't verify. A slice that addresses neither (F5 alone) ships a faster Wednesday but leaves the 2am dispute pattern fully intact. **F0 + F1 + F2 is the smallest slice that breaks the causal chain end-to-end.**

The DB sizes the prize: this chain affects 62.6% of deals, 88% of disputes, and $1.6M in artist payouts that currently move through the tool with no audit trail.

---

## The tradeoff I'm explicit about

T4 (premature sync) and T6 (asymmetric finalization) are real and they affect the same users. I'm not addressing them in this slice.

- **T4 — premature sync** is best solved by F5 (Centralized Expense Hub). Independent of F0/F1/F2; can ship in parallel. RICE 65, but Mariana's "that alone would change my life" suggests Impact is undercounted at 1. **Next ship.**
- **T6 — asymmetric finalization** is best solved by F7 (TM agent-side preview). Depends on F2's audit-trail data being valuable to the TM — that's exactly what the validation plan tests. **Ship after F2 proves out.**

The right ordering is: break the causal chain first (F0/F1/F2), then attack the workflow problem (F5) in parallel, then the cross-party collaboration problem (F7) once we have the data layer it depends on.

---

## What I rejected, and why

- **F2 alone** — defensible as the lowest-risk option, and I do ship it first within the slice for that reason. But on its own it ships display polish to the 18% who already trust the tool. Doesn't break T1, T3, or T5.
- **F5 alone** — closes the highest-empathy theme (T4) but leaves the abandonment cycle intact. Mariana would still need a Google Sheet at 2am — she'd just gather the expenses faster.
- **F4 (Wednesday risk flag)** — addresses T3 partially (catches ambiguity at deal entry) but produces no calculation, no statement, no audit trail. Half-finished pipe.
- **F7 (TM preview)** — addresses T6 elegantly, but depends on the F2 data layer that doesn't exist yet. Wrong sequence.

---

## Closing

The bet is that **trust is the actual product** (Theme 2), and trust requires three things working together: a deal email that can't lie about its own terms (F0), an engine that produces the same number the spreadsheet would (F1), and an audit trail the TM can verify in front of Mariana at 2am (F2). The themes from the research aren't six separate problems — they're two clusters. The first cluster (T1, T2, T3, T5) is one knot. F0 + F1 + F2 unties it. The second cluster (T4, T6) is the next ship.

---

## Addendum — Final submission pass

The slice as originally framed was vertically narrow on purpose: prove the full chain end-to-end on the canonical Coastal Spell dispute, accept a Coastal-only product surface around a vs-shaped engine. The submission pass widened the mouth without changing the slice's strategic bet:

- **F0 covers any vs show, not just Coastal-shaped emails.** Deal-record fallbacks (`mergeDealRecordFallbacks`) fill `guarantee_amount`, `artist_percent`, `expense_cap`, and gross-threshold bonus rows from the deal row when the prose was silent. The form became a generic `parsed.ambiguities.map(...)` loop with a per-id `deductionAmounts` state — the next ambiguity type adds a parser emitter, not a UI card. This is what moves the slice from "one show works" to "the same pipeline lights up for the 188 vs deals in the DB."
- **F2 gets honest line-by-line traceability.** Each worksheet row carries a running balance, a cap-status badge (`pre-cap` / `in cap` / `cap binds` / `at cap` / `within cap` / `absorbed`), and at boundary cases (Coastal's exact numbers) an explicit "in-cap bucket → cap" row that's emitted *even when savings = 0*. The point of F2 is that a TM at 2am can answer Diego's questions without asking Mariana; silently skipping the cap row when it doesn't move money was the opposite of that.
- **What was deliberately *not* done in this pass.** Engine extensions for net-basis deductions, net-basis bonus tiers, and merging non-gross-threshold rows from `bonusesJson` — those touch the math, would need new fixtures, and have a real regression surface. They were named explicitly as "Phase B" and sequenced for a later pass. The bet of this pass: widen the input surface and deepen the audit trail without putting the engine math at risk. 18 tests assert it (12 engine + 4 parser + 2 blocker).
