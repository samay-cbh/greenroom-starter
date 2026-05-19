# Greenroom: Settlement Integrity
### Applied AI PM Case Study — Tamanna Sharma

---

## Why This Slice

Nothing matters if the data is broken.

Greenroom's settlement tool exists to answer one question on show night: what do we owe the artist? But that answer is only as good as the deal terms underneath it. And the deal terms have a structural problem that no UI improvement can fix: **the structured fields and the prose notes have never talked to each other.**

Every deal in the catalog — all 537 — has free-text notes. These are the real record of the negotiation: amended splits, renegotiated caps, verbal agreements made over email and WhatsApp and revised PDFs. When terms change, bookers update the notes. The structured fields — the ones the settlement engine actually reads — often don't follow. The two drift apart silently, with no flag, no warning, and no audit trail.

The result is that Greenroom runs math on stale inputs and returns wrong numbers with full confidence. show_0005 is not an edge case — it's a pattern. The notes say "renegotiated to 85/15." The database says 75%. The settlement has been wrong. Nobody knew.

There's a second problem layered on top: deal terms that capture a number but not the decision behind it. Whether hospitality costs are counted inside the expense cap or treated as a separate artist deduction changes the payout by hundreds of dollars on a mid-size show. That distinction was living in email prose, never in a structured field. The cap math silently assumed one interpretation. When the intent was the other, the venue absorbed costs it shouldn't have — or the artist was overbilled. No flag. No record. No way to audit after the fact.

And beneath both of these: 56% of the catalog — vs deals (36%) and percentage-of-net deals (20%) — produced no settlement at all. An "unsupported" empty state. 304 shows where Greenroom simply gave up and Mariana opened a spreadsheet. Not because she preferred it. Because the tool left her no choice.

This is the slice worth fixing first. Not because it's the flashiest, but because it's the foundation. Get the data right, extend the engine, and everything else — automation, analytics, faster settlement — becomes possible on top of something trustworthy.

---

## The Product Vision

The wrong model for Greenroom: Mariana enters deal terms → Mariana uses them.

The right model: **Mariana audits once → the platform keeps itself clean.**

A booker's job is negotiating shows and running them. Deal terms live in emails and amended contracts. Expecting Mariana to manually translate every renegotiation into the right database field — and catch every drift before it surfaces at settlement — is designing for failure. She will always be too busy at the wrong moment.

Greenroom should be the single source of truth. Not because Mariana maintains it perfectly, but because the platform reconciles itself. It reads her notes. It compares them against the fields. It asks the questions she didn't answer when the deal was booked. She reviews what's flagged, confirms what's ambiguous, and locks it in. One audit pass per deal. Everything downstream stays clean.

There's also a fixed structure already in place that's being underused. The Deal terms card on every show has defined fields — deal type, guarantee, percentage, expense cap, hospitality cap — with a live API behind them. Right now, empty fields show a silent dash. They could prompt instead. A vs deal with no expense cap could say "No cap set — all expenses will deduct before the percentage calculation. Is that correct?" A percentage deal with no basis could ask "Gross or net?" These aren't validation errors. They're the specific questions a booker forgets to answer at booking and pays for at 2am. The structure is already there. The guardrails aren't.

This build is the first piece of that platform. The goal was to make Greenroom trustworthy before making it smarter.

---

## What Was Built

**Settlement engine for real deal types.** The math engine previously supported flat deals only. Added full support for vs deals — guarantee vs. percentage-of-net comparison, expenses deducted before the percentage calculation, correct cap ordering, and a step-by-step breakdown in the UI showing exactly which side wins and why. Added percentage-of-net support with a guarantee floor. The 304 deals that previously fell off a cliff into an empty state now produce a full settlement calculation. This is the direct fix for the spreadsheet problem.

**Shadow deal and field comparison.** When deal notes are saved, Gemini reads the prose and extracts a structured "shadow deal" — the negotiated truth as written, independent of what the database fields say. That extraction is stored once. On every subsequent page load, the server compares it against the live fields with no AI call. Contradictions surface inline: "Notes say 85%, field says 75% — update?" One click to fix. Ambiguities surface as prompted binary choices — "Is hospitality inside the expense cap or a separate deduction?" Mariana picks once; the answer is stored as a structured field and the next settlement uses it. Dismissals persist to the database by field name so a decision she's already made never resurfaces. A backfill script processes all 537 existing deals at rate-limit-safe intervals, so the feature applies retroactively across the full catalog — not just deals created after launch.

**Expense line-item breakdown at settlement.** Every expense record has a category, description, and amount in the database. The settlement worksheet was collapsing them into a single total — Mariana saw "$2,400 expenses" with no breakdown and no way to verify the number at midnight. The itemized list now renders directly under the total in the worksheet, indented as sub-lines. Same data, finally surfaced at the moment it matters.

**Pre-show cap tracker.** Expense burn shown against the agreed cap before show night. Green below 85%, amber approaching the cap, red with a dollar overage amount when exceeded. Currently, bookers discover they're over cap at midnight during settlement. This moves that signal to load-in, when there's still time to act.

**Post-signoff dispute detection.** A specific invisible inconsistency: the tour manager approves the settlement on the night, then the agent disputes it the next morning. The status shows "Disputed" but the UI previously displayed both events identically. Now the settle page distinguishes them — tour manager sign-off labelled clearly, with an amber callout that the dispute was raised afterward by the agent or management. 26 settlements in the catalog carry this pattern today.

---

## Design Choices

**AI proposes. Mariana approves.** The shadow deal never silently updates a field. It surfaces a suggestion; she confirms or dismisses it. A system that auto-corrects would be less trustworthy than the problem it solves. The audit moment is the product — that's what builds confidence over time and gives Mariana a reason to trust the number she's handing the artist at 2am.

**One extraction. No ongoing AI cost.** The shadow deal is generated once per notes save, stored, and compared server-side on every page load. Zero per-view AI calls. Cost is bounded and predictable. Extraction runs again only when notes change, so the freshness guarantee is tied to the thing that actually changes.

**Dismissals by field name, not position.** AI output order isn't stable across re-runs. Storing dismissals as field name keys means a decision Mariana already made stays respected even when the next extraction returns results in a different order. Index-based storage would silently un-dismiss items she'd already answered.

**Ambiguity as a binary prompt, not a free text field.** When the notes mention a concept but don't resolve it — like whether hospitality is inside or outside the expense cap — the badge offers two labelled buttons, not an open input. This forces the decision rather than allowing another round of freetext ambiguity. The answer goes into a structured field. It's auditable.

---

## What Was Cut

**Door deals.** 30 shows in the catalog (6%) are unsupported. The settlement model requires actual ticket revenue at door close, which needs either a live integration or a manual count entry. Adding it without that data source would mean another field Mariana has to maintain — which contradicts the thesis. Scoped for next.

**Inline field editing.** The PATCH API accepts all deal fields. A UI edit form does not exist. Right now, correcting a field outside of the AI one-click fix requires database access. This is the most urgent gap to close after this sprint — without it, the guardrail prompts on empty fields have nowhere to land.

**Audit log.** The decisions are now captured — hospitality basis, ambiguity dismissals, shadow contradictions resolved. There is no record of who made each call or when. Skipped because it requires an authentication layer Greenroom doesn't have yet, and because getting the data right mattered more than logging who changed it.


---

## How We'd Know It's Working

**Notes-field agreement rate.** Baseline: 0 of 537 deals have ever been compared. After the backfill runs, measure what fraction of shadow deals find zero contradictions on first extraction. Above 70% clean means the field data is mostly sound and drift is the exception. Below 50% means the data problem is worse than assumed and the prompts need to move upstream — closer to booking, not just at settlement.

**In-app settlement rate for vs and percentage-of-net shows.** Baseline: anecdotally around 18% of settlements are completed without an export. Target: above 50% for these deal types within 90 days. If bookers are still exporting, either the math output isn't trustworthy enough or there's friction in the flow that hasn't been found yet.

**Ambiguity prompt response rate.** Once the badge prompts for binary decisions — hospitality basis, recoup placement — track how many bookers answer versus dismiss. High completion means the question is genuinely useful and was unanswered before. High dismissal on small shows suggests a dollar threshold before asking: don't prompt the question if the hospitality spend is under $200, because the difference doesn't move the payout meaningfully.

**Shadow deal coverage over time.** 12 of 537 deals have an extracted shadow deal today. After the backfill, 537. The metric to watch after launch is whether new deals are getting extracted within 24 hours of notes being entered. If coverage drops, the extraction trigger isn't firing reliably.

---

## What Ships Next

**Field edit surface.** The PATCH API accepts corrections to all deal fields. What doesn't exist yet is a UI for it. Right now the only way to correct a stale field is through the AI badge's one-click fix — which requires notes, an extraction, and a detected contradiction. A direct edit surface would close that gap, but it's a data input problem, not a data integrity problem. It belongs in the next sprint, after the integrity layer is trusted.

**Settlement page integration.** The cap tracker and shadow deal badge live on the detail page. The booker doing settlement on show night lives on `/settle`. The most useful friction is at the moment of use. Moving these components to the settle page is the change with the highest leverage relative to effort.

**Door deal support.** 30 shows fully unsupported. Once a ticket count surface exists, the math is simple. The deal type is already in the schema.

**Proactive pre-show notification.** If a show is 48–72 hours out and the shadow deal has unresolved contradictions, Mariana should get a prompt before show night — not discover the mismatch at midnight. The data is already there. It needs a trigger and a delivery surface.

**Booking-time extraction.** The shadow deal currently runs when notes are saved on the detail page. Moving extraction earlier — to when a deal is first confirmed — means Mariana is prompted to audit at the point when fixing something is cheapest. Show night becomes execution. The ambiguity gets resolved a week out, not at 2am.

---

*Settlement engine, AI extraction layer, server-side field comparison, expense line-item visibility, pre-show cap tracker, post-signoff dispute detection, and backfill infrastructure — all on the existing Greenroom stack, no architectural changes required.*
