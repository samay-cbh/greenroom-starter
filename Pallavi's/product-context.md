# Product Context

Deeper reference for the Greenroom case study. CLAUDE.md is the always-loaded summary; this file is read on demand when I need detail. Anything covered in CLAUDE.md is intentionally not repeated here.

---

## Settlement as of today (we need to verfiy this from the codebase or actual UI)

**Only ~18% of customers actively use the in-app settlement tool. The other 82%, including most larger venues, default to spreadsheets.**

 **The majority of deals at The Crescent fall outside what the tool can settle** (derived from deal mix: ~63% are Vs, % of net, or door variants the in-app calculator does not handle).

The starter codebase reflects the current state of Greenroom's product. It's a working settlement product, in the sense that it does some things:

- It models deal terms (deal type, guarantee, percentage, expense caps, hospitality caps, structured bonuses) and stores them per-show.
- It tracks ticket sales from the integrated POS.
- It captures show expenses by category.
- It records comps with per-category counting rules.
- It runs settlement math for Flat and % of Gross deals end-to-end.
- It has a settlement lifecycle — draft, submitted, in review, signed, disputed, revised, finalized, paid — visible per settlement.
- It supports recoup line items as part of the settlement, with agreed/disputed/withdrawn status.

It also fails to do a lot of things:

- The most common deal type at venues like The Crescent — Vs deals (guarantee vs % of net) — isn't supported by the in-app calculator. 
- Neither are % of net, door deals, walkout pots, or tier ratchets. 
- The structured fields don't capture the nuance bookers and agents negotiate in prose. 
- Mariana enters deals as long-form notes because the structured fields don't model the actual deals well.
- Disputes happen. Last March, a $720 concession was made on a Coastal Spell show after a marketing-recoup interpretation went sideways with WME. 
- The full email thread is in the repo at data/dispute-thread.md.

---

## By the numbers (from `/reports`, past 24 months at The Crescent)

Source: the `/reports` page in the running app, computed by `getReports()` in `lib/queries.ts`. All figures are past-show only (the time-gating note below applies).

**Volume**

- 501 past shows, 501 deals, 501 settlements
- $3.18M gross box office, $1.90M paid to artists (~60% of gross)

**Deal mix (n=501)**

Tool-supported total: ~37%.

Unsupported: ~63%. (This is the source of the "majority of Crescent deals" claim above.)

- Vs: 175 (34.9%) — not supported in tool
- % of net: 112 (22.4%) — not supported
- Door: 29 (5.8%) — not supported
- % of gross: 12 (2.4%) — supported
- Flat: 173 (34.5%) — supporte

**Settlement lifecycle (n=501)**

- Paid: 429 (85.6%)
- Finalized: 31 (6.2%) — these went through dispute and are now paid
- Disputed: 20 (4.0%) — currently sitting in dispute
- Voided: 9, Signed: 7, Submitted: 3, Revised: 1, In review: 1
- Settlements that touched a dispute branch (disputed + revised + finalized): 52, or ~10.4%

**Recoups**

- 68 of 501 past settlements carry recoup line items (~13.6%)
- Recoup interpretation is the dispute pattern Coastal Spell exemplifies

**Comps (11,595 tickets, $251K face value foregone)**

- Artist guest list: 5,309 (46%)
- Venue staff: 2,802 (24%)
- Press: 1,321 (11%)
- Promo / radio: 1,005 (9%)
- Label / management: 869 (8%)
- Sponsor: 289 (2%)

**Bonuses**

- 122 of 501 deals (~24%) carry structured bonuses in `bonuses_json`. An unknown number more sit only in `deal_notes_freetext`.

---

## Settlement is several problems wearing one name

The brief is explicit that "settlement" is a bundle. Need to pick one slice or a tightly coupled pair; do not try to fix the whole thing.

1. **Deal modeling**: the schema does not fit the deals Mariana signs. Prose in `notes_freetext` is the source of truth.
2. **Audit trails**: tour managers and agents cannot trace settlement numbers back to source documents, so trust erodes.
3. **Real-time prediction**: Mariana wants to know what the artist will take home before the night ends, not after.
4. **The 2am walkthrough conversation**: the live negotiation across the desk with the tour manager.
5. **Agent communication**: the post-show loop. Sign-offs, recoup line items, dispute escalation.
6. **Dispute resolution**: the Coastal Spell pattern (see below). Recoup interpretation is the most common dispute driver.

## Important points to note

- The deal  **notes_freetext**  field is the truth.
- Structured fields below are filled inconsistently - Why? - because Mariana can't fill them correctly because of tools's limiattions. This is a real. 
  - guarantee_amount
  - percentage
  - bonuses_json
  - expense_cap
- Type of Vs deals (all of these apps doesn't support)
  - 1/3 of Vs deals are "standard" 
  - rest in a mix of walkout pots, tier ratchets, and vs-gross variants.
- Another source of truth is the data at data/greenroom.db - need to inspect this and bring skepticism to anything that seems clean.

Understant that The surface-level view is incomplete, andmine or find the missing information to make the product design.

## Important data realities

The data is intentionally messy. The brief: *"What the UI shows you isn't always what the data says, and neither is necessarily what actually happened."*

- `deals.notes_freetext` is the truth. Structured fields drift.
- Vs deals come in flavors the schema does not represent well.
- Status fields can contradict reality. Example from the brief: a settlement showing `Disputed` in the UI may have artist/agent sign-off text reading "Looks good, TM." Reading past the badge to the underlying data is part of the test.
- Patterns hide across many shows that look unremarkable in isolation.

Practical rule: when reasoning about a slice, query `data/greenroom.db` directly. Do not trust the UI alone. Cross-reference structured fields, prose notes, and counterparty-visible artifacts (transcripts, dispute threads).

Note on time-gating: the seed populates full financial data for every show, past and future. The query layer in `lib/queries.ts` hides future-show data from the UI. That is case-study plumbing, not a product design statement. When querying the DB directly, filter to past shows only if I want to reason about what Mariana actually sees.

## Settlement lifecycle (state machine)

Source: `lib/settlementStage.ts` (see `nextStages` for allowed transitions).

- Happy path: `draft → submitted → in_review → signed → paid`
- Dispute branch: `in_review → disputed → revised → finalized → paid`
- Re-dispute is allowed: `revised → disputed` (loop until accepted)
- Terminal off-ramp: `voided`, reachable from `draft`, `submitted`, or `disputed`

Non-obvious detail: `signed` is artist-team approval before money moves. The `finalized` stage only appears on the post-dispute path. A clean, undisputed settlement skips `finalized` and goes `signed → paid`.

## Recoup mechanics

- Recoups live on the settlement record as `recoups_json`.
- Each line item carries a category. Common: `marketing`, `hospitality_overage`, `production_overage`.
- Each line item has a status: `agreed`, `disputed`, or `withdrawn`.
- Recoup interpretation is the canonical dispute driver. Coastal Spell is the case-study example.

---

---

## The 2am scene (the moment to design for)

It's 2:14 a.m. on a Sunday in Nashville. Mariana Reyes is sitting in the back office of The Crescent with a cup of coffee that's been cold for an hour and a Google Sheet open on her laptop. The headliner just played a 70-minute set, the load-out crew is moving cases, and her phone has nine unread messages from the artist's tour manager. She's trying to settle the show.

The tour manager wants to know what the artist is taking home. 

The room is a 650-capacity indie rock listening room with 

- a Vs deal: $5,000 guarantee versus 80% of net after expenses, whichever is greater. 
- Mariana has 
  - the gross from the box office system. 
  - the fees the ticket platform takes. 
  - a stack of receipts on the desk for sound, lights, hospitality, marketing.In-app is limited so :- She doesn't have a clean way to do the math, so she's typing numbers into rows and watching the cell at the bottom recalculate. There's an item the booking agent flagged in the deal email — something about a marketing recoup — that the spreadsheet doesn't know how to handle, so she's eyeballing it. If she gets it wrong by $300 in the artist's favor, the venue eats the difference. If she gets it wrong by $300 the other way, she's getting an angry email from the agent on Monday. And worse, the tour managers can’t see the details behind the settlement numbers and lose trust in the venue if they can’t trace everything back.

She's been doing this for four years. She knows what she's doing. She also knows that the in-app tool inside Greenroom — the product that's *supposed* to help her — can't handle the deal she just signed. So she's in a spreadsheet, like she is most weeks.

---

---

## Where to find context


| Path                            | What it is                                                                              |
| ------------------------------- | --------------------------------------------------------------------------------------- |
| `data/ceo-memo.md`              | Pri's Q4 memo. The strategic frame.                                                     |
| `data/dispute-thread.md`        | The Coastal Spell email chain.                                                          |
| `data/transcripts/mariana.md`   | Booker interview. Primary user.                                                         |
| `data/transcripts/marcus.md`    | GM interview. Venue ops.                                                                |
| `data/transcripts/diego.md`     | Tour manager interview. Artist-side counterparty.                                       |
| `data/transcripts/sarah-kim.md` | WME agent interview. Deal-negotiation and dispute lens.                                 |
| `data/greenroom.db`             | 24 months of synthetic operational data. Inspect with `npm run db:studio` or `sqlite3`. |


---

## Key product surfaces (routes)


| Route                | What it is                                                                                            |
| -------------------- | ----------------------------------------------------------------------------------------------------- |
| `/shows`             | Mariana's home view. 24 months of past shows, searchable, grouped by month.                           |
| `/shows/[id]`        | Show detail. Deal terms, artist, ticket sales, expenses, comps.                                       |
| `/shows/[id]/settle` | The settlement worksheet. Try a Vs deal and a Flat deal; the asymmetry is the point.                  |
| `/artists`           | Roster, bucketed by frequency (A-tier through D-tier).                                                |
| `/reports`           | Aggregate metrics. What Pri watches: lifecycle distribution, dispute rates, deal mix, recoups, comps. |
| `/context`           | In-product candidate orientation.                                                                     |


