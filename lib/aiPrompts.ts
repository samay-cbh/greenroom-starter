/**
 * Prompts and JSON schemas for the Deal Brief extraction pipeline.
 *
 * Kept separate from the provider transport (lib/aiProvider.ts) so prompt
 * tuning never touches request/response/cache plumbing.
 */

/**
 * System prompt for Tier 2 extraction. Designed to be specific to indie
 * venue settlement, dense in domain vocabulary, and constrained — the
 * model should fill the schema, not editorialize.
 */
export const EXTRACTION_SYSTEM_PROMPT = `You are a deal-terms extractor for an independent music venue settlement system.

You read short deal emails between venue bookers and artist agents and extract a typed DealBrief. The emails are written informally, often at 11pm by overworked agents. Treat them as the source of truth — they describe a legally binding business agreement.

Domain you need to know:

- Deal types: flat (fixed guarantee), percentage_of_gross (% of ticket sales, no expense deduction), percentage_of_net (% after expenses), vs (guarantee vs % of net, whichever is greater), door (artist takes door minus expenses).
- Vs deal flavors (when dealType="vs", you MUST set vsFlavor):
    * standard   — plain "$X vs Y% of net after expenses"
    * walkout    — "vs Y% net + walkout pot above breakeven" or "100% of gross above $X"
    * ratchet    — "Y% to Z% over X% sold" or "escalator" or "ratchet"
    * vs_gross   — "vs Y% of GROSS" or "no expense deductions"
- Recoups (marketing, hospitality overage, production overage, prior advance): venue costs taken off the top BEFORE artist payment. The single most disputed question is whether they sit INSIDE the expense cap (compete with other expenses) or OUTSIDE the cap (always come off the top separately). When the email is unclear about placement, default to "outside_cap" but note your uncertainty by setting confidence low.
- Expense cap: maximum total deductible expenses, e.g. "$2,500".
- Hospitality cap: subset of expense cap reserved for green-room costs (food, drink, snacks).
- Bonuses: gross_threshold (+$X if gross > $Y), sellout (+$X on sellout), attendance_threshold (+$X if attendance > N), tier_ratchet (different %s at different tiers), walkout_pot (typically 100% of gross above a breakeven number).

Rules:

1. Output ONLY the JSON object matching the provided schema. No prose.
2. If the email is silent on a field, set it to null for nullable scalars or an empty array [] for list fields. NEVER omit a required field. NEVER set arrays to null — use [] instead.
3. Set confidence per field in [0, 1]. 1 = the email states it verbatim and unambiguously. 0.5 = inferred. <0.3 = guessed.
4. Always set extractedBy="tier2_llm".
5. For every recoup mentioned, you MUST set a placement ("inside_cap" or "outside_cap"). If the email is genuinely ambiguous about placement, still pick one but set confidence low — the ambiguity pass will surface this separately.
6. For Vs deals, vsFlavor is required. If you can't tell, use "standard".
7. CRITICAL — Percentages: emit ALL percentage fields as DECIMAL FRACTIONS between 0.0 and 1.0. "80%" → 0.80. "85% of net" → 0.85. "100% above breakeven" → 1.0. This applies to:
     - the top-level "percentage" field
     - every "percentage" inside tier_ratchet.tiers[]
     - "sharePctAbove" inside walkout_pot bonuses
   Never emit raw percentage points like 80 or 85. The system will treat 80 as 8000%.
8. Recoup category must be EXACTLY one of: "marketing", "hospitality_overage", "production_overage", "prior_advance", "damages", "other". Never use variants like "marketing_recoup" or "Marketing".
9. Every recoup needs a non-empty "label" string.

EXAMPLE — for the email "$5,000 vs 80% of net after expenses, capped $2,500, hospitality $500, marketing recoup $900 against gross":

{
  "dealType": "vs",
  "vsFlavor": "standard",
  "guaranteeAmount": 5000,
  "percentage": 0.80,
  "percentageBasis": "net",
  "expenseCap": 2500,
  "hospitalityCap": 500,
  "bonuses": [],
  "recoups": [
    {
      "category": "marketing",
      "label": "Marketing recoup",
      "amount": 900,
      "placement": "outside_cap"
    }
  ],
  "confidence": { "dealType": 0.95, "percentage": 0.95, "guaranteeAmount": 0.95 },
  "extractedBy": "tier2_llm"
}`;

/**
 * Prompt for the ambiguity-detection pass. A different cognitive task —
 * the model is hunting for sentences that have ≥2 defensible readings,
 * not extracting fields. Done as a separate call so the extraction
 * prompt isn't distracted.
 */
export const AMBIGUITY_SYSTEM_PROMPT = `You are an ambiguity detector for indie venue settlement deal emails.

A settlement is a money calculation. If a sentence in the deal email could lead two careful readers to different dollar amounts, that sentence is ambiguous and you must flag it.

The canonical example is the Coastal Spell dispute: "Expenses capped at $2,500, marketing recoup of $900 against gross." This can be read two ways:
- Reading A: The $900 marketing recoup is SEPARATE from the $2,500 expense cap (it comes off gross before expenses are applied).
- Reading B: The $900 marketing recoup is INSIDE the $2,500 cap (it counts against the cap, leaving $1,600 for other expenses).
The dollar swing was $720 on a single show.

Your job:

1. Read the email carefully.
2. Identify every sentence (or comma-separated phrase) where two settlement-relevant readings are possible.
3. For each, output: the exact source span (start/end character indexes in the email, plus the excerpt), readingA, readingB, and the dollarImpact in USD if you can estimate it (use null if not).
4. Ambiguity must be CONSEQUENTIAL — silence on a non-financial field doesn't count. The reading must change settlement math.
5. Do not flag sentences that are merely informal or terse — flag only sentences where intelligent reasonable parties could disagree on settlement amount.

Output ONLY the JSON array. No prose.`;

/**
 * JSON schema for Gemini structured-output mode (subset of OpenAPI).
 * Mirrors the zod DealBriefSchema in lib/dealBrief.ts. We maintain both
 * because Gemini's responseSchema doesn't accept zod directly and we
 * want the runtime safety of zod on whatever the model returns.
 */
export const DEAL_BRIEF_JSON_SCHEMA = {
  type: "object",
  properties: {
    dealType: {
      type: "string",
      enum: ["flat", "percentage_of_gross", "percentage_of_net", "vs", "door"],
    },
    vsFlavor: {
      type: "string",
      enum: ["standard", "walkout", "ratchet", "vs_gross"],
      nullable: true,
    },
    guaranteeAmount: { type: "number", nullable: true },
    percentage: { type: "number", nullable: true },
    percentageBasis: {
      type: "string",
      enum: ["gross", "net"],
      nullable: true,
    },
    expenseCap: { type: "number", nullable: true },
    hospitalityCap: { type: "number", nullable: true },
    bonuses: {
      type: "array",
      items: {
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: [
              "gross_threshold",
              "sellout",
              "attendance_threshold",
              "tier_ratchet",
              "walkout_pot",
            ],
          },
          label: { type: "string" },
          threshold: { type: "number", nullable: true },
          amount: { type: "number", nullable: true },
          breakeven: { type: "number", nullable: true },
          sharePctAbove: { type: "number", nullable: true },
          stacks: { type: "boolean", nullable: true },
          tiers: {
            type: "array",
            nullable: true,
            items: {
              type: "object",
              properties: {
                from: { type: "number" },
                to: { type: "number", nullable: true },
                percentage: { type: "number" },
              },
              required: ["from", "percentage"],
            },
          },
        },
        required: ["type", "label"],
      },
    },
    recoups: {
      type: "array",
      items: {
        type: "object",
        properties: {
          category: {
            type: "string",
            enum: [
              "marketing",
              "hospitality_overage",
              "production_overage",
              "prior_advance",
              "damages",
              "other",
            ],
          },
          label: { type: "string" },
          amount: { type: "number" },
          placement: {
            type: "string",
            enum: ["inside_cap", "outside_cap"],
          },
        },
        required: ["category", "label", "amount", "placement"],
      },
    },
    confidence: {
      type: "object",
      properties: {
        dealType: { type: "number" },
        guaranteeAmount: { type: "number" },
        percentage: { type: "number" },
        expenseCap: { type: "number" },
        hospitalityCap: { type: "number" },
      },
    },
    extractedBy: {
      type: "string",
      enum: ["tier0_parser", "tier1_clone", "tier2_llm", "manual"],
    },
  },
  required: ["dealType", "bonuses", "recoups", "confidence", "extractedBy"],
};

export const AMBIGUITY_JSON_SCHEMA = {
  type: "array",
  items: {
    type: "object",
    properties: {
      id: { type: "string" },
      span: {
        type: "object",
        properties: {
          start: { type: "number" },
          end: { type: "number" },
          excerpt: { type: "string" },
        },
        required: ["start", "end", "excerpt"],
      },
      readingA: { type: "string" },
      readingB: { type: "string" },
      dollarImpact: { type: "number", nullable: true },
    },
    required: ["id", "span", "readingA", "readingB"],
  },
};
