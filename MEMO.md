# Greenroom — Deal Modeling Slice

**To:** Pri (CEO), Anil (Product)
**From:** Febin
**Date:** May 2026
**Re:** Why I picked Deal Modeling, what I built, what's next

---

## The slice

From the six possible cuts inside settlement — *deal modeling, audit trails, real-time prediction, the 2am walkthrough, post-show comms, dispute resolution* — **I picked Deal Modeling.**

Disputes at The Crescent aren't math errors. They're **truth errors**. There's no agreed-on version of the deal anywhere in the system.

The data is unambiguous:
- **22 of 540** past settlements are formally disputed
- **5+** "paid" settlements carry unresolved disputed recoups
- **8** deals have prose in `deal_notes_freetext` that contradicts the structured fields
- **Daniel Hwang at WME alone** has 4 prior disputed marketing recoups across 4 different shows

Three of four interview subjects say the same thing in different words. Sarah Kim: *"the deal was a ghost — Mariana had her notes, I had my email, Andrea had her recollection, and none of them agreed."* Mariana: *"most of the friction in the 2am conversation comes from things that were knowable on Wednesday."* Marcus: *"we're paying a tax on every poorly-written deal email we ever signed."*

---

## What I built

**The Deal Brief** — a Wednesday-confirmed, structured representation of the deal that both parties have signed off on in writing **before the show**.

Mariana pastes the deal email. The system extracts structured terms, flags ambiguous sentences with **computed dollar swings**, and surfaces contradictions against existing data (percentage drift, hospitality cap breaches, cross-show agent patterns). She sends one clarification email to the agent if needed, gets *"confirmed"* back, and locks the brief.

The settlement page then reads from the brief — closing the **62.5% unsupported-deal gap** (vs deals, walkout pots, ratchets, % of net, door) as a *byproduct* of fixing the upstream truth problem, not because I built a better calculator.

The Coastal Spell dispute would not have happened with this in place. The same one-sentence ambiguity (*"expenses capped at $2,500, marketing recoup of $900 against gross"*) would have surfaced on Wednesday March 9 with a computed $720 dollar swing. Mariana sends one email. Daniel replies "confirmed." Dispute prevented.

---

## Design choices

- **Brief, not calculator.** The calculator was never the bottleneck — input ambiguity was. The brief gives the existing calculator richer typed inputs.
- **`recoupPlacement` is a required field** (`inside_cap` vs `outside_cap`). The brief schema *forces* the decision the legacy schema let stay ambiguous. This single field would have prevented the Coastal Spell loss.
- **Source of truth is the prose**, not the structured fields. Mariana already trusts the email; the brief structures it without asking her to re-enter anything.
- **Three lifecycle states** — `draft → awaiting_confirmation → confirmed`. The settlement page reads only confirmed briefs. Drafts don't flip math.
- **The clarification email is a deterministic template, not AI-generated.** Mariana's voice and her relationship with the agent — not the model's.

---

## What I cut (and why)

| Cut | Why |
|---|---|
| Vs-deal calculator as a standalone slice | Solving math on contested inputs gives perfect-wrong answers. Wrong layer of the problem. |
| Polished 2am settlement UI | Mariana said *"the math is the easy part."* Polish the symptom, miss the cause. |
| Post-show agent PDF | Ships value only after a trustworthy brief exists upstream. Sequenced for "next." |
| Dispute resolution workspace | Optimizes for the 5% tail event instead of preventing the 30% of pre-dispute friction. |
| Artist health scoring, triage dashboards | Feature-wishlist drift. Not derived from the data or the transcripts. |
| Receipt uploads, version timelines, comments, redesigned settle page | Each tempting. None defended by the data. |
| Agent-side portal/login | Agents already reply by email — don't make them adopt a new product. |
| Vector DB (Pinecone, Weaviate) | 540 vectors × 1.5KB = 800KB. SQLite BLOB + pure-JS cosine in 1ms. No infra needed at this scale. |

---

## AI used like a senior teammate

The product uses AI for exactly two things: **extracting structured terms from messy prose**, and **detecting when a single sentence could be read two ways**. Everything else is plain code.

The implementation is a 4-tier waterfall:

1. **Tier 0 — regex parser.** Handles **72%** of real deals at **$0**. ~5ms, no network.
2. **Tier 1 — local embeddings** (Xenova MiniLM-L6, runs in Node). Clones prior confirmed briefs when similarity ≥ 0.95. Otherwise supplies top-3 examples as few-shot to Tier 2.
3. **Tier 2 — Groq Llama 3.3 70B (free tier, 30 RPM).** Handles ~15% of deals — the genuinely weird ones. Two passes: structured extraction + ambiguity detection.
4. **Tier 3 — Mariana.** Manual entry/edit. Drafts never auto-confirm.

Cross-show pattern detection is **pure SQL**, not LLM. Agent's prior disputed marketing recoups via `GROUP BY agent_id` over `json_each(recoups_json)`. The senior architect's instinct: don't use AI for a `WHERE` clause.

**~80% of real deals never touch the LLM.** Steady-state cost at one venue: **free**. At Greenroom's 340-venue scale: roughly **$10/month/venue**. The whole system runs in the existing Next.js process — no vector DB, no Python service, no message queue. Provider is swappable via env var (Groq, Gemini, or Ollama local).

---

## How I'd validate

Three checks, in order of cost:

1. **Replay against history (one evening, no users).** Run the brief flow against the 22 disputed settlements. For how many would the ambiguity report have surfaced the contested sentence before the show? **Target: ≥70%.**
2. **Shadow mode at The Crescent (4 weeks).** Mariana runs her normal flow; the brief generates in parallel and emails her a Wednesday digest she can ignore. Measure: how often does she act on it? Does her Friday settlement match what the brief predicted?
3. **Co-pilot at one design-partner venue (8 weeks).** Brief is canonical; settlement flows from it. Leading metric: % of vs-deal settlements that go through the in-app tool instead of a spreadsheet. **Today: ~0%. Target: 40% by week 12.**

**Headline KPI:** % of disputes in the next quarter that the brief either prevented (ambiguity caught on Wednesday) or flagged in advance (cross-show pattern fired before the deal email was even sent). **Target: 50% reduction in formal disputes within 90 days at the pilot venue.**

---

## What ships next (in leverage order)

1. **Agent-side preview link.** Diego asked for this directly in his transcript: a read-only URL the tour manager opens on their phone during loadout. Same brief, different audience. ~2 days.
2. **Brief↔settlement diff.** When the final settlement strays from the confirmed brief, show *why* and *which clause*. Closes the prevention loop.
3. **Inline field edits.** `saveBriefEdits` is wired server-side; the UI just needs the inline-edit affordance. ~1 day.
4. **Pattern memory expansion.** From *"this agent disputes recoups"* to *"this venue routinely under-budgets hospitality by 35%."* Addresses Marcus's margin-variance complaint.
5. **Brief export to the agent's inbox.** Once the brief is trustworthy, exporting it as a clean PDF satisfies Sarah Kim's *"itemization-provenance-tone"* requirement by construction.
6. **Lazy backfill of the 540 historical deals.** First touch after this ships, auto-extract the brief in the background. Builds the corpus and the AI flywheel.

---

## The headline

**Disputes are not math errors. They're truth errors.** The Deal Brief is a Wednesday tool that turns a contested deal into a confirmed one before the show happens. The Friday-night ritual gets shorter because the Wednesday-afternoon conversation finally happens.

---

*Repo: see [README.md](README.md) for setup, sample emails, and a 3-minute walkthrough · Loom walkthrough: [link]*
