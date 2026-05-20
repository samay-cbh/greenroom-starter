# Greenroom Case Study — Pallavi Gupta

Applied AI PM submission. Six surfaces of settlement; I picked **deal modeling** and took it deep.

**The cut in one line:** Capture the deal as a structured, AI-parsed, dual-signed artifact *before* show night — because that's where disputes actually start.

---

## Details

1. **PRD memo** — `Pallavi's/prd_memo.md` (the slice, design choices, trade-offs, what I cut)
2. **Prototype** — run locally, see below
3. **Evidence notebook** *(optional)* — `Pallavi's/evidence_verification.ipynb`. Not required to follow the case; included for anyone who wants to see the DB queries behind the numbers.

## Run the prototype

```bash
npm install
npm run dev
```

Then open `http://localhost:3000/deals`. That's the slice. The rest of the app is the starter codebase as-is. Full setup notes in `SETUP.md`.

**A couple of notes that might be helpful as you click around:**

- The prototype is a scripted walkthrough of one deal — deliberately the path that carries ambiguity (an unclear clause gets flagged, sent back to the agent, clarified, and resolved), since that's the case the slice is designed for. Dropdowns and form fields outside that scripted deal use synthetic values, so selections may not always carry into the next screen. It's best read as a click-through of the intended experience rather than a fully functional form.
- The AI parsing is staged for the demo — no live LLM runs behind the scenes. The "AI-extracted" fields are pre-filled to show what the real flow would produce; the model integration itself is described in the PRD memo.

## Where the work lives

| Folder / file | What it is |
|---|---|
| `app/deals/` | The prototype — deal capture flow with AI classification + agent approval round-trip |
| `Pallavi's/prd_memo.md` | PRD memo: the slice, design choices, trade-offs, what got parked |
| `Pallavi's/evidence_verification.ipynb` | DB queries and analysis behind every headline number |
| `Pallavi's/dealnotes_inductive_codes.md` | Inductive coding of all 501 deal notes → 12 patterns, 0 unmatched |
| `Pallavi's/mockups.html` | Low-fi wireframes for the deal-capture flow |
| `Pallavi's/product-context.md` | Deeper product reference (settlement mechanics, deal types, data quirks) |
| `CLAUDE.md` | The brief I worked from (company overview, task framing, principles) |

---

*Happy to walk through any of this in the interview — especially the trade-offs and the surfaces I parked.*
