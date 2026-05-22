<div align="center">

# Greenroom — Deal Modeling Slice

**The Deal Brief: turning fuzzy deal emails into a confirmed source of truth before the show.**

Built by Febin as a case study response for the Greenroom Applied AI PM role.

</div>

---

## What this is

The original Greenroom product had a settlement workflow that couldn't handle ~62% of real deals (Vs, percentage-of-net, door, walkout, ratchet). The deeper problem was upstream: deal terms in the email and the structured database fields rarely agreed, and there was no canonical version anyone could point to. The Coastal Spell dispute (`data/dispute-thread.md`) cost the venue $720 and an agent relationship over a single ambiguous sentence.

This branch ships **The Deal Brief** — a Wednesday tool that:

1. **Extracts** structured terms from the deal email (regex first, AI only when needed)
2. **Flags ambiguous sentences** with computed dollar swings (the Coastal Spell pattern)
3. **Surfaces contradictions** against the existing database (percentage drift, cross-show patterns, etc.) — all in SQL, no AI
4. **Confirms in writing** — Mariana sends one clarification email, gets "confirmed" back, the brief locks
5. **Feeds the settlement engine** — closing the 62% unsupported-deal gap as a byproduct

Read the [memo](MEMO.md) for the full design rationale.

---

## Quickstart (under 2 minutes)

```bash
git clone https://github.com/YOUR-USERNAME/greenroom-starter
cd greenroom-starter
npm install
npm run dev
```

Open **[http://localhost:3000](http://localhost:3000)**. You're logged in automatically as Mariana Reyes, lead booker at The Crescent.

### Optional but recommended — set an AI key

The Deal Brief works without an API key (regex parser handles ~72% of deals, manual entry covers the rest). To unlock the LLM-powered ambiguity detection and extraction for unusual emails, set one of these:

```bash
cp .env.example .env.local
```

Then edit `.env.local`:

```bash
# Option 1 — Groq (RECOMMENDED — 30 RPM free, ~500ms inference)
GROQ_API_KEY=gsk_...

# Option 2 — Gemini (10 RPM free, ~2s inference)
GEMINI_API_KEY=AIza...
```

Then restart `npm run dev`.

---

## How to use the Deal Brief

The new product surface lives at **`/shows/[id]/brief`**. Get there from any show detail page via the green "Confirm the deal" banner.

### The four-step workflow

1. **Paste the deal email** into the textarea. Real emails from agents, exactly as written. (Subject line, signature, etc. all fine.)
2. **Click Extract.** The page parses the email and shows:
   - Structured terms (guarantee, percentage, expense cap, hospitality cap, bonuses, recoups with placement tags)
   - **Ambiguities** — sentences with multiple readings + dollar impact
   - **Contradictions** — findings from cross-checking the brief against the database
3. **Send a clarification** (if needed). The page drafts a one-line email Mariana can edit. After the agent replies "confirmed", paste their reply into the agent-reply field.
4. **Click "Confirm with agent reply"** (or "Mark as confirmed (manual override)" if you've handled it out-of-band).

Once confirmed, the settle page at `/shows/[id]/settle` switches from the legacy calculator to the brief-backed calculator. Vs deals, walkouts, ratchets — all now work end-to-end. Every line of the worksheet shows its citation back to a brief clause.

### Five lifecycle states

| State | What it means |
|---|---|
| **No brief yet** | Show has no brief. CTA: "Confirm the deal before settlement." |
| **Draft** | Brief extracted, not yet confirmed. Settle page still uses legacy data. |
| **Awaiting agent reply** | Mariana sent the clarification, waiting on the agent. |
| **Confirmed** | Brief is the source of truth. Settle page uses it. |
| **Superseded** | A newer version replaced this one. Kept on file as v1, v2, etc. |

---

## How the AI is used (and not used)

The system uses AI for exactly **two** tasks:

1. **Extracting structured terms from messy prose** when regex isn't confident enough
2. **Detecting ambiguity** — sentences that two careful readers could interpret differently

Everything else is plain code. Cross-show patterns are SQL. The clarification email is a template (Mariana's voice, not the model's). The math is regular arithmetic. **The AI proposes; Mariana confirms; every time.**

### The 4-tier pipeline

```
Tier 0 — Regex parser              ~5ms   $0      72% of deals
Tier 1 — Local embeddings clone    ~50ms  $0      +5% (near-duplicates)
Tier 2 — Free-tier LLM             ~2s    free    +15% (the weird ones)
Tier 3 — Manual entry              Mariana's time  ~3% remainder
```

**~80% of real deals never touch the LLM.** Steady-state cost at one venue: **free**. At Greenroom's 340-venue scale: ~$10/month/venue.

### Where to get the API keys

| Provider | Sign up | Free tier | Cost note |
|---|---|---|---|
| **Groq** (recommended) | [console.groq.com/keys](https://console.groq.com/keys) | 30 RPM, generous daily quota | Llama 3.3 70B, ~500ms inference |
| **Gemini** (alternative) | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) | 10 RPM, 250 requests/day | Gemini 2.5 Flash, ~2s inference |

Both require a Google account. Both are free to start. Groq is faster and has more headroom on the free tier — if you hit rate limits on one, fall back to the other.

### Forcing a specific provider

By default the system auto-picks: Groq → Gemini → Manual. To force one:

```bash
# .env.local
AI_PROVIDER=groq    # or 'gemini' or 'manual'
```

`AI_PROVIDER=manual` skips the LLM entirely — useful for cost-sensitive testing or when you want to demo without any key configured.

---

## What the routes do

| Route | What it is | Modified by this slice? |
|---|---|---|
| `/shows` | Mariana's home view, ~540 past shows | No |
| `/shows/[id]` | Show detail | Yes — added Deal Brief CTA banner |
| `/shows/[id]/brief` | **The Deal Brief page (new)** | **New** |
| `/shows/[id]/settle` | Settlement worksheet | Yes — uses brief when confirmed, falls back to legacy otherwise |
| `/artists` | Artist roster | No |
| `/reports` | Aggregate metrics | No |
| `/context` | Candidate orientation | No |

### Walkthrough: see the slice working in 3 minutes

1. Open any show with a vs deal (e.g. browse `/shows` and pick one with a "Vs deal" badge)
2. Click **Confirm the deal** on the show detail page
3. Paste a deal email (samples below) and click **Extract**
4. Watch the badge — `tier0_parser` means regex handled it; `groq-llama-3.3-70b` means the LLM ran
5. Look at the right rail: ambiguities (if any) and contradictions
6. Click **Mark as confirmed (manual override)**
7. Navigate to `/shows/[id]/settle` — the previously "unsupported" page now shows brief-backed math with citations

### Sample emails to paste

**Triggers Tier 2 (LLM) + ambiguity detection:**
```
Subject: Cold Comfort — Saturday, May 30 — Deal terms

Hi Mariana,

Confirming Cold Comfort for The Crescent on Saturday May 30.

Deal: $3,665 guarantee vs 80% of net after expenses, whichever greater.
Expenses capped at $1,850. Hospitality cap $400.
Marketing recoup of $600 against gross.

Thanks,
Kev Park
CAA
```

**Handled by Tier 0 regex (no LLM call):**
```
Subject: The Quiet Houses — Monday, June 15 — Deal

Mariana,

Quiet Houses for 6/15. Standard vs deal.

$6,337 guarantee vs 75% of net after expenses.
Expense cap $3,150, hospitality $300.
+$1,150 if attendance clears 585.

— Daniel Hwang, WME
```

---

## How the data is shaped

24 months of synthetic operational data, deterministic from a fixed seed:

| Table | Approx rows | What it represents |
|---|---|---|
| `shows` | ~540 | 24 months of shows. Past + 60 days forward. |
| `artists` | 59 | Mix of recurring (A-tier) and one-off (D-tier) acts |
| `agents` | 14 | Across WME, CAA, Wasserman, Paradigm, independents |
| `deals` | ~540 | One per show. Flat ~33%, Vs ~33%, % of net ~24%, door ~5%, % of gross ~4% |
| `ticket_sales` | ~540 | One summary row per show |
| `comps` | ~1,900 | Comp tickets across 6 categories |
| `expenses` | ~2,900 | Sound, lights, hospitality, marketing, production, backline |
| `settlements` | ~540 | All shows have settlement data |
| **`deal_briefs`** *(new)* | **0 at start** | **Briefs created by the new flow** |

### A few things worth knowing

**The deal `notes_freetext` field is the truth.** Structured fields (`guarantee_amount`, `percentage`, etc.) are filled inconsistently. The brief flow reads the prose, not the structured fields — that's the design.

**Vs deals come in flavors.** Standard, walkout pot, tier ratchet, vs-gross. The brief schema makes `vsFlavor` first-class so all four settle correctly.

**Recoups have a placement field.** New in the brief schema: `inside_cap` or `outside_cap`. This is the single field that would have prevented the $720 Coastal Spell dispute.

**12 deliberate data contradictions are planted** in `db/seed.ts:1051-1320`. The brief's contradiction-checks surface 9 of them. Try `npm run db:studio` and inspect the `deal_briefs` table after a few confirms.

---

## Context files in the repo

```
data/
├── ceo-memo.md            # Pri's Q4 memo — the strategic frame
├── dispute-thread.md      # The March 2025 marketing-recoup dispute, in full
├── greenroom.db           # SQLite database — pre-seeded, ready to go
└── transcripts/
    ├── mariana.md         # 30-min interview with the booker
    ├── diego.md           # Tour manager perspective
    ├── marcus.md          # GM perspective
    └── sarah-kim.md       # Agent perspective (WME)
```

The transcripts contain the signals that drove every design decision in this slice. Read them before judging the brief.

---

## File map (new files in **bold**)

```
app/
  shows/[id]/
    brief/                          ★ NEW — the Deal Brief surface
      page.tsx                      ★ Server component (loads show + brief)
      brief-client.tsx              ★ Interactive — paste, extract, edit, confirm
      actions.ts                    ★ Server actions (extract / confirm / etc.)
    settle/page.tsx                 modified — uses brief when confirmed
    page.tsx                        modified — added Brief CTA banner
lib/
  dealBrief.ts                      ★ Zod schemas + safe-parse helpers
  tierZeroParser.ts                 ★ Deterministic regex parser
  aiPrompts.ts                      ★ LLM system prompts + JSON schemas
  aiProvider.ts                     ★ Groq + Gemini + Manual provider abstraction
  embeddings.ts                     ★ Local embeddings (Xenova MiniLM)
  contradictionChecks.ts            ★ 8 per-show SQL checks + cross-show pattern
  dealMath.ts                       modified — added brief-backed calculator
  queries.ts                        modified — added brief queries
db/
  schema.ts                         modified — added deal_briefs table
  migrations/0001_*.sql             ★ NEW migration
scripts/
  validate-flows.ts                 ★ End-to-end validation against three test shows
.env.example                        ★ Documents both API key options
```

---

## Tech stack

- **Next.js 16** (App Router) + **React 19** + **TypeScript**
- **Drizzle ORM** + **libsql** (pure-JS SQLite — no native compile)
- **Tailwind 4** with shadcn-style component primitives
- **Zod 4** for runtime validation
- **groq-sdk** + **@google/generative-ai** for the AI providers
- **@xenova/transformers** for local embeddings (MiniLM-L6, ~30MB, runs in Node)

Everything is conventional. No vector DB. No Python service. No queue. Runs entirely in the existing Next.js process.

---

## Useful commands

```bash
npm run dev          # Start dev server
npm run build        # Production build
npm run lint         # ESLint
npm run db:reset     # Drop and reseed the database (~5s, deterministic)
npm run db:studio    # Visual table browser at local.drizzle.studio

# Validate the full flow end-to-end (creates 3 confirmed briefs)
npx tsx scripts/validate-flows.ts
```

---

## Submission

- **Repo:** this branch — `Febin-deal-modeling`
- **Memo:** [MEMO.md](MEMO.md)
- **Loom:** [link]

---

## Troubleshooting

### "Port 3000 is already in use"
```bash
# Mac/Linux
lsof -ti:3000 | xargs kill -9
# Or run on another port
npm run dev -- -p 3001
```

### "SQLITE_READONLY_DBMOVED" error after `npm run db:reset`
You ran `db:reset` while the dev server was still holding the old file handle. Stop the dev server with `Ctrl+C`, then `npm run dev` again. The error message in the brief page UI explains this when it happens.

### Brief page shows "Manual mode" warning
No API key is set. Either set `GROQ_API_KEY` or `GEMINI_API_KEY` in `.env.local` and restart the dev server, or proceed in manual mode — the brief page still works, you just enter terms by hand.

### Rate limit errors during extraction
Switch providers. If you're using Gemini (10 RPM), get a Groq key (30 RPM) and add it to `.env.local`. The system auto-prefers Groq when both are set.

### Tier 1 clone doesn't fire
You need at least one **confirmed** brief in the database for the embedding search to have anything to clone from. Confirm a brief on one show first, then try a similar email on a different show — similarity must be ≥ 0.95.

### "I want to wipe all briefs but keep everything else"
```bash
sqlite3 data/greenroom.db "DELETE FROM deal_briefs;"
```

### Page errors out / "Module not found"
```bash
rm -rf node_modules package-lock.json .next
npm install
npm run dev
```

### Reset to a completely clean state
```bash
# Stop the dev server first (Ctrl+C)
npm run db:reset
npm run dev
```

Deterministic — same seed data every time. Date-dependent shows (today + 60 days forward) will shift, but show IDs stay stable.

---

Welcome to The Crescent. The brief is the source of truth.
