# AI Deal Parser — feature slice, design rationale, validation plan

## The problem

Greenroom's settlement tool works for 18% of customers. The other 82% — including most of the larger venues — default to spreadsheets. The root cause isn't the math engine. It's the gap between where deal terms actually live (free-text notes, agent emails, scribbled contracts) and where the tool expects them (structured database fields that are usually blank or wrong).

Mariana doesn't trust the structured fields. She trusts her notes. The tool never read the notes.

## What I built

An AI deal parser that reads dealNotesFreetext — the field Mariana actually fills in — and extracts the structured terms needed to run the settlement calculation. It covers all five deal types the real-world data contains: flat, percentage-of-gross, percentage-of-net, vs (guarantee vs. % of net, whichever is greater), and door deals.

The flow is: land on the settlement page → AI auto-parses the notes → worksheet appears. No button clicks on return visits (parsed terms are cached to localStorage and reused until the notes change). If the AI misreads something — wrong guarantee amount, missed expense cap — there's an editable form above the worksheet. Correcting a field and hitting "Recalculate" re-runs the math instantly.

## Key decisions:

Human in the loop, not human out of the loop. The AI extracts and proposes; the booker confirms. The worksheet doesn't appear until the terms card has been shown — the human always sees what the AI read before the number lands. Confidence level (high / medium / low) is surfaced explicitly so Mariana knows when to scrutinize.

Don't write bad data to the database. The parsed terms are ephemeral — used for this settlement session, not saved as structured fields. Overwriting the DB with AI-inferred values would corrupt the record for future settlements and audits. LocalStorage gives persistence without pollution.

The walkout pot is a candidate, not a bonus. A vs deal with a "walkout pot" (artist gets 100% of gross above $X) is a three-way max — max(guarantee, net × %, gross above threshold) — not a guarantee plus an additive bonus. Getting this wrong would overstate the artist payout significantly. Fixing this required changing the data model (new bonus type gross_percentage_above_threshold) and the calculation engine in both the server and client paths.

Hospitality cap before overall expense cap. The hospitality cap (common in rider-heavy deals) is applied to hospitality-category expenses first, then the combined total is checked against the overall expense cap. Order matters — applying the overall cap first could let hospitality overages slip through.

## What I cut

Saving parsed terms to the database. The right long-term answer is a settlement_drafts table that persists the booker's corrections alongside the raw AI output. I used localStorage as a stand-in because it solves the return-visit problem without a schema migration, and it's the right scope for a prototype.

Tier ratchets. These appear in the seed data (tier_ratchet bonus type) but computing them correctly requires vs-deal support plus multi-threshold logic. The current engine flags them as not-yet-handled with a human-readable note rather than silently wrong math.

Sellout and attendance bonuses in the client-side path. These need ticket count and capacity at evaluation time. The server path has both; the client-side AI parser path skips them with a comment rather than evaluating them incorrectly.

## How I'd validate this

Accuracy: Run the parser against every show with both dealNotesFreetext and a completed settlement record. Compare AI-extracted terms to the settled values. Track field-level error rate (guarantee off by >5%, wrong deal type, missed bonus).

Correction rate: Instrument the editable form — how often does a user change a field before recalculating? High correction rate on a specific field (e.g., expenseCap) means the prompt needs work there.

Confidence calibration: When the AI returns "high confidence," is it actually right more often than "medium"? If not, the confidence signal is noise and should be removed.

Time-to-settlement: Does the feature reduce time from page load to a number the booker is willing to sign? This is the metric the CEO actually cares about.

Spreadsheet displacement: Are the 82% opening the in-app tool now? Even partial displacement (e.g., larger venues using it for flat deals) is a leading indicator.

## What I'd ship next

Persist corrections to the database. A settlement_drafts table storing { showId, parsedTerms, userCorrectedTerms, totalToArtist, createdAt }. This gives Mariana a saved draft she can return to, and gives the product team a feedback loop for improving the AI.

Feed corrections back into the prompt. When a user corrects "vs" to "percentage_of_net," log that as a labeled example. Over time, fine-tune or few-shot the prompt on real venue data. The correction form is a data flywheel.

Surface the delta between AI-parsed and DB-structured fields. If the AI reads a $7,500 guarantee but the DB has $5,000, show both with a flag. This catches data entry errors without requiring the AI to be authoritative.

Batch settlement prep. Before a busy weekend, parse all unsettled shows at once and surface the ones with low-confidence parses or missing deal notes. Turns the tool from reactive (Mariana opens a show) to proactive (Mariana sees what needs attention).