# Greenroom Case Study Memo: Settlement Confidence Assistant

Prototype link after running the repo locally:

`http://localhost:3000/shows/show_coastal_spell_dispute/settle`

If Next starts on another port, use that port with the same path.

## Slice

I chose to build a **Settlement Confidence Assistant** for Mariana Reyes, lead booker at The Crescent. The assistant sits inside the settlement worksheet and helps her interpret messy deal prose, detect ambiguity or data conflicts, and explain where settlement line items came from.

This is intentionally **not** a full settlement engine rebuild. The product thesis is that Greenroom is failing at settlement because users do not trust opaque numbers, negotiated terms drift between prose and structured fields, and disputes emerge from interpretation ambiguity more often than arithmetic mistakes.

The slice is: **AI-assisted interpretation + explainability for settlement workflows.**

## Why This Slice

Settlement at The Crescent is several problems wearing one name: deal modeling, audit trails, real-time prediction, the 2am walkthrough conversation, post-show agent communication, and dispute resolution. Rebuilding all of that would be too broad for a 6-8 hour case study and would likely produce a shallow calculator.

I chose this slice because it targets the highest-trust moment in the workflow. Mariana can calculate settlement math in a spreadsheet. What she needs from Greenroom is confidence that the deal interpretation is safe enough to put in front of a tour manager, and enough sourceability to explain the number when someone challenges it.

The seeded data points directly at this problem:

- `deal_notes_freetext` is treated as the truth Mariana actually trusts.
- Structured fields such as `deal_type`, `percentage`, and `expense_cap` drift from prose.
- Recoups can remain disputed even after broader settlement progress.
- Settlement status can contradict sign-off language, such as a disputed status with "Looks good" from the artist team.
- The Coastal Spell dispute was not caused by bad arithmetic. It was caused by ambiguous marketing-recoup interpretation.

That makes AI useful, but only if it is conservative. The assistant should not autonomously settle the show. It should expose uncertainty, show its work, and route judgment back to Mariana.

## What I Built

I added a lightweight mock-AI interpretation layer in `lib/settlementConfidence.ts` and surfaced it in `app/shows/[id]/settle/page.tsx`.

The assistant does four things:

1. **Interprets messy deal notes**
   - Detects vs deals, flat deals, percentage terms, gross/net basis, guarantee floor, expense caps, hospitality caps, marketing recoups, and walkout thresholds.

2. **Scores confidence**
   - Produces a simple confidence score and human-readable summary.
   - Uses lower confidence when terms are missing, ambiguous, contradicted, or disputed.

3. **Flags review issues**
   - Detects structured deal fields that contradict prose.
   - Detects status/sign-off conflicts.
   - Detects paid settlements with unresolved disputed recoups.
   - Detects hospitality over cap.
   - Detects ambiguous marketing-recoup placement.

4. **Explains settlement line items**
   - Shows where gross, net, expenses, guarantee, percentage terms, recoups, and logged total-to-artist values come from.
   - Includes source text and confidence for each line.

The UI is intentionally inline and operational. It is not a chatbot. It behaves like a review layer Mariana can scan at 2am before walking into a settlement conversation.

## What I Cut

I cut anything that would make the prototype look broader than the thesis:

- No full settlement calculator rebuild.
- No autonomous approval or "AI decides the settlement."
- No support for every deal type.
- No embeddings, vector database, RAG, agents, or training pipeline.
- No generic chat assistant.
- No new database tables.
- No agent-facing portal.
- No workflow automation for dispute resolution.

Those may be useful later, but adding them now would weaken the case study. The highest-signal decision is to show that Greenroom can become trustworthy before it becomes fully comprehensive.

## AI Design

The implementation is deliberately lightweight: deterministic parsing behind an OpenAI-compatible product abstraction. In production, I would swap the parser for structured JSON extraction with a schema and strict validation.

The important product behavior is independent of the model:

- AI proposes an interpretation, not a final truth.
- Every extracted term carries source text.
- Ambiguity is surfaced instead of hidden.
- The user is told when manual review is required.
- Confidence is explained through concrete issues, not a vague AI score.

This turns AI into a senior operations assistant: good at reading messy prose, noticing contradictions, and preparing a review path, while Mariana remains accountable for the settlement.

## Validation

I would validate the feature in three phases:

1. **Internal accuracy review**
   - Sample 50 historical settlements.
   - Compare assistant interpretation against Mariana's spreadsheet interpretation.
   - Measure false positives, false negatives, and review usefulness.

2. **Workflow pilot at The Crescent**
   - Use the assistant before settlement for 2-3 weeks.
   - Track whether Mariana catches ambiguous terms earlier.
   - Track whether she edits deal terms or requests written clarification before show night.

3. **Trust and dispute metrics**
   - Settlement review time.
   - Percent of settlements requiring agent follow-up.
   - Number of post-show disputes.
   - Number of settlements sent with unresolved confidence warnings.
   - Qualitative trust score from Mariana and Marcus.

The target is not "AI parses everything correctly." The target is fewer surprise disputes and faster settlement conversations because assumptions are visible earlier.

## What I Would Ship Next

Next, I would add a **human-confirmed interpretation state**. Mariana should be able to accept, edit, or reject the assistant's interpretation before settlement. That accepted interpretation should become the reviewable version of the deal for the settlement worksheet.

After that:

- Better clause-level source spans.
- A pre-show "settlement risk" checklist for deals with ambiguous recoups or caps.
- A Marcus-facing approval view showing unusual terms and confidence warnings.
- An agent/TM preview that explains disputed-prone line items before the next-day email chain begins.

The long-term opportunity is not just a better calculator. It is turning settlement from a black-box document into a structured collaboration between venue, tour manager, agent, and GM.
