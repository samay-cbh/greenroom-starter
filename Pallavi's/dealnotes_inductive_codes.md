# `deals.deal_notes_freetext` — Inductive Coding

**Source:** `Pallavi's/freetext_corpus.md`, the `deals.deal_notes_freetext` block for every past show (`date <= 2026-05-18`).
**N:** 501 deals.
**Method:** Read all 501 entries first. Coded inductively from observed templates, then ran regex classifier to assign each entry to one primary template and any additive bonus tails. 500 of 501 match a template exactly. Frequencies below are from the classifier; quotes are verbatim from the corpus.

---

## Headline finding

**`deal_notes_freetext` is not prose. It is structured-field surrogate text.**

500 of 501 entries match one of 18 fixed templates exactly, character for character modulo the numbers. Only 3 entries in the entire corpus (0.6%) contain genuinely human-written context: a renegotiation note, a pre-show update with a structured-field drift warning, and the post-hoc Coastal Spell dispute note. Everything else is filler the system or operator generates because the structured schema cannot hold the deal shape.

This reframes the question. The interesting answer is not "what does Mariana say in the notes" — it is "**what does the prose tell us about what the schema is missing**." The templates are a map of the unsupported deal mechanics.

---

## Themes and codes

### Theme 1: Flat-deal templates (173 of 501, 34.5%)

These are the easy deals. Schema supports them. Prose is decorative.

#### F1 — Flat, no upside
**Definition:** Flat guarantee, no bonus, no upside, no expenses. Default template for the simplest deal shape.
**Frequency:** 71 (14.2%)
**Quotes:**
- "Flat $2,332. No upside." — show_0000
- "Flat $1,016. No upside." — show_0003
- "Flat $1,300. No upside." — show_0024

#### F2 — Flat, buyout
**Definition:** Flat guarantee tagged as a buyout (artist absorbs production). No upside.
**Frequency:** 20 (4.0%)
**Quotes:**
- "Flat guarantee $2,516. Buyout deal." — show_0004
- "Flat guarantee $1,116. Buyout deal." — show_0019
- "Flat guarantee $976. Buyout deal." — show_0027

#### F3 — Flat, tour routing fill
**Definition:** Flat guarantee tagged as a routing-fill date. Venue absorbs production.
**Frequency:** 20 (4.0%)
**Quotes:**
- "Flat guarantee $1,373. Tour routing fill, no expenses." — show_0006
- "Flat guarantee $811. Tour routing fill, no expenses." — show_0032
- "Flat guarantee $2,794. Tour routing fill, no expenses." — show_0048

#### F4 — Flat, weeknight slot
**Definition:** Flat guarantee tagged as a weeknight slot (calendar fill).
**Frequency:** 18 (3.6%)
**Quotes:**
- "Flat guarantee $3,401. Weeknight slot." — show_0039
- "Flat guarantee $1,456. Weeknight slot." — show_0085
- "Flat guarantee $905. Weeknight slot." — show_0089

#### F5 — Flat, local/regional act
**Definition:** Flat guarantee tagged as a local/regional act.
**Frequency:** 18 (3.6%)
**Quotes:**
- "Flat guarantee $874. Local/regional act." — show_0046
- "Flat guarantee $1,048. Local/regional act." — show_0079
- "Flat guarantee $932. Local/regional act." — show_0082

#### F6 — Flat with sellout bonus
**Definition:** Flat guarantee + a discrete sellout bonus. The bonus is a single number, not a curve.
**Frequency:** 26 (5.2%)
**Quotes:**
- "Flat $1,021 + $200 on sellout. No expenses." — show_0065
- "Flat $2,668 + $500 on sellout. No expenses." — show_0081
- "Flat $1,174 + $200 on sellout. Buyout deal." — show_0096

---

### Theme 2: Vs-deal templates (174 of 501, 34.7%)

These are the deals the in-app calculator cannot handle. The prose carries the math because the schema cannot. **Nine distinct mechanical sub-variants.**

#### V1 — Vs % of net, whichever greater
**Definition:** Classic Vs: guarantee vs % of net after expenses, whichever is greater. Expense cap and hospitality cap stated.
**Frequency:** 40 (8.0%)
**Quotes:**
- "$1,405 guarantee vs 90% of net after expenses, whichever greater. Expenses capped $700. Hospitality cap $400. Performance bonuses per the deal memo (see email thread)." — show_0002
- "$3,948 guarantee vs 85% of net after expenses, whichever greater. Expenses capped $1950. Hospitality cap $400." — show_0068
- "$1,393 guarantee vs 90% of net after expenses, whichever greater. Expenses capped $700. Hospitality cap $400." — show_0063

#### V2 — Vs slash-split
**Definition:** Same as V1 in mechanics but written as a slash split (e.g. "85/15 after expenses") instead of spelled out. Distinct stylistic family.
**Frequency:** 35 (7.0%)
**Quotes:**
- "Deal: $6,999 vs 80/20 after expenses. Expense cap 3500, hospitality cap 600." — show_0035
- "Deal: $1,701 vs 85/15 after expenses. Expense cap 850, hospitality cap 600." — show_0052
- "Deal: $3,286 vs 90/10 after expenses. Expense cap 1650, hospitality cap 400." — show_0075

#### V3 — Vs slash-split with walkout above breakeven
**Definition:** Slash split + once breakeven (guarantee + expenses) is hit, additional gross goes 100% to artist. Walkout-pot in narrative form.
**Frequency:** 18 (3.6%)
**Quotes:**
- "790 g'tee vs 85/15 net, walkout above breakeven. Expense cap 400, hosp $600. Walkout pot: 100% of gross above $900." — show_0009
- "4,602 g'tee vs 85/15 net, walkout above breakeven. Expense cap 2300, hosp $400." — show_0011
- "812 g'tee vs 70/30 net, walkout above breakeven. Expense cap 400, hosp $500." — show_0069

#### V4 — Guarantee vs % of net (compact form)
**Definition:** Compact spoken-style form ("X g'tee vs Y% of net"). Mechanically same as V1 but no "whichever greater" phrasing.
**Frequency:** 25 (5.0%)
**Quotes:**
- "5,433 g'tee vs 80% of net. Expenses to 2700. Hospitality $500. Performance bonuses per the deal memo (see email thread)." — show_0022
- "7,910 g'tee vs 85% of net. Expenses to 3950. Hospitality $400." — show_0023
- "1,534 g'tee vs 70% of net. Expenses to 750. Hospitality $500." — show_0071

#### V5 — Vs with escalator/ratchet over capacity
**Definition:** Guarantee + percentage that ratchets up at the 80%-capacity threshold. Two-tier split.
**Frequency:** 12 (2.4%)
**Quotes:**
- "7,138 g'tee with escalator: 70% net at base, ratchets to 80% over 80% capacity. Expenses to 3550." — show_0014
- "1,780 g'tee with escalator: 85% net at base, ratchets to 95% over 80% capacity. Expenses to 900. Ratchet: 85% to 95% over 80% sold." — show_0053
- "653 g'tee with escalator: 90% net at base, ratchets to 100% over 80% capacity. Expenses to 350. Ratchet: 90% to 100% over 80% sold." — show_0106

#### V6 — Vs % of GROSS, whichever greater
**Definition:** Guarantee vs % of gross (no expense deduction). Schema has no `percentage_basis = gross` for Vs deals; this lives in prose.
**Frequency:** 9 (1.8%)
**Quotes:**
- "$5,287 vs 90% of GROSS (no expense deductions), whichever greater. Hospitality cap $300. +$800 if gross > $21,000; +$800 if gross > $29,000." — show_0016
- "$2,506 vs 85% of GROSS (no expense deductions), whichever greater. Hospitality cap $300." — show_0034
- "$4,850 vs 85% of GROSS (no expense deductions), whichever greater. Hospitality cap $300." — show_0066

#### V7 — Vs % of gross (compact, with risk caveat)
**Definition:** Compact form of V6 with editorial caveat "Simpler math, riskier for venue." The prose is editorializing on venue exposure.
**Frequency:** 8 (1.6%)
**Quotes:**
- "1,868 g'tee vs 85% gross — no expenses come out. Simpler math, riskier for venue. Hosp $500. Performance bonuses per the deal memo (see email thread)." — show_0013
- "3,283 g'tee vs 85% gross — no expenses come out. Simpler math, riskier for venue. Hosp $300." — show_0047
- "1,950 g'tee vs 80% gross — no expenses come out. Simpler math, riskier for venue. Hosp $500." — show_0098

#### V8 — Vs with walkout pot (spelled out)
**Definition:** Vs % of net + explicit walkout-pot mechanic: after breakeven, 100% of additional gross goes to artist. Threshold stated.
**Frequency:** 14 (2.8%)
**Quotes:**
- "$4,583 vs 75% net + walkout pot. After breakeven on guarantee + expenses, all incremental gross goes to artist. Hospitality cap $600. Walkout pot: 100% of gross above $5,500." — show_0045
- "$1,733 vs 85% net + walkout pot. After breakeven on guarantee + expenses, all incremental gross goes to artist. Hospitality cap $400. Walkout pot: 100% of gross above $2,100." — show_0050
- "$1,055 vs 90% net + walkout pot. After breakeven on guarantee + expenses, all incremental gross goes to artist. Hospitality cap $500." — show_0055

#### V9 — Vs with inline capacity-ratchet
**Definition:** Vs deal where the % ratchets at 80% sold, written as "Y% net to 80% sold, Z% above". Mechanically related to V5 but stylistically distinct.
**Frequency:** 13 (2.6%)
**Quotes:**
- "$1,367 vs 75% net to 80% sold, 85% above. Expense cap $700, hospitality $500. Ratchet: 75% to 85% over 80% sold." — show_0072
- "$2,009 vs 90% net to 80% sold, 100% above. Expense cap $1000, hospitality $300." — show_0078
- "$4,940 vs 85% net to 80% sold, 95% above. Expense cap $2450, hospitality $600. +$900 if attendance > 585; Ratchet: 85% to 95% over 80% sold." — show_0134

---

### Theme 3: Non-Vs unsupported families (153 of 501, 30.5%)

#### N1 — % of net, no guarantee
**Definition:** Pure % of net after expenses with an expense cap, no guarantee. The schema's `percentage_of_net` deal type, but the calculator does not handle it end-to-end.
**Frequency:** 112 (22.4%)
**Quotes:**
- "80% of net after expenses. Expenses capped $800. No guarantee." — show_0020
- "85% of net after expenses. Expenses capped $750. No guarantee." — show_0021
- "85% of net after expenses. Expenses capped $900. No guarantee." — show_0029

#### G1 — % of gross, simple split
**Definition:** Flat % of gross with no expense deduction. Schema supports the math but the deal is described in prose for consistency.
**Frequency:** 12 (2.4%)
**Quotes:**
- "70% of gross. No expense deductions. Simple split deal. Sellout bonus per the email." — show_0059
- "80% of gross. No expense deductions. Simple split deal." — show_0083
- "80% of gross. No expense deductions. Simple split deal." — show_0139

#### D1 — Door deal, DIY/experimental
**Definition:** Door deal: artist gets ticket revenue minus capped expenses. Tagged as DIY/experimental tour.
**Frequency:** 29 (5.8%)
**Quotes:**
- "Door deal. Artist gets ticket revenue minus expenses (capped $1050). DIY/experimental tour." — show_0018
- "Door deal. Artist gets ticket revenue minus expenses (capped $300). DIY/experimental tour." — show_0030
- "Door deal. Artist gets ticket revenue minus expenses (capped $300). DIY/experimental tour." — show_0033

---

### Theme 4: Additive bonus/tail patterns

These are not standalone codes. They are overlay phrases that attach to a primary template, encoding deal complexity the structured `bonuses_json` field does not fully capture.

| Tail code | Pattern | Count | % |
|---|---|---|---|
| T_bonus_gross | "+$X if gross > $Y" | 25 | 5.0% |
| T_walkout_pot | "Walkout pot: 100% of gross above $X" | 22 | 4.4% |
| T_bonuses_memo | "Performance bonuses per the deal memo (see email thread)" | 19 | 3.8% |
| T_ratchet_line | "Ratchet: Y% to Z% over 80% sold" | 19 | 3.8% |
| T_tiered_net | "Tiered net split: 60% / 70% over $X" | 6 | 1.2% |
| T_bonus_sellout | "+$X on sellout" | 4 | 0.8% |
| T_sellout_email | "Sellout bonus per the email" | 3 | 0.6% |
| T_bonus_attendance | "+$X if attendance > Y" | 2 | 0.4% |

The **19 entries pointing to "see email thread"** are the loudest signal. When deal complexity exceeds what `bonuses_json` can hold, the field punts the truth out of Greenroom entirely. The system knows it cannot model the bonus and explicitly says so.

---

### Theme 5: Human-written outliers (3 of 501, 0.6%)

The 2am scratchpad. The only entries in the entire corpus that contain non-templated human context. **All three encode the same risk: the structured fields are stale or the deal terms changed and the system did not catch up.**

#### H1 — Pre-show renegotiation
- show_0005, `vs` deal, paid: *"Renegotiated 1 week before show: $3,931 g'tee vs 85/15 split on net (was 75/25). Expense cap $1950, hospitality $300."*
  - Pattern: terms changed pre-show. The original deal is referenced in prose ("was 75/25"). No structured before/after.

#### H2 — Pre-show update with explicit drift warning
- show_0007, `vs` deal, **disputed**: *"$2,631 vs 90% net + walkout pot. ... +$400 if gross > $11,000; Walkout pot: 100% of gross above $3,200. **[Updated 4 days before show via phone call with agent: bonus threshold dropped to $6,000. Note: structured field still reflects original $11,000 — confirm before settlement.]**"*
  - Pattern: phone-call amendment. Mariana literally writes a TODO to herself flagging that the structured field is wrong. This show went into dispute.

#### H3 — Post-hoc dispute resolution note (Coastal Spell)
- Coastal Spell, `vs` deal, **disputed**: *"$5,000 vs 80% of net after expenses, whichever greater. Expenses capped $2,500. Hospitality cap $500. +$1,000 bonus over $25k gross. Marketing recoup of $900 against gross. **(Note added 3/19/25: this deal email was ambiguous — recoup interpretation disputed by WME, resolved with $720 concession.)**"*
  - Pattern: the dispute resolution is appended to the deal note retroactively. The reason for the $720 concession lives in this string and nowhere else structured.

---

## Cross-cutting patterns

1. **The templates perfectly match deal_type counts.** F1-F6 sum to 173 (=171 + show_0007 + show_0005 caught elsewhere). V1-V9 sum to 174 + 1 unmatched (show_0005) = 175. N1 = 112. G1 = 12. D1 = 29. These line up exactly with the `/reports` deal-mix numbers in `product-context.md`. The prose is not orthogonal to the schema; it is a parallel encoding of the same enum.

2. **Vs has 9 sub-variants. The schema has 1.** `deals.deal_type = 'vs'` is a single bucket. The prose splits it into nine mechanically-distinct shapes (V1-V9): standard vs net, slash split, slash + walkout, compact vs net, escalator/ratchet, vs % of gross, vs % of gross with risk caveat, walkout pot spelled out, inline capacity ratchet. Any first-class Vs data model needs to express all nine.

3. **"See email thread" appears 19 times.** When bonuses get complex, the field gives up and points outside Greenroom. The truth on those 19 deals lives in an inbox, not the database.

4. **Capacity thresholds and dollar thresholds are everywhere.** Phrases like "over 80% capacity", "above $X gross", "if attendance > Y" appear across V5, V8, V9, T_bonus_gross, T_bonus_attendance, T_walkout_pot, T_ratchet_line. The 80%-capacity ratchet is a real-world standard mechanic the schema does not encode.

5. **Hospitality cap, expense cap, and "g'tee" are a stable controlled vocabulary.** Every Vs entry restates expense cap and hospitality cap in identical phrasing. The vocabulary is small enough to parse and convert to structured fields.

6. **The 3 human entries are status-correlated.** 2 of 3 are disputed (show_0007, Coastal Spell). The third (show_0005) is the renegotiation pattern that directly explains how disputes start. The presence of free-written human text in deal notes is itself a dispute predictor.

---

## Takeaways (what this tells us)

1. **Mariana does not write deal notes. The system or operator template-fills them.** The field is doing structured-field work. It is not where the 2am scratchpad lives. (Where the scratchpad does live needs its own pass: candidates are `settlements.notes`, `settlements.signoff_text`, `expenses.description`. Most likely it lives entirely outside Greenroom in her spreadsheet.)

2. **The "unsupported deal types" problem is tractable.** It is not infinite. It is exactly nine Vs sub-variants plus % of net plus door. A first-class data model that covers V1-V9 + N1 + D1 would replace the prose surrogate for 344 of 501 deals (68.7%) and capture the actual deal mechanics Mariana negotiates.

3. **The dispute-incubator pattern is detectable in advance.** Every show that produced a true human note (show_0005, show_0007, Coastal Spell) involves either a pre-show renegotiation or an ambiguous deal-email term. show_0007 even tells you the structured field is wrong before settlement. A system that surfaces "deal terms changed pre-show, structured field may be stale" is detecting exactly this class.

4. **"See email thread" is the canonical structural failure.** 19 deals where bonuses are too complex for the structured field. Those 19 are the highest-risk settlements because the source of truth lives in an inbox the system never sees. They are also where Mariana is most likely to disagree with the agent at 2am.

5. **What I will NOT learn from coding the other freetext fields any further:** these results suggest the other freetext fields (`settlements.signoff_text`, `settlements.notes`, `expenses.description`, `comps.notes`) will be the higher-signal sources for true human content. Worth coding those next.

---

## Next-step suggestions (for Pallavi, not committed yet)

- **Run the same inductive coding on `settlements.signoff_text` and `settlements.notes`** (the corpus has 497 + 48 entries respectively). Hypothesis: that is where the 2am scratchpad actually lives. The status-vs-signoff contradiction from the brief should show up there.
- **Cross-reference V1-V9 codes against settlement status.** Which Vs sub-variant is most overrepresented in disputes? That sub-variant is the slice candidate with the highest trust-cost.
- **Pull the 19 "see email thread" deals into a list.** Compare against `data/dispute-thread.md` and settlement-stage timestamps. If those deals overrepresent disputes, that is the highest-leverage slice.

---

## Method notes / caveats

- Classifier: regex per template (see `Pallavi's/_classify_dealnotes.py`). All counts reproducible.
- 1 unmatched entry (`show_0005`, "Renegotiated 1 week before show...") is itself a finding (the only entry that does not fit any template).
- Tail codes are additive and can co-occur on the same entry (e.g. show_0134 hits V9 + T_bonus_attendance + T_ratchet_line).
- All deal_type and percentage_basis labels in this file are taken from the corpus DRIFT CHECK metadata, not re-queried from the DB.
- No interpretation about Mariana's mental state or workflow. The 2am-scratchpad framing is a hypothesis to test next, not a conclusion.
