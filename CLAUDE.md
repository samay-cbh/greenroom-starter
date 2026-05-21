# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Greenroom is a settlement product for independent music venues. This repo is a
deliberately incomplete starter codebase for an Applied AI PM case study — "a
working but mediocre product" where every workflow has gaps on purpose. The
incompleteness is the point of the exercise; do not treat gaps as bugs to fix
unless the task explicitly asks for it.

## Commands

Run all commands from the `greenroom-starter/` directory (the repo root, a
subdirectory of the workspace).

```bash
npm install          # install dependencies
npm run dev          # start Next.js dev server at http://localhost:3000
npm run build        # production build
npm run lint         # eslint
npm run db:push      # apply schema.ts to the SQLite file via drizzle-kit
npm run db:seed      # regenerate 24 months of synthetic data (deterministic, seed=42)
npm run db:reset     # drop the db file, re-push schema, re-seed
npm run db:studio    # Drizzle Studio table browser at local.drizzle.studio
```

There is no test suite — `lint` and `build` are the only correctness checks.

Windows note: `db:reset` uses `rm -f`, a Unix command. On this Windows machine
run `db:reset` from Git Bash/WSL, or run the equivalent manually in PowerShell:
`Remove-Item data/greenroom.db -Force; npm run db:push; npm run db:seed`.

## Architecture

Next.js 16 App Router + React 19 + TypeScript. Drizzle ORM over libsql
(pure-JS SQLite, file at `data/greenroom.db`). Path alias `@/*` maps to repo
root. Tailwind CSS 4 with shadcn-style primitives in `components/ui/`.

Data flow is one-directional and read-only: **async Server Components call
query helpers in [lib/queries.ts](lib/queries.ts) → Drizzle → SQLite.** There
are no API routes, no mutations, no client-side data fetching. The app only
ever displays seeded data.

Key modules:

- **[db/schema.ts](db/schema.ts)** — all 11 tables, heavily commented. The
  domain model: venues → shows → deals/ticket_sales/comps/expenses/settlements.
- **[lib/queries.ts](lib/queries.ts)** — every read goes through here. Note
  `getAllShows()` and `getReports()` filter to **past shows only** (`date <=
  today`), so the visible dataset grows as real days pass.
- **[lib/dealMath.ts](lib/dealMath.ts)** — the settlement calculation engine.
- **[lib/settlementStage.ts](lib/settlementStage.ts)** — the settlement state
  machine: `draft → submitted → in_review → signed → finalized → paid`, with a
  `disputed → revised` branch and `voided` terminal off-ramp.

Routes live in `app/`: `/shows`, `/shows/[id]`, `/shows/[id]/settle`,
`/artists`, `/reports`, `/context`. The `/context` page is candidate
orientation. `components/command-palette/` is the ⌘K global search.

## Two deliberate seams (central to the case study)

1. **`dealMath.ts` is intentionally incomplete.** It settles only `flat` and
   `percentage_of_gross` deals end-to-end. For `vs`, `percentage_of_net`, and
   `door` deals it returns `{ supported: false }` and the settle page renders an
   empty state. This is by design — roughly half of seeded deals are
   unsupported types.

2. **Structured deal fields are unreliable; the prose is the truth.** On the
   `deals` table, `dealNotesFreetext` is what the booker actually trusts.
   `guaranteeAmount`, `percentage`, `bonusesJson`, etc. are filled
   inconsistently. `bonusesJson` is parsed by the engine but is often empty
   even when the prose describes bonuses. Do not assume structured fields and
   prose agree.

When changing settlement behavior, both `lib/dealMath.ts` (calculation) and
`app/shows/[id]/settle/page.tsx` (the supported vs. unsupported rendering
branches) usually need to move together.

## The data is intentionally messy

`data/greenroom.db` holds ~540 shows of synthetic-but-realistic data. Statuses
can contradict the underlying numbers; patterns hide across many unremarkable
rows. The `data/` markdown files (`ceo-memo.md`, `dispute-thread.md`,
`transcripts/*.md`) carry context the database deliberately omits — read them
when reasoning about product behavior. Query the SQLite file directly when
investigating; don't trust the UI's surface view.

### Note on the read-only architecture
The existing codebase has no API routes and no mutations — all data flow 
is Server Components → queries.ts → Drizzle → SQLite. The Deal Intake 
feature breaks this pattern by necessity (it calls the Anthropic API and 
writes to a new `deal_parses` table). When introducing the mutation 
surface, do it in a way that minimizes drift from the existing patterns:
- API routes live under `app/api/`, named for what they do
- Write helpers live in a new `lib/mutations.ts` alongside `queries.ts`
- Server Actions are acceptable if cleaner than route handlers for a 
  given case — propose both and pick deliberately

### Demo data assumptions (to verify)
The three demo shows reference specific seeded data:
- Coastal Spell, March 14 2025 (referenced in data/dispute-thread.md)
- Post Hill (a Vs deal; from the case study screenshots)
- House of Lights (a Flat deal; from the case study screenshots)

Before building, confirm these shows exist in the seed and inspect their 
deals.dealNotesFreetext to ensure they are realistic enough to demo. 
If the seed prose is too clean, we may need to override it for these 
three shows specifically (a small migration, not a re-seed).

## Project context: Greenroom case study

### What this project is
This is a take-home for an Applied AI PM role at Clipboard. I'm building 
a focused slice of a fictional venue-software product called Greenroom. 
The starter repo is a deliberately mediocre product; my job is to pick 
one slice and take it deep.

### The slice I'm building: Deal Intake
An AI-assisted workflow that ingests prose deal emails from agents, 
extracts structured deal terms, flags ambiguous clauses, and drafts 
clarifying replies to the agent — all before the show is confirmed. 
The bet is that disputes like the March 2025 Coastal Spell incident 
($720 concession + reputation cost with WME) are preventable upstream, 
at deal intake, not at 2am settlement.

### What I'm explicitly NOT building
- A working Vs-deal calculator (the obvious move; deliberately cut)
- An audit-trail / Show Your Work settlement view
- A real-time settlement predictor
- A 2am walkthrough copilot
- Post-show agent communication
- A dispute resolution workflow

The memo will defend these cuts. Don't drift into building them.

### Demo arc (3 shows)
1. **Coastal Spell (March 14, 2025)** — the canonical dispute. Replay 
   Andrea's December 2024 email through the Deal Reader. It flags the 
   $900 marketing recoup as ambiguous and drafts a clarifying reply. 
   The $720 concession never happens.
2. **Post Hill (a Vs deal)** — settlement page currently says "the 
   in-app tool can't settle a vs deal yet." After Deal Intake, the deal 
   is structured. (Settlement math itself is not in scope for this slice.)
3. **House of Lights (a Flat deal)** — Deal Reader correctly identifies 
   no ambiguity, proposes no clarifying email. The existing flat flow is 
   untouched. (Regression case.)

### Design principles
- Conservative parsing: better to flag a clean clause than miss an 
  ambiguous one. Show confidence levels in the UI.
- Persist every parse with full lineage (model, prompt version, input, 
  output, timestamp). New table: `deal_parses`.
- Production patterns over demo shortcuts: cached prompt system message, 
  structured JSON output, graceful failure if ANTHROPIC_API_KEY is unset.
- One new route (`/shows/[id]/deal-intake`) or modal — don't sprawl.
- Match the existing visual language (Fraunces serif, brutalist-ish, 
  the green accent). Don't reskin.

### Tech decisions already made
- Anthropic API, `claude-sonnet-4-6`, server-side via Next.js route 
  handler. Never expose the key to the client.
- Use Anthropic prompt caching on the system prompt (cache_control).
- Structured JSON output via prompting (response should be JSON-only, 
  no preamble or fences).
- New DB table `deal_parses`: id, deal_id, version, parsed_json, 
  ambiguity_flags_json, suggested_email, model, prompt_version, 
  created_at. Drizzle ORM, libsql, same patterns as the existing schema.

### How I want to work with you
- Confirm architecture before writing code. If a decision isn't 
  obvious, propose 2 options with trade-offs, then ask.
- Stage work incrementally. I'll review and confirm between stages.
- Prefer small, reviewable diffs over sweeping edits.
- When you propose a prompt for the Anthropic API, show me the full 
  prompt text and explain the design choices.
- Don't add dependencies without asking. The existing stack is enough.

### What "done" looks like for this case study
A working prototype I can demo in a 7-minute Loom, plus an honest 
1-2 page memo. I am not optimizing for feature completeness. I am 
optimizing for one slice that's good enough to defend in a live 
45-minute interview.