# Loom Walkthrough Script: Settlement Confidence Assistant

Target length: **6-8 minutes**

Demo URL after `npm run dev`:

`http://localhost:3000/shows/show_coastal_spell_dispute/settle`

If Next starts on another port, use that port with the same path.

## 0:00-0:45  -  Opening Thesis

"For this case study, I intentionally did not build a generic settlement calculator.

The important insight from the brief and data is that Greenroom's settlement problem is not only arithmetic. Mariana can calculate a settlement in a spreadsheet. The harder problem is that deal terms are negotiated in messy prose, structured fields drift, and disputes happen when different people interpret the same clause differently.

So I picked a narrow slice: **Settlement Confidence Assistant**. It uses AI-style interpretation to read deal notes, surface ambiguity, and explain where settlement numbers came from. It assists Mariana's judgment; it does not replace it."

## 0:45-1:30  -  Why This Slice

Navigate briefly to `/reports` or mention the context:

"Settlement is several problems: deal modeling, audit trails, prediction, the 2am walkthrough, agent communication, and dispute resolution. I chose interpretation and explainability because this is the trust bottleneck.

The data model even exposes the issue: structured fields power the app, but `deal_notes_freetext` is what Mariana actually trusts. That gap is where disputes come from."

Key line:

"I wanted the prototype to show product judgment: precision over coverage, explainability over automation, and human-in-the-loop over autonomous settlement."

## 1:30-2:30  -  Coastal Spell Setup

Open:

`/shows/show_coastal_spell_dispute/settle`

Point out:

- Coastal Spell is a vs deal.
- The settlement is disputed.
- There is a $900 marketing recoup in dispute.
- The lifecycle shows settlement progress but not a clean resolution.

Say:

"This is the perfect example because the dispute was not that someone multiplied wrong. The dispute was whether marketing recoup belonged inside or outside the expense treatment. That is an interpretation problem."

## 2:30-4:15  -  Assistant Review Panel

Scroll to the Settlement Confidence Assistant.

Talk through:

- Confidence score.
- AI interpretation of the deal.
- Review warning.
- Source-backed settlement lines.

Script:

"The assistant reads the messy deal notes and turns them into an interpretation Mariana can review: vs net, guarantee, upside percentage, expense rules, recoups.

But the key is that it does not pretend to be certain. If the settlement status says disputed but sign-off text sounds positive, it flags that mismatch. If a recoup remains disputed, it keeps that visible. If structured deal fields contradict the prose, it recommends manual review.

This is the AI behavior I want in a high-trust workflow: not 'trust me,' but 'here is what I read, here is why, and here is what needs a human.'"

## 4:15-5:15  -  Explainability

Point to source-backed settlement lines.

Say:

"Every line item has a reason and a source. Gross box office comes from ticket sales. Net box office is gross less fees. Passed-through expenses come from expense rows not absorbed by the venue. Recoups show their status and source.

This is designed for the moment when a tour manager asks, 'wait, where did that come from?' Mariana needs an answer in seconds, not another spreadsheet tab."

## 5:15-6:15  -  What I Cut

Say:

"The cuts are important. I did not support every deal type. I did not add a chatbot. I did not build RAG or agents. I did not create an autonomous approval workflow. I also did not rewrite `dealMath.ts`.

That is intentional. The product should earn trust before it automates more of the workflow."

## 6:15-7:15  -  Validation

Say:

"I would validate this by comparing assistant interpretations against Mariana's historical spreadsheet interpretations, then piloting it at The Crescent for a few weeks.

The metrics I would care about are not just parser accuracy. I would measure review time, post-show agent questions, settlements sent with unresolved warnings, and whether Mariana catches ambiguous clauses before show night."

## 7:15-8:00  -  Close

Close with:

"The product direction is: Greenroom should not make AI settle shows autonomously. It should make settlement interpretation reviewable, explainable, and safe enough for Mariana to trust at 2am.

That is what the Settlement Confidence Assistant prototype demonstrates."

## Backup Answers For Live Interview

**Why not rebuild vs-deal math first?**

Because a correct calculator still fails if users do not trust the interpretation. Vs-deal math matters, but confidence and sourceability are the layer that makes any calculator usable in a high-trust settlement conversation.

**Why not a chatbot?**

Mariana is working under time pressure. She does not need to interrogate a bot. She needs inline review, clear warnings, and source-backed explanations in the worksheet she is already using.

**What is the biggest risk?**

False confidence. That is why the assistant is conservative, shows sources, and recommends manual review when terms are ambiguous.

**What would production require?**

A structured extraction schema, model evaluation set, saved human-confirmed interpretations, permissioned audit trail, and a way to compare accepted interpretations across venue, TM, and agent views.
