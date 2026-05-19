# Deck: Settlement Confidence Assistant

Use this as the exact slide narrative for the Loom, live interview, or a short presentation.

## Slide 1  -  Title

**Settlement Confidence Assistant**

AI-assisted interpretation and explainability for Greenroom settlement workflows.

The case-study thesis: settlement is failing because teams do not trust the interpretation, not because they cannot do arithmetic.

## Slide 2  -  The Real Problem

**Settlement is a trust workflow wearing a calculator costume.**

Evidence:

- Deal terms live in messy prose.
- Structured fields are incomplete or stale.
- Recoups and expense caps are interpreted differently by venue, TM, and agent.
- Sign-off and status can disagree.
- The dispute cost is social and relational, not just financial.

## Slide 3  -  Why This Slice

**The leverage point is alignment before money moves.**

I chose interpretation + explainability because:

- Mariana already has a spreadsheet for math.
- The app's structured fields do not represent the full agreement.
- The highest-risk moment is the 2am walkthrough conversation.
- A correct number still fails if nobody can explain it.

Cut: full settlement-engine rebuild, chatbot, RAG, autonomous approval.

## Slide 4  -  Product Principle

**AI should assist judgment, not replace it.**

Design choices:

- Interpret deal notes into structured terms.
- Show confidence and review warnings.
- Explain each line item with source text.
- Recommend manual review when interpretation is unsafe.
- Keep Mariana accountable for final settlement.

## Slide 5  -  What I Built

**A confidence layer inside the settlement worksheet.**

Prototype components:

- `lib/settlementConfidence.ts`
- Inline panel in `/shows/[id]/settle`
- Confidence score and summary
- AI deal interpretation
- Ambiguity and contradiction warnings
- Source-backed settlement line explanations

## Slide 6  -  Demo: Coastal Spell

**Coastal Spell shows why arithmetic is not enough.**

Observed in the workflow:

- Vs deal.
- $900 marketing recoup in dispute.
- Settlement lifecycle shows dispute state.
- Sign-off language can sound positive while status remains disputed.
- The underlying issue is marketing-recoup interpretation.

Demo URL:

`/shows/show_coastal_spell_dispute/settle`

## Slide 7  -  Trust Model

**Confidence is useful only when it explains itself.**

The assistant lowers confidence when it sees:

- Ambiguous recoup placement.
- Prose vs structured-field conflict.
- Gross/net basis uncertainty.
- Settlement status vs sign-off mismatch.
- Paid settlement with unresolved disputed recoup.
- Expense pass-through above cap.

Output is not "AI says yes." Output is "safe to send," "usable with review," or "manual review required."

## Slide 8  -  Validation

**Success is fewer surprise disputes, not perfect automation.**

Validation plan:

- Compare assistant interpretation against Mariana's historical spreadsheet decisions.
- Run a 2-3 week pilot before settlement nights.
- Track settlement review time.
- Track agent/TM follow-up questions.
- Track settlements sent with unresolved warnings.
- Track post-show disputes and concessions.

## Slide 9  -  What Ships Next

**The next product step is confirmed interpretation.**

Next:

- Let Mariana accept, edit, or reject AI interpretation.
- Save confirmed interpretation as the settlement source of truth.
- Add tighter clause-level source spans.
- Add Marcus-facing approval view for unusual terms.
- Add agent/TM preview for disputed-prone line items.

## Slide 10  -  Close

**Greenroom should make settlement interpretation reviewable before it makes settlement more automatic.**

The assistant does not settle the show.

It helps Mariana settle with confidence.

