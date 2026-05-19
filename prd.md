# Settlement v2: vs Deal Engine + Calculation Transparency

**Status:** Draft  
**Author:** Anil (PM)  
**Date:** May 2026  
**Version:** 1.0  

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Problem](#2-problem)
3. [Current State](#3-current-state)
4. [Goals](#4-goals)
5. [Not Goals — This Slice](#5-not-goals--this-slice)
6. [Stakeholders](#6-stakeholders)
7. [Features — Current Slice](#7-features--current-slice)
   - [F0: AI Deal Term Parser](#f0-ai-deal-term-parser)
   - [F1: vs Deal Calculation Engine](#f1-vs-deal-calculation-engine)
   - [F2: Auditable Settlement Statement](#f2-auditable-settlement-statement)
8. [Features — Next Ship](#8-features--next-ship)
   - [F3: Structured Deal Terms](#f3-structured-deal-terms)
   - [F5: Centralized Expense Hub](#f5-centralized-expense-hub)
9. [Ship Later — Deferred Deal Types](#9-ship-later--deferred-deal-types)
10. [Feature Dependencies](#10-feature-dependencies)
11. [Success Metrics](#11-success-metrics)
12. [Risks](#12-risks)
13. [Open Questions](#13-open-questions)

---

## 1. Executive Summary

Greenroom's settlement tool was built when most deals were flat guarantees. The market has moved. 62.6% of deals — led by vs deals at 35.0% — cannot be calculated in-platform. The result: 82% of venues, including most large accounts, do settlement in spreadsheets. Greenroom processes $3.4M in gross box office with zero calculation audit trail on any settlement. Every disputed settlement in the dataset had already received positive TM signoff — meaning the current process provides false confidence, not real oversight.

This PRD covers three tightly coupled features (F0, F1, F2) that together unblock settlement for the majority of unsupported deal types and create the calculation audit trail the platform lacks today. Two follow-on features (F3, F5) address the upstream deal entry and expense aggregation problems that this slice depends on at the edges.

**North Star:** % of vs deals settled fully in-platform with non-null `calculation_json`  
**Baseline:** ~0%  
**Target:** 60% within 6 months of F0 + F1 + F2 launch

---

## 2. Problem

### By the numbers

| Signal | Value |
|--------|-------|
| Venues settling in spreadsheets | **82%** |
| Deal types unsupported by current engine | **62.6%** |
| Settlements with empty `calculation_json` | **100%** |
| vs deal dispute rate vs flat deal baseline | **7.5% vs 1.6% (4.6×)** |
| Disputes from unsupported deal types | **88% of all disputes** |
| Gross box office with no calculation audit trail | **$3.4M** |
| Revenue lost at The Crescent from one routing change | **$80K** |

### Why it matters

Settlement is the trust moment between the venue and the artist. Every show ends with it. When it goes badly, agents put venues on informal routing preference lists — silently downgrading them without explanation. The venue loses shows. The lease becomes harder to renew. The CEO's memo called settlement "the most important thing the product touches."

The Coastal Spell dispute illustrates the full failure chain: one ambiguous sentence in an 80-word deal email → $720 disputed at 2am → multi-day email thread → agent goodwill lost → routing risk. That chain begins with an unsupported deal type, runs through opaque math, and ends with no audit trail to resolve it cleanly.

> *"The way settlement works now is we're paying a tax on every poorly-written deal email we ever signed."*  
> — Marcus Holland, GM & Co-owner, The Crescent

> *"82% of our customer base defaults to spreadsheets. That's not a feature gap. That's an existential signal."*  
> — Pri Shankar, CEO, Greenroom

---

## 3. Current State

What exists in the codebase today. This determines what is a net-new build vs an extension.

| Area | Current behavior | Code reference |
|------|-----------------|----------------|
| Supported deal types | Flat guarantee, percentage of gross | `calculateSettlement()` returns `supported: true` |
| Unsupported deal types | vs deals, % of net, door — engine returns `supported: false` | `UnsupportedDeal` component shown; inputs displayed, math does not run |
| Free-text deal notes | `deal.dealNotesFreetext` field exists — plain text, not parsed | Shown read-only in unsupported deal view; no extraction |
| Calculation audit trail | `calculation_json` in schema, **null on all 537 settlements** | Engine never writes to this field |
| Settlement worksheet | `calc.steps[]` renders label/value rows for supported deals | Pattern exists for flat deals; no source provenance per line |
| Expense tracking | `absorbedByVenue` flag per expense; distinction exists | Not surfaced in the statement output |
| TM sign-off | `settlement.signoffText` and `settlement.notes` as free text | No structured per-line sign-off; no calculation version anchoring |
| Settlement lifecycle | 5 stages: Drafted → Submitted → Reviewed → Signed → Paid | Lifecycle bar exists; dispute state tracked |

**Key implication:** The skeleton is in place. `UnsupportedDeal` gates the right deal types. `dealNotesFreetext` is F0's input. `calculateSettlement()` and `calc.steps[]` are the F1/F2 foundation. `calculation_json` is in the schema. This is extension work, not a greenfield build.

---

## 4. Goals

### Goal 1 — Enable vs deal settlement fully in-platform
vs deals are 35.0% of all settlements and dispute at 4.6× the rate of flat deals. Mariana has maintained a parallel Google Sheet for four years because the engine cannot handle them.

**Measured by:** North Star — % of vs deals settled in-platform with non-null `calculation_json`

### Goal 2 — Eliminate the black-box settlement output
`calculation_json` is null 100% of the time. Greenroom processes $3.4M in gross box office with zero calculation audit trail on any settlement. TM signoff comments — "Looks good," "OK," "wire monday" — confirm mathematical validation is not happening. The Google Sheet works because every line is sourceable. The tool needs the same auditability.

**Measured by:** `calculation_json` population rate — target > 80% of all settlements

### Goal 3 — Reduce vs deal dispute rate toward flat deal baseline
vs deals dispute at 7.5% vs 1.6% for flat deals. 88% of all disputes come from unsupported deal types. Correct math + traceable output eliminates the primary dispute trigger.

**Measured by:** vs deal dispute rate — target < 2% (flat deal parity)

---

## 5. Not Goals — This Slice

These are confirmed problems that are explicitly deferred from this slice.

| Out of scope | Reason |
|-------------|--------|
| Expense integrations (POS, receipt upload) | F5 — next ship |
| Pre-show risk flagging / Wednesday view | F4 — later |
| Agent-side live settlement preview | F7 — later |
| Settlement audit log / in-room note capture | F6 — later |
| Percentage of net (standalone), door deals, walkout pots, tier ratchets | Ship later — see Section 9 |

---

## 6. Stakeholders

| ID | Group | Representative | Side | What they touch |
|----|-------|---------------|------|----------------|
| S1 | Greenroom (Product Co.) | Pri Shankar, Anil | Internal | Builds and owns the platform |
| S2 | Venue | The Crescent, Nashville | Customer | Primary paying customer |
| S3 | Venue Owner / Co-owner | Marcus Holland | Customer | Signs every settlement; makes lease and revenue decisions |
| S4 | General Manager | Marcus Holland (dual role) | Customer | Reviews settlements at 2am; monitors show margins |
| S5 | Lead Booker | Mariana Reyes | Customer | Primary Greenroom user; runs settlement end-to-end weekly |
| S6 | Staff | Production Mgr, Bar, Engineers | Customer | Generate expense inputs; do not use Greenroom directly |
| S7 | Tour Manager | Diego Velasquez (Pale Lake) | External | Sits across the table at settlement; signs off for the artist |
| S8 | Agent | Sarah Kim, Daniel Hwang (WME) | External | Negotiates deals; reads settlement statement next morning |
| S9 | Artist Manager | Coastal Spell Management | External | Receives final payout; looped in by agent post-settlement |
| S10 | Show Booking Agency | WME, CAA | External | Determines routing — which venues get strong shows |

---

## 7. Features — Current Slice

Three features form a pipeline: **Input (F0) → Calculation (F1) → Output (F2)**. Each feeds the next. F2 can ship first for existing flat-deal users to establish the display pattern and baseline metrics before F0 + F1 land.

---

### F0: AI Deal Term Parser

**Layer:** Input  
**Scope:** New capability  
**One-liner:** Extract structured deal fields from free-text emails, flag ambiguities, and require confirmation before math runs.

**Current state:** `deal.dealNotesFreetext` exists and stores the raw deal email. Currently shown as read-only text. No extraction, no structuring, no conflict detection.

#### Problem this solves

Deal emails are written at 11pm by overworked agents with no structure and no canonical storage. The same phrase reads differently to both sides. There is no single source of truth. The Coastal Spell dispute was caused by one sentence — *"expenses capped at $2,500, marketing recoup of $900 against gross"* — that could be read as the recoup being inside or outside the cap. Nothing forced a choice at deal entry. The cost: $720 + hours of email + agent goodwill + routing risk.

> *"Andrea's email last December was 80 words long and four of them were ambiguous and there's no version of the truth in our system. It's just in her head and ours."*  
> — Mariana Reyes, internal email after the Coastal Spell dispute

#### Primary user story

**As** a lead booker advancing a new show,  
**I want** to paste the deal email and have the system extract key terms — deal type, guarantee, %, expense cap, deduction order — and flag any phrase that can be read two ways,  
**So that** ambiguity is resolved by a Wednesday email to the agent rather than at 2am at the table, and I spend 30 seconds confirming rather than re-entering everything.

#### Secondary user stories

**Marcus Holland — GM:**  
When I sign off at 1am, I want to see that deal terms were AI-extracted and confirmed by Mariana — not just a raw email note — so I know the math ran against agreed, unambiguous inputs.

**Anil — PM:**  
When a deal phrase is ambiguous, I want the system to surface both interpretations and require a choice before saving, so the Coastal Spell-type dispute is resolved at deal entry, not settlement.

#### Acceptance criteria

1. Booker can submit free-text deal email text for extraction from the deal entry screen
2. AI extracts: deal type, guarantee amount, artist %, expense cap, bonus tier thresholds, and deduction order for each modifier (marketing recoup, hospitality cap)
3. Ambiguous phrases highlighted; two most-likely interpretations presented as a forced-choice — user must pick one before saving
4. Confirmed structured fields stored alongside original text — original preserved, not discarded
5. Extraction confidence shown per field — low-confidence fields flagged for manual review
6. Fields that cannot be extracted prompt manual entry with an inline example
7. Settlement math (F1) cannot be invoked until all required structured fields are confirmed
8. Confirmed deal terms snapshot stored in `calculation_json` at settlement time — provides linkback from statement to source

---

### F1: vs Deal Calculation Engine

**Layer:** Calculation  
**Scope:** Engine extension  
**One-liner:** Correctly calculate guarantee vs % of net after expenses, with configurable deduction ordering, expense caps, and bonus tiers.

**Current state:** `calculateSettlement()` returns `{ supported: false }` for vs deals. `UnsupportedDeal` renders inputs but no math runs. The formula and deduction ordering live in Mariana's Google Sheet, not the platform.

#### Problem this solves

62.6% of all deals — including 35.0% that are vs deals — cannot be calculated in-platform. vs deals processed $1.11M in artist payouts. Artists were paid an average of 90% above their negotiated guarantees, meaning the percentage calculation — not the guarantee floor — determines payment in the majority of cases. A calculation error at scale has direct, large dollar consequences.

> *"Your tool can't do those. So I tried using it for a while in 2023 and I'd hit a deal it couldn't handle and have to switch to the spreadsheet anyway, which meant I was doing the work twice. So now I just do it in the sheet."*  
> — Mariana Reyes, user interview

#### vs Deal Formula

Extracted from the Coastal Spell dispute thread (the live worked example in production):

```
Gross box office
− CC + platform fees        (always off gross, rate × gross)
− Pre-cap deductions        (e.g. marketing recoup if confirmed as gross deduction via F0)
− MIN(Expenses + in-cap deductions, Expense cap)
= Net

Absorbed expenses: excluded from expense total, surfaced separately in F2 output

Artist share  =  Artist% × Net
Artist payout =  MAX(Guarantee, Artist share)
```

The ambiguity that caused the Coastal Spell dispute reduces to one variable: is the marketing recoup a pre-cap deduction (Mariana's read) or an in-cap deduction (WME's read)? F0 forces this choice at deal entry. F1 reads the confirmed value.

#### Primary user story

**As** a booker settling a vs deal at midnight,  
**I want** the system to calculate the correct artist payout — MAX(guarantee, artist% × net after confirmed deductions) — with expense cap enforced and every step written to a retrievable record,  
**So that** I never open a Google Sheet for settlement again and can show the tour manager exactly how we got to the number without explaining it from memory.

#### Secondary user stories

**Diego Velasquez — Tour Manager:**  
When I see the settlement number, I want to verify it traces step-by-step through the deal terms I know — gross, less fees, less capped expenses, guarantee comparison — and sign off in under 5 minutes.

**Sarah Kim — Agent, WME:**  
When I open the settlement the next morning, I want the vs deal math to match my read of the deal, so I have no questions and can confirm with the artist's manager immediately.

#### Acceptance criteria

1. Engine handles: flat guarantee, percentage of gross, vs deal (guarantee vs % of net) — extends `calculateSettlement()` without breaking existing supported paths
2. Deduction ordering reads from confirmed deal terms (F0 output) — engine does not assume placement of modifiers like marketing recoup
3. Expense cap enforced as `MIN(actual expenses, cap)` — overage flagged as absorbed or passed-through per `expense.absorbedByVenue`
4. Bonus tiers evaluated: if gross exceeds threshold, higher % applies to the tier above; untriggered bonuses shown (pattern already exists for flat deals — extend to vs)
5. `MAX(guarantee, artist share)` comparison explicit in output — both values shown, winner labeled
6. Engine writes full `calculation_json` on every vs deal settlement — inputs, deduction sequence, net, percentage applied, guarantee comparison, final payout, and deal term snapshot at time of calculation
7. Rounding explicit and consistent — must match Mariana's spreadsheet rounding behavior (to be confirmed before eng start — see Open Questions)
8. Flat deal and % of gross paths unchanged — no regression on currently supported deal types

---

### F2: Auditable Settlement Statement

**Layer:** Output  
**Scope:** Enhancement  
**One-liner:** Show every calculation step in the order applied. Mark source per line item. Surface absorbed vs passed-through. Write `calculation_json` on every settlement.

**Current state:** `SupportedSettlement` already renders `calc.steps[]` as label/value rows for flat deals. `calc.finalFormula` shown in CardDescription. No source provenance per line, no absorbed/passed-through distinction in the output, `calculation_json` never written. For vs deals, this view does not render at all.

#### Problem this solves

The current tool outputs a final number. `calculation_json` is null 100% of the time across all 537 settlements covering $3.4M in gross box office. Tour managers won't sign what they can't verify. Agents dispute what they can't trace. TM signoff comments — "Looks good," "OK," "wire monday" — confirm that mathematical validation is not happening. These aren't endorsements of the math; they're evidence the TM had no basis to object.

> *"The settlement is half about the money, half about the proof. Every line in my spreadsheet has a sourceable breakdown — I can show the tour manager exactly where each number came from. They can see it. They sign off on it."*  
> — Mariana Reyes, user interview

> *"Provenance: I want to be able to trace each line to a source. The CC fees should match the POS. The expenses should tie to actual receipts I could ask for. I don't actually ask for the receipts most of the time, but I want to know they exist."*  
> — Sarah Kim, Agent, WME

#### Primary user story

**As** a booker presenting a settlement at midnight,  
**I want** the system to show every calculation step in the order applied — gross, each deduction with its type and cap status, the guarantee comparison, the final payout — so that when the tour manager asks "where did that number come from," I point to a line instead of explaining from memory, and the statement I email to the agent the next morning answers every question before it's asked.

#### Secondary user stories

**Diego Velasquez — Tour Manager:**  
On the drive between load-out and the back office, I want to pull up the settlement on my phone and review the full breakdown so I only need to discuss the lines I don't recognize — and we are done in 10 minutes instead of 45.

**Marcus Holland — GM:**  
When Mariana texts me the settlement to approve at 1am, I want to see the full calculation in the screenshot — not just the final number — so I can identify which line looks off and ask about it specifically, instead of approving on blind faith.

**Sarah Kim — Agent, WME:**  
When I receive the statement the morning after a show, I want every deduction itemized with its source — deal-term, POS-reconciled, receipt-backed — and absorbed items clearly marked, so I read it in 3 minutes and have no questions.

#### Acceptance criteria

1. `SupportedSettlement` extended to render vs deal results (F1 output) using the same worksheet format as flat deals
2. Each deduction line shows: label, amount, source type (deal-term / POS / receipt / manual-entry), and cap status (within-cap / at-cap / absorbed)
3. Absorbed expenses shown as a distinct section with `absorbedByVenue` flag — not silently omitted
4. Guarantee comparison row explicit: *"Artist share $X vs guarantee $Y — paying the higher"*
5. Statement is mobile-readable — Marcus can review and confirm from his phone without horizontal scrolling
6. PDF export preserves identical structure to on-screen view — what the TM signs is what the agent receives
7. `calculation_json` written on every settlement (flat and vs) — non-null, structured, versioned with deal term snapshot
8. TM signoff anchored to a specific calculation version — timestamp and statement version captured alongside `signoffText`

---

## 8. Features — Next Ship

These features are not in the current slice but are the highest-priority follow-ons. They address the upstream deal entry problem (F3) and the mid-week expense aggregation problem (F5) that this slice depends on at the edges.

---

### F3: Structured Deal Terms

**Layer:** Input  
**Scope:** New  
**RICE score:** 193 — Reach **340** (all venues entering deals), Impact 2, Confidence 0.85, Effort 3 person-months  
*(340 × 2 × 0.85) / 3 = 578 / 3 = 193. Reach corrected from 152 to 340 — CEO memo confirms 340 paying venues total; F3 affects all of them since it replaces the deal entry flow regardless of deal type.)*  
**Dependency:** Builds on F0 — after AI extraction has run for several months, the confirmed field vocabulary becomes the foundation for a native structured entry form

#### One-liner

Replace free-text deal entry as the primary input method with a structured form that forces explicit choices on every deal component — eliminating the upstream ambiguity that causes downstream disputes.

#### Problem this solves

F0 (AI parser) bridges the gap between how deals arrive today (free-text email prose) and how the engine needs them (structured fields). F3 changes the primary entry method so new deals are entered structured from the start. Over time, the need for F0 as a parsing layer decreases — F3 becomes the canonical way deals are written into Greenroom.

This directly addresses the pattern identified across all research: deal emails are written at 11pm by overworked agents with no tooling. When the venue enters the deal into Greenroom using a structured form, every ambiguity must be resolved at entry. The marketing recoup position, the deduction order, whether a bonus is based on gross or net — these become fields, not clauses.

> *"The deal email needed three more sentences to be unambiguous. They never got written because deal emails get written at 11pm by overworked agents. So the ambiguity gets pushed downstream into settlement, where it costs everyone more time."*  
> — Sarah Kim, Agent, WME

#### Primary user story

**As** a lead booker entering a new deal,  
**I want** a structured form that walks me through each deal component — deal type selector, guarantee field, percentage split, expense cap toggle, deduction order for each modifier — rather than a free-text notes field,  
**So that** every deal in the system has unambiguous machine-readable terms, and the math engine can run against them without an AI parsing step.

#### Secondary user stories

**Sarah Kim — Agent, WME:**  
When Mariana enters our deal into Greenroom, I want the structured terms to be shareable so we can confirm we're reading the same deal before show night — eliminating the "deal was a ghost" problem.

**Marcus Holland — GM:**  
When I review the deal before signing off on settlement, I want to see structured fields — not a wall of email text — so I can verify in 30 seconds that the inputs match what I agreed to.

#### Acceptance criteria

1. Structured deal entry form replaces free-text as the primary deal input path — `dealNotesFreetext` retained as a secondary notes field, not the primary source of truth
2. Form fields: deal type (selector), guarantee amount, artist %, expense cap (amount + toggle for whether it exists), deduction order for each modifier (marketing recoup: inside cap / outside cap / gross deduction)
3. Bonus tier entry: threshold amount, % above threshold, basis (gross / net)
4. Validation: cannot save a vs deal without guarantee, %, and expense cap — required fields enforced
5. Structured fields are the direct input to F1 (engine reads from these fields, not from parsed free text)
6. Backward compatible: existing deals with `dealNotesFreetext` and no structured fields continue to display as before; F0 AI extraction can be triggered from existing deals to populate structured fields
7. Deal term summary shown at settlement time alongside the calculation — "this math ran against these confirmed terms"

---

### F5: Centralized Expense Hub

**Layer:** Pre-settlement input  
**Scope:** New  
**RICE score:** 65 — Reach **279** (venues on spreadsheets with multi-source expense problem), Impact 1, Confidence 0.70, Effort 3 person-months  
*(279 × 1 × 0.70) / 3 = 195.3 / 3 = 65. Reach corrected from 88 to 279 — the 82% of venues currently on spreadsheets are the ones juggling expenses across 5 systems. ⚠️ Impact is logged at 1 here but Mariana's quote — "that alone would change my life" — may warrant revisiting this upward. Confirm Impact rating before next planning cycle.)*  
**Dependency:** Independent of F0/F1/F2 — can be built in parallel; increases F4 (pre-show risk flagging) value significantly when ready

#### One-liner

A single expense workspace per show where all categories are collected before Friday night — eliminating the half-Wednesday Mariana currently spends chasing expenses from five separate systems.

#### Problem this solves

Settlement inputs are scattered across five disconnected systems. The booker is the manual integration layer — and the time cost lands mid-week, not at settlement.

> *"The CC fees are in Greenroom. The bar charges are in the POS. The hospitality is in receipts that the production manager throws on my desk. The sound and lights are pre-set deal terms but sometimes the engineer adds something. The marketing is wherever I logged it that week. Half my Wednesday is just chasing down expenses for shows that are going to settle on Friday."*  
> — Mariana Reyes, user interview

> *"If you could just have all the expenses ready when I sat down to settle, that alone would change my life."*  
> — Mariana Reyes, user interview

#### Primary user story

**As** a lead booker on a Wednesday afternoon,  
**I want** to open a show in Greenroom and see a single expense workspace where all categories are partially pre-populated — CC fees from Greenroom, production from deal terms, hospitality from whatever was logged — with clear gaps flagged for me to fill in,  
**So that** by Thursday I have all expenses confirmed and Friday night's settlement conversation starts with complete data rather than a mid-settlement phone call to the production manager.

#### Secondary user stories

**Marcus Holland — GM:**  
When I see a projected settlement preview before the show, I want the expense data to be complete and confirmed — not estimated — so I can ballpark the payout on Wednesday and have no surprises when Mariana texts me at 1am.

**Diego Velasquez — Tour Manager:**  
When I review the settlement breakdown on my phone, I want each expense line to have a source — deal-term pre-set, logged hospitality, production add-on — so I can distinguish what was agreed in advance from what was added on show night.

#### Acceptance criteria

1. Each show has an expense hub screen accessible from the show detail page before settlement night
2. Expense categories: CC + platform fees (auto-populated from ticket sales), bar/concessions (manual entry, v2: POS integration), hospitality (manual entry + receipt upload), production (pre-set from deal terms, overrideable), marketing (manual entry, carry-forward from deal), other (free-field)
3. CC fees auto-calculated from ticket sales data already in Greenroom — no manual entry required
4. Deal-term pre-set expenses (production, marketing cap) populated from confirmed deal terms (F3) or from `dealNotesFreetext` where structured fields don't exist
5. Completion indicator per show: % of expense categories confirmed — flag shows with incomplete expenses 48 hours before show date
6. Expense hub data flows directly into F1 calculation engine at settlement time — no copy-paste step
7. `absorbedByVenue` flag settable per expense line before settlement — Mariana can pre-mark the whiskey overage as absorbed on Wednesday, not defend it at 2am
8. v1 ships without POS integration — all non-CC categories are manual entry or receipt upload; POS integration is v2

---

## 9. Ship Later — Deferred Deal Types

These deal types are confirmed gaps in the platform. They are not in this slice or the next ship. Each has a defined reason for deferral.

| Deal type | Current status | Why deferred |
|-----------|---------------|-------------|
| Percentage of net (standalone) | `percentage_of_net` in schema; `UnsupportedDeal` shows it | Shares calculation components with vs deal engine — extend after vs is stable and tested |
| Door deals | `door` in schema; `UnsupportedDeal` shows it | Requires box office reconciliation logic specific to door-split structures; lower prevalence |
| Walkout potential (WOP) | Not in current schema | New concept requiring schema addition and a projected vs actual UI pattern; design work needed before backlog entry |
| Tier ratchets | Not in current schema | Multi-tier splits where artist % increases at gross thresholds; low confirmed prevalence in 537-settlement dataset; model after vs engine is stable |

---

## 10. Feature Dependencies

```
F0 (AI Parser) ──────────────────────────────────────────┐
        │                                                   │
        │ confirmed structured fields                       │ deal term snapshot
        ▼                                                   ▼
F1 (vs Deal Engine) ─────── calculation_json ───────► F2 (Auditable Statement)
        ▲
        │ expense data
F5 (Expense Hub) ──────────────────────────────────────────┘

F3 (Structured Deal Terms) → replaces F0 as primary input path over time
```

| Dependency | Why it matters |
|-----------|----------------|
| F0 → F1 | The engine reads confirmed structured fields. Without F0, deduction ordering is ambiguous — the engine cannot know whether marketing recoup is a gross deduction or inside the expense cap. |
| F1 → F2 | F2 is the display layer for F1's `calculation_json` output. F2 without F1 means the statement pattern exists but vs deal math still doesn't run. |
| F0 → F2 | The statement links to confirmed deal terms. Without F0, this reference does not exist — no canonical source of truth to point to. |
| F5 → F1 | Expense hub pre-populates expense data that F1 consumes. Without F5, Mariana manually enters expenses at settlement — F5 reduces this friction but is not a hard dependency. |
| **Decision: F2 ships first** | Land statement quality + `calculation_json` baseline for the 18% of flat-deal users before F0/F1 risk; F1 then plugs into a worksheet pattern already in production rather than landing alongside an unfamiliar display. |

---

## 11. Success Metrics

### North Star

**% of vs deals settled fully in-platform with non-null `calculation_json`**

- Baseline: ~0%
- Target: 60% within 6 months of F0 + F1 + F2 launch
- Measurement: `COUNT(vs deal settlements WHERE calculation_json IS NOT NULL) / COUNT(vs deal settlements)`
- Why the qualifier matters: without `non-null calculation_json`, a booker can manually enter a final number and satisfy the metric without the engine running. The qualifier makes it ungameable and validates F1 and F2 simultaneously.

### Primary Metrics

| Metric | Baseline | Target | Direction |
|--------|----------|--------|-----------|
| vs deal dispute rate | 7.5% | < 2% (flat deal parity) | Decrease |
| Median time: settlement opened → TM signoff | Untracked | < 20 minutes | Decrease |
| Calculation accuracy rate (tool payout vs wired amount) | Untracked | > 99% | Increase |

### Product Metrics

| Metric | Baseline | Target | Direction |
|--------|----------|--------|-----------|
| `calculation_json` population rate (all deal types) | 0% | > 80% of all settlements | Increase |
| Settlement abandonment rate | Untracked | < 5% | Decrease |

### Leading Indicators

| Indicator | Why it leads |
|-----------|-------------|
| vs deals with confirmed structured terms (F0) before show night | Venues entering structured terms are primed to use the engine on settlement night. Leads North Star by 2–7 days. |
| Calculation accuracy rate (tool payout vs wired amount) | Fastest signal that F1 is correct before disputes have time to surface. |
| TM signoff with calculation expanded/viewed before signing | Validates that F2 is producing meaningful review, not rubber stamps. |

### Guardrails

| Guardrail | Why |
|-----------|-----|
| Flat deal dispute rate | Ensure F1/F2 does not regress the 34.5% of deals currently working |
| Settlement tool error rate | If the engine throws errors, bookers return to spreadsheets — monitor from day 1 |

### Validation plan

Ship F0 + F1 + F2 to The Crescent first and observe the next three vs deal settlements end-to-end. The specific question to answer: **does Diego look at the worksheet steps and ask fewer questions than he does today?** The golden tests prove the math is correct; this validates whether the auditable view changes the settlement *conversation*. Concrete signals from those three settlements — clarifying questions raised at the table, time from settlement opened to TM signoff, follow-up emails the next morning, and whether Mariana opens the Google Sheet at any point. If all three settlements clear without sheet fallback and Diego's question count drops, expand to two more WME-heavy venues. If not, return to interview transcripts to find what the statement still doesn't surface before broadening rollout.

---

## 12. Risks

| Severity | Risk | Mitigation |
|----------|------|------------|
| **High** | AI extraction accuracy on edge-case deal language | Confidence scoring per field; low-confidence fields require manual review; original text always preserved; user confirmation is mandatory before math runs |
| **High** | Deduction ordering ambiguity not caught by F0 — engine produces wrong output silently | F1 must validate all required structured fields are confirmed before running; throw a structured error (not a silent wrong number) if any required field is unconfirmed |
| **Medium** | Calculation regression on existing flat deal paths | `calculateSettlement()` changes must pass existing test suite before merge; flat deal dispute rate is a guardrail metric monitored from day 1 |
| **Medium** | `calculation_json` schema version drift — future engine changes invalidate old records | Version field in `calculation_json` from day 1; store deal term snapshot alongside calculation so records are self-contained and re-runnable |
| **Low** | AI parser unavailable / high latency at venue on show night | F0 is a deal-advance feature — used on Wednesday, not at the settlement table. Parsing is not on the critical path for the Friday night session. |

---

## 13. Open Questions

| Question | Context |
|----------|---------|
| Which AI model / endpoint for F0 extraction? | Latency, cost, and deal-language fine-tuning considerations. Decision needed before F0 sprint starts. |
| What are the exact 10+ calculation paths in the production dataset? | F1 acceptance criteria requires handling all confirmed deal type + modifier combinations. Need a data export of `deal_type` + modifier fields from the 537-settlement dataset before engine spec is finalized. |
| What is the rounding convention in Mariana's spreadsheet? | F1 must match existing spreadsheet behavior on day 1 to avoid introducing payout discrepancies. Needs a data pull to confirm before eng starts. |
| How should walkout potential (WOP) be modeled in the schema? | WOP requires a projected payout before box office closes — a new concept. Needs schema design decision before it can enter the backlog. |
| TM mobile auth model for pre-review? | Diego's feature request (review on phone between load-out and back office) implies a shareable link or mobile-authenticated view. Out of scope for this slice but needs a decision before F7 (agent preview) is specced. |

---

## Appendix: One-line Engineering Handoff

Extend `calculateSettlement()` to handle vs deals using confirmed structured fields from `dealNotesFreetext` (via AI extraction + user confirmation in F0). Write `calculation_json` on every settlement. Extend the `SupportedSettlement` worksheet to show every step with source provenance per line item. Do not break existing flat-deal paths.
