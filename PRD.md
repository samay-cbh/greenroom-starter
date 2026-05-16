# Greenroom: Settlement Accuracy & Deal Integrity
## Product Requirements Document

**Scope:** Deal integrity → settlement accuracy  
**Persona:** Mariana Reyes, lead booker, The Crescent (independent music venue)  
**Problem statement:** The in-app settlement tool supports 37% of active deal types. The remaining 63% — including the most common complex structure (vs deals, 37% of volume) — return an "unsupported" empty state. Bookers default to Google Sheets at show night.

---

## The System Before

### What existed

The settlement engine (`lib/dealMath.ts`) handled two deal types:

| Deal type | How common | What happens |
|-----------|-----------|--------------|
| `flat` | 184 deals (34%) | Works. Artist gets guarantee + optional bonus. |
| `percentage_of_gross` | 18 deals (3%) | Works. Artist gets X% of gross ticket revenue. |
| `percentage_of_net` | 109 deals (20%) | **Fails.** Engine returns `supported: false`. |
| `vs` | 196 deals (37%) | **Fails.** Engine returns `supported: false`. |
| `door` | 30 deals (6%) | **Fails.** Engine returns `supported: false`. |

When the engine returned `supported: false`, the settle page showed a static card: *"The in-app tool can't settle this deal type yet. Mariana would do this on a Google Sheet at 2am tonight."* That card was accurate. It described exactly what was happening.

### What the data showed

Running a full DB audit surfaced four structural problems:

**1. Settlement math covered 37% of volume.** 63% of deals (305 of 537) required a spreadsheet. Not because the data wasn't there — ticket sales, expenses, and caps were all logged — but because no code wired them to the deal terms.

**2. Notes and structured fields had no reconciliation.** 537 deals (100%) had prose notes in `dealNotesFreetext` — the email from the agent that Mariana actually trusted. None of those notes had ever been cross-checked against the five structured fields that drive settlement math. Deals get renegotiated. Notes get updated. Fields don't. The engine runs the stale field, not the current deal.

**3. `recoup_basis` didn't exist as a field.** Recoups were logged in settlements, but whether a recoup came *inside* or *outside* the expense cap was stored nowhere. That placement changes the settlement math. The ambiguity meant that whoever ran the calculation made an implicit choice, often without Mariana knowing.

**4. The "Disputed" badge collapsed two different events.** `show_0008` had `settlement.status = "disputed"` and `settlement.signoff_text = "Looks good — TM"`. The tour manager approved on the night. The agent disputed the next morning after reviewing the statement. The UI showed one "Disputed" badge with no timeline context — implying the TM had disputed it, which wasn't true and changed the negotiating posture.

---

## What Was Built

### 1. Settlement engine: vs deals and percentage-of-net

**File:** `lib/dealMath.ts`

The engine now handles four of five deal types. For each, it produces a deterministic, step-by-step breakdown with enough detail to replace a spreadsheet.

**Vs deals** — guarantee vs % of net, artist gets whichever is greater:

```
Gross box office              $6,618
Less service fees               -$662
Net box office                $5,956
Less expenses                 -$1,350  (hospitality capped · expense cap saves $324 for artist)
Net after expenses            $4,606
Artist share — 80% of net     $3,685  (% wins vs $2,685 guarantee)
Walkout bonus                 $1,343
─────────────────────────────────────
Total to artist               $5,028
max(2685, net × 0.8) = 3684.80 (% wins)
```

The artist share line explicitly says which side won and why. If the guarantee wins instead: *"$2,685 guarantee > 80% of net ($2,100) — below breakeven."*

**Percentage-of-net deals** — same cap logic, with optional guarantee floor:
- Service fees deducted first
- Hospitality sub-cap applied (capped hospitality spend), then overall expense cap
- Guarantee acts as a floor if set — common in renegotiated deals where a minimum payment was agreed

**Expense cap helper** (`applyExpenseCaps`):
- Single clean deduction line, not three confusing lines
- Inline note surfaces what the cap did: *"hospitality capped at $400 ($422 actual) · expense cap $1,350 saves $324 for artist"*
- Absorbed-by-venue expenses excluded from the artist's calculation

**Bonus engine** — unchanged, now runs on all supported deal types:
- Evaluates `gross_threshold`, `sellout`, `attendance_threshold`, `tier_ratchet` from `bonusesJson`
- Returns both applied bonuses (with reason) and non-triggered bonuses (for transparency)
- "Why didn't we get the $500 gross bonus?" → "Gross $3,800 < $4,500 threshold"

**What still returns `supported: false`:** Door deals (30 deals, 6%). The math is venue-specific and not modeled in the schema.

**Gap closed:** The primary reason bookers leave the app. Vs deals are 37% of volume, %-of-net another 20%. These now produce auditable, step-by-step settlements instead of an empty state.

---

### 2. Schema additions

**File:** `db/schema.ts`

Two columns added to the `deals` table:

**`recoup_basis` (enum: `inside_cap` | `outside_cap`)** — Whether an agreed recoup is deducted inside or outside the expense cap. These produce different settlement math. The field was missing entirely; recoup placement was implicit and inconsistent. Now it can be set explicitly, and the AI extraction flags when notes mention a recoup but don't specify placement.

**`notes_extraction_json` (text)** — Cached JSON from the AI notes cross-check. Stores the full extraction result (contradictions, ambiguities, shadow deal, timestamp). Avoids re-calling the AI on every page load. Cleared and re-run on every save.

**`shadow_deal_json` (text)** — The AI's extracted version of the deal from prose notes alone. Stored separately from the manual structured fields so drift can be detected over time. Contains justifications: the exact quote from the notes that supports each extracted value.

**Gap closed:** `recoup_basis` was the data model gap behind the class of dispute where two parties run the same settlement and get different answers. `notes_extraction_json` is the cache that makes the AI layer feasible without hammering a paid API on every page load.

---

### 3. AI notes cross-check (Layer A)

**Files:** `lib/notesExtractor.ts`, `app/shows/[id]/notes-extraction-badge.tsx`, `app/shows/[id]/notes-editor.tsx`, `app/api/shows/[id]/route.ts`, `app/api/shows/[id]/extract/route.ts`

#### What it does

When a booker saves notes or clicks "Check notes against deal fields," the system sends the prose notes and the five structured settlement fields to Gemini (Flash, JSON mode). The AI does two passes:

**Pass 1 — Shadow deal extraction:** Read the notes and extract what the deal actually says. Build a `ShadowDeal` object using *only* the notes — never referencing the structured fields. Record a justification quote for each extracted value.

**Pass 2 — Contradiction detection:** Compare the shadow deal against the structured fields. Flag any value that disagrees by more than 2%.

The result surfaces two categories:

**Contradictions** — Notes explicitly say X, field says Y:
- *"Field says 75% · notes say 85%"* (show_0005: renegotiated split never updated in the form)
- *"Field says $3,000 guarantee · notes say $3,931"* (stale field after renegotiation)
- Each contradiction includes `suggestedValue` for one-click fix

**Ambiguities** — Notes mention a concept that requires clarification:
- *"Notes mention a marketing recoup but don't specify whether it's inside or outside the expense cap"*
- Surfaces as a directed question with two-button resolution: "Inside cap" / "Outside cap (gross deduction)"

#### Shadow deal display

The UI shows the AI's extracted "Negotiated Truth" — what the deal actually says in prose — as a read-only grid above the contradictions. A "Sync Fields to Negotiated Intent" button applies all contradictions at once if the AI's read is correct.

This matters because Mariana trusts the notes more than the form. The form is what someone entered months ago; the notes are the email from the agent last week.

#### One-click resolution

Each contradiction has an "Update [Field] to [Value]" button. Clicking it:
1. PATCHes `/api/shows/[id]` with the corrected field
2. The PATCH endpoint updates the DB
3. Page refreshes; contradiction disappears; settlement math recalculates with the correct value

#### Rate limiting

The free Gemini tier allows 20 requests/day. On a 429 response, the system:
1. Catches the error specifically (checks for `status === 429`)
2. Writes `{ rateLimited: true, retryAfter: "<1 hour from now>" }` to `notes_extraction_json`
3. Future page loads read the marker and skip the API call entirely
4. The badge shows: *"AI check quota exceeded · retry after 3:45 PM"*
5. After `retryAfter` passes, the "Check now" button reappears

This means one 429 error costs one quota slot. Without this, every page navigation to an unextracted show would fire another call until the daily quota was exhausted.

#### Caching architecture

The `notes_extraction_json` field has four states:

| State | Value | Badge shows |
|-------|-------|-------------|
| Never tried | `null` | "Check notes against deal fields" button |
| Rate limited | `{"rateLimited":true,"retryAfter":"..."}` | "Quota exceeded · retry after X" |
| No issues | `{"hasIssues":false,...}` | Green dot: "Notes match structured fields" |
| Issues found | `{"hasIssues":true,"contradictions":[...],...}` | Amber card with contradictions and fixes |

**Gap closed:** Notes and structured fields are parallel truth sources with no reconciliation. A renegotiation that updates the notes but not the form runs settlement at the stale percentage. The AI layer catches this at the detail page before show night — not on settlement night when there's no time to fix it.

---

### 4. Expense cap tracker (Layer B)

**File:** `app/shows/[id]/cap-tracker.tsx`

Real-time progress bars on the show detail page showing how expenses are tracking against agreed caps. No AI. Pure arithmetic.

- One bar per cap: overall expense cap and hospitality sub-cap (if either is set on the deal)
- Color states: green (safe) → amber (>85% of cap) → red (over cap)
- Over-cap state: *"$72 over cap — unabsorbed overage will charge the artist above the agreed limit"*

Expense caps exist to protect the artist: any expenses above the cap are absorbed by the venue, not deducted from the payout. This tracker shows Mariana during the show whether she's heading for an overage before it's too late to adjust.

**Gap closed:** Overages are discovered at settlement night. By then they're a negotiation problem. The tracker surfaces them during the show when they're still an operational problem.

---

### 5. Settlement preview on the show detail page (Layer C)

**File:** `app/shows/[id]/page.tsx`

The same `calculateSettlement()` math that powers the settle page now also runs on the show detail page. The estimated payout — with full step breakdown — is visible before show night.

For any supported deal type, the Deal Terms card shows:
- Estimated payout (large display number)
- Step-by-step breakdown with cap notes inline
- Final formula: `max($2,685, net × 0.8) = $3,685 (% wins)`
- Calculation trace: quotes from the deal notes that justify each number (provenance)

The provenance section is important for audits and disputes. *"We applied 80% of net because the notes said: '80/20 split on net above breakeven.'"*

**Gap closed:** Bookers currently don't know what the settlement will look like until settlement night. A stale percentage or an unexpected expense cap overage is discovered at the worst possible time. The preview brings that forward to whenever the show detail page is opened.

---

### 6. Post-signoff dispute detection

**Files:** `lib/settlementStage.ts`, `app/shows/[id]/settle/page.tsx`

#### The problem

`show_0008` (Dust Off) has:
- `settlement.status = "disputed"`
- `settlement.signoff_text = "Looks good — TM"`

The tour manager approved the statement on the night. The agent reviewed it the next morning and disputed a line item. These are two separate events — but the previous UI collapsed them into one "Disputed" badge, implying the TM had raised the dispute. When Greenroom's team spoke to the artist camp, the TM said "but I approved it" and the app appeared to contradict that.

#### The fix

`isPositiveSignoff(text)` in `lib/settlementStage.ts`:
```typescript
export function isPositiveSignoff(text: string | null | undefined): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();
  return !["no ", "dispute", "question", "hold", "problem", "issue", "wrong", "not "].some(
    (w) => lower.includes(w)
  );
}
```

When `settlement.status === "disputed"` AND `isPositiveSignoff(settlement.signoffText) === true`, the settle page shows:

```
┌─ ⚠ Post-signoff dispute ──────────────────────────────────────────┐
│ The tour manager approved on the night. The dispute was raised    │
│ afterward by the agent or management reviewing the statement.     │
│ These are two separate events — the TM sign-off below is not a   │
│ contradiction.                                                    │
└───────────────────────────────────────────────────────────────────┘

Tour manager sign-off (on the night)
"Looks good — TM"

Mariana's settlement notes
[Mariana's internal note about the post-show dispute]
```

The signoff is relabeled *"Tour manager sign-off (on the night)"* instead of the generic *"From the artist team"* — making the timeline explicit.

**Gap closed:** Post-show disputes are structurally different from show-night disputes. They arise from management reviewing a statement days later, not from the TM raising an issue in the room. Without distinguishing them, Greenroom looked inconsistent — the app showed "Disputed" while the TM was telling their management they approved it.

---

## Gap Analysis

| Gap | Status | How addressed |
|-----|--------|---------------|
| vs deals unsupported (37% of deals) | ✅ Resolved | Full vs deal math with cap enforcement, expense deduction, guarantee floor comparison |
| %-of-net deals unsupported (20% of deals) | ✅ Resolved | Net-after-expenses × percentage, with optional guarantee floor |
| Expense caps not enforced in math | ✅ Resolved | Hospitality sub-cap applied first, overall cap applied to total; single clean step line |
| Notes/field divergence not detected | ✅ Resolved | AI cross-check on demand; contradictions with one-click fixes |
| `recoup_basis` not modeled | ✅ Schema | Column added; AI extraction flags when notes mention a recoup without placement |
| Post-signoff dispute invisible | ✅ Resolved | Settle page distinguishes TM night sign-off from next-day agent dispute |
| Pre-show expense cap visibility | ✅ Resolved | Cap tracker on detail page shows burn rate in real time |
| AI quota exhaustion on page load | ✅ Resolved | 429 writes retry marker to DB; future loads skip the call; badge shows retry time |
| Door deals unsupported (6% of deals) | ❌ Open | Math is venue-specific; not modeled in schema |
| No deal field edit UI | ❌ Open | PATCH API exists; AI one-click fixes are the only edit path for structured fields |
| Bonus formula math (dynamic calculation) | ❌ Open | `bonuses_json` stores fixed amounts; "100% of gross above $X" isn't computed dynamically |
| Settle page doesn't show Layer A/B | ❌ Open | Notes extraction and cap tracker live on detail page only |

---

## Test Cases

### Settlement math

| Scenario | Expected result |
|----------|----------------|
| vs deal, % wins | Artist share labeled "X% of net (% wins)" with comparison note |
| vs deal, guarantee wins | "Artist share — guarantee wins" with note showing pct payout was lower |
| vs deal with hospitality over sub-cap | Hospitality deduction shows cap note; total respects overall cap |
| vs deal with overall expense cap triggered | Expense step note: "expense cap $X saves $Y for artist" |
| %-of-net with guarantee floor | Floor applies when net payout < guarantee |
| Flat deal, sellout bonus triggers | Bonus appears in steps; `bonusesApplied` non-empty |
| Flat deal, gross bonus doesn't trigger | Bonus in `bonusesNotTriggered` with reason "Gross $X < $Y threshold" |
| Deal missing required field (vs with no percentage) | Returns `supported: false`, settle page shows unsupported card |
| Door deal | Returns `supported: false` |

### AI notes cross-check

| Scenario | Expected result |
|----------|----------------|
| Notes say "85/15", field says 75% | Amber badge: "Field says 75% · notes say 85%" + one-click fix |
| Notes mention recoup, `recoup_basis` is null | Ambiguity card with "Inside cap" / "Outside cap" buttons |
| Notes consistent with all fields | Green dot: "Notes match structured fields · checked at X:XX" |
| Click "Update percentage to 0.85" | PATCH fires; page refreshes; field updated; badge re-checks |
| Save notes with new deal term | Extraction re-runs; badge reflects new notes |
| Gemini returns 429 | Marker written to DB; badge shows "Quota exceeded · retry after X"; no repeated API calls |
| No Gemini API key | Badge shows "Check notes against deal fields" button; no crash |
| Click "Sync Fields to Negotiated Intent" | All contradictions PATCHed at once; page refreshes clean |

### Cap tracker

| Scenario | Expected result |
|----------|----------------|
| Expenses at 60% of cap | Green progress bar |
| Expenses at 90% of cap | Amber progress bar |
| Expenses over cap | Red bar + "$X over cap — overage will charge the artist" |
| Deal has no expense cap | Cap tracker does not render |
| Deal has hospitality cap only | One tracker for hospitality only |

### Post-signoff dispute

| Scenario | Expected result |
|----------|----------------|
| `status = "disputed"`, signoffText = "Looks good — TM" | Amber callout + "Tour manager sign-off (on the night)" label |
| `status = "disputed"`, signoffText = "Not approving this" | Standard disputed view; no callout (signoff is negative) |
| `status = "signed"` | No callout |
| `signoffText` is null | No callout |

---

## Business Impact

**Before this work:**

- In-app settlement tool handles 37% of deal volume (flat + %-of-gross)
- 63% of deals require a spreadsheet at show night
- Notes are trusted, forms are stale, no system bridges the gap
- Disputed settlements surface no timeline context — who disputed, when, and why is unclear from the UI

**After this work:**

- In-app settlement tool handles 94% of deal volume (adds vs + %-of-net)
- Notes cross-check catches stale fields before show night with one-click resolution
- Expense caps are visible during the show, not discovered at settlement
- Post-signoff disputes are distinguished from show-night disputes

The one change that closes the spreadsheet for Mariana's venue: vs deal support. Her venue runs 12–15 vs deals a month. Every one previously required a Google Sheet. The step-by-step audit trail the engine now produces is the same information she was building manually — just automated, auditable, and inside the tool she was already logging results into anyway.
