# Build Session — Codex Workflow

This directory is the bonus deliverable: a record of how I used Codex to build the `/shows/[id]/interpret` slice and its supporting infrastructure. It's intended for reviewers who want to see prompts, design reasoning, and corrections — not just the final diff.

## How I worked

I split the build across multiple focused Codex conversations rather than one monolithic thread. The motivation was practical: each thread's context window stays narrow, prompts stay high-signal, and side concerns don't pollute the main design conversation.

| Conversation | Focus | Included here? |
|---|---|---|
| Set up greenroom starter | Slice decision, interpretation engine, schema, UI route, commit hygiene, push | Yes — `codex-main.md` (2,484 lines) |
| App polish | UI iteration, affordances, settle-page CTA copy | Yes — `codex-polish.md` (1,156 lines) |
| cleanup DB | Targeted DB cleanup after schema additions | Not included |
| UI fix and polish | Final visual polish | Not included |

The two omitted conversations were narrow, late-stage cleanup threads. Their effects are visible in the diff on this branch.

## Highest-signal moments

These are the six exchanges I'd direct a reviewer to first. Line numbers reference the raw exports in this directory.

**1. Seven-agent parallel investigation — `codex-main.md`, line ~506**
Before designing anything, I scaffolded the evidence base by spawning seven parallel sub-audits inside Codex: prose-vs-structure divergence, lifecycle integrity, recoup forensics, Vs deal taxonomy, transcript synthesis, Coastal Spell post-mortem, and `/settle` UI failure walkthrough. Each agent had explicit evidence requirements (row IDs, prose snippets, verbatim quotes), a word cap, and the instruction *"flag anything that contradicts the framing I gave at the top — I want to know if the slice should shift."* The closing clause is the important one: it converted Codex from a writer into a research team that could push back.

**2. Disciplined repo reconnaissance — `codex-main.md`, line ~200-318**
The first ~300 lines are pure recon: schema, queries, `dealMath` engine, seed contradictions (BC1–BC12), the Coastal Spell injection point, and the live deal-mix distribution (195 vs, 185 flat, 109 % of net, 30 door, 18 % of gross) pulled from SQL queries against `data/greenroom.db`. Every numerical claim in the memo traces back to one of these queries. Reviewers can re-run them.

**3. Constraint-driven bug fix — `codex-main.md`, line ~1301**
After the first implementation, Codex was surfacing a false-positive divergence on `show_0007` (a walkout pot was being compared as if it were a bonus threshold). The fix prompt names the bug, prescribes the preferred fix path (fixture change, not engine change), lists explicit "do not" constraints (no new features, no math-engine expansion, no architecture changes, no `deals` mutation), and demands specific verification commands (`tsc --noEmit`, `npm run build`). This is the prompting pattern I want from AI inside production guardrails.

**4. Architecture call: LLM extracts; app code computes — `codex-main.md`, line ~1220**
Throughout the engine design I held a strict line: the LLM extracts and explains only. Dollar math runs in TypeScript. The append-only `settlement_interpretations` table stores the LLM's output plus the human confirmation, and never mutates the original `deals` row. Audit trail is only defensible if the dollar number is computable from deterministic inputs.

**5. Mock-mode for anchor demos — `codex-main.md`, line ~1226**
Deterministic fixtures for `show_0001`, `show_0007`, and `show_coastal_spell_dispute` behind a `?mock=1` query param. A reviewer without an OpenAI key can still see the artifact UI on the three anchor shows. This is a reviewer-experience consideration, not a feature.

**6. Polish thread opens with the same recon pattern — `codex-polish.md`, line 1-60**
The polish conversation begins by running `git status`, `git log`, and `git diff` before touching any code, mapping the open work set, and confirming what's staged vs. unstaged. Consistent pattern across conversations: never act before reading state.

## A note on AI usage

These conversations show me directing Codex like a teammate, not a coding tool. Most of my messages are framing decisions ("here's the slice, here's the constraint"), evidence requests ("run these seven audits"), or scope-narrowing fixes ("fix this specific thing, do not touch these other things"). Codex wrote the code. The design choices are mine, the constraints are mine, and the verification commands are mine. The model worked well exactly because the prompts left it no room to overreach.
