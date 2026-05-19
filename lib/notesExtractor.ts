/**
 * Notes → fields extractor.
 *
 * Reads dealNotesFreetext and compares it against the five structured fields
 * that drive settlement math. Returns two categories:
 *
 *   contradictions — a value in the notes explicitly disagrees with a field
 *                    (e.g. notes say 85%, field says 75%)
 *   ambiguities    — the notes mention a concept that needs a field value but
 *                    none is set (e.g. recoup mentioned, no recoupBasis)
 *
 * Each contradiction includes a suggestedValue so the UI can offer a
 * one-click "Update field to X" fix — detection and resolution in the same pass.
 *
 * Stored in deals.notesExtractionJson so every page load reads from cache.
 * Re-runs on every PATCH to either dealNotesFreetext or a structured field.
 */

import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { db } from "@/db";
import { deals } from "@/db/schema";
import { eq } from "drizzle-orm";
import type { Deal } from "@/db/schema";

// -------- Output types --------

export type FieldContradiction = {
  /** The deal field name (matches Deal type keys) */
  field: keyof Deal;
  /** Human label for the field */
  label: string;
  /** What the structured field currently says */
  currentValue: string;
  /** What the notes say */
  notesSay: string;
  /** The raw quote from the notes */
  excerpt: string;
  /** Suggested value to update the field to (for one-click fix) */
  suggestedValue: string | number | null;
  severity: "error" | "warning";
};

export type FieldAmbiguity = {
  /** Which field needs to be filled to resolve this */
  field: keyof Deal;
  label: string;
  /** What the notes say that raised the ambiguity */
  excerpt: string;
  /** The question that needs answering */
  question: string;
};

export type ShadowDeal = {
  dealType: "flat" | "vs" | "percentage_of_net" | "percentage_of_gross" | "door" | null;
  guaranteeAmount: number | null;
  percentage: number | null;
  percentageBasis: "gross" | "net" | null;
  expenseCap: number | null;
  recoupBasis: "inside_cap" | "outside_cap" | null;
  /** Quotes from the notes used to justify these values */
  justifications: { field: string; quote: string }[];
};

export type NotesExtractionResult = {
  contradictions: FieldContradiction[];
  ambiguities: FieldAmbiguity[];
  shadowDeal: ShadowDeal;
  extractedAt: string;
  hasIssues: boolean;
};

// -------- Gemini schema --------

const RESPONSE_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    shadowDeal: {
      type: SchemaType.OBJECT,
      properties: {
        dealType: { type: SchemaType.STRING, enum: ["flat", "vs", "percentage_of_net", "percentage_of_gross", "door"] },
        guaranteeAmount: { type: SchemaType.NUMBER, nullable: true },
        percentage: { type: SchemaType.NUMBER, nullable: true },
        percentageBasis: { type: SchemaType.STRING, enum: ["gross", "net"], nullable: true },
        expenseCap: { type: SchemaType.NUMBER, nullable: true },
        recoupBasis: { type: SchemaType.STRING, enum: ["inside_cap", "outside_cap"], nullable: true },
        justifications: {
          type: SchemaType.ARRAY,
          items: {
            type: SchemaType.OBJECT,
            properties: {
              field: { type: SchemaType.STRING },
              quote: { type: SchemaType.STRING }
            },
            required: ["field", "quote"]
          }
        }
      },
      required: ["dealType", "justifications"]
    },
    contradictions: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          field: { type: SchemaType.STRING },
          label: { type: SchemaType.STRING },
          currentValue: { type: SchemaType.STRING },
          notesSay: { type: SchemaType.STRING },
          excerpt: { type: SchemaType.STRING },
          suggestedValue: { type: SchemaType.STRING },
          severity: { type: SchemaType.STRING, enum: ["error", "warning"] },
        },
        required: ["field", "label", "currentValue", "notesSay", "excerpt", "suggestedValue", "severity"],
      },
    },
    ambiguities: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          field: { type: SchemaType.STRING },
          label: { type: SchemaType.STRING },
          excerpt: { type: SchemaType.STRING },
          question: { type: SchemaType.STRING },
        },
        required: ["field", "label", "excerpt", "question"],
      },
    },
  },
  required: ["shadowDeal", "contradictions", "ambiguities"],
};

const SYSTEM_PROMPT = `You are a deal validation and intent-extraction assistant for an independent music venue. Your job is to extract the "Negotiated Truth" from a booker's prose deal notes and compare it against structured database fields.

STEP 1: EXTRACT SHADOW DEAL
Read the notes and build a full deal structure. This is the "Shadow Deal."
Fields to extract:
- dealType: "flat", "vs", "percentage_of_net", "percentage_of_gross", "door"
- guaranteeAmount: numerical value
- percentage: decimal (0.85 = 85%)
- percentageBasis: "gross" or "net"
- expenseCap: numerical value
- recoupBasis: "inside_cap" or "outside_cap"
- justifications: A list of objects with "field" and "quote" from the notes that justifies the extracted value.

STEP 2: FIND CONTRADICTIONS
Compare your extracted Shadow Deal against the current structured fields provided.
Flag an error if your extracted "Negotiated Truth" explicitly disagrees with the manual field.

STEP 3: FIND AMBIGUITIES
Flag an ambiguity if the notes mention a concept (like a recoup) but don't state the required logic (like whether it is inside or outside the cap).

SEVERITY:
- "error": settlement will be wrong if not fixed.
- "warning": worth confirming.

Return everything in the requested JSON format. 

CRITICAL RULE 1: Build the shadowDeal EXCLUSIVELY from the "Deal notes". 
CRITICAL RULE 2: DO NOT use any numbers or values found in the "Current structured fields" section to populate the shadowDeal. Those fields are ONLY for Step 2 (finding contradictions).
CRITICAL RULE 3: If a value (like expenseCap or recoupBasis) is NOT explicitly mentioned in the notes, you MUST leave it null. Never guess or reuse values.
CRITICAL RULE 4: Never set a numeric field to 0 to mean "not mentioned" or "no cap". 0 is a real value meaning zero dollars. If the notes don't state an expenseCap, set it to null — not 0.
CRITICAL RULE 5: Phrases like "no expenses" or "no cap" in the notes do NOT mean expenseCap = 0. They mean expenseCap = null (not set). Do not flag a contradiction for a field that is simply absent from the notes.
CRITICAL RULE 6: The expenseCap is a ceiling on TOTAL expenses charged to the artist (e.g. "expenses capped at $2,500", "expense cap $700"). A marketing recoup, marketing expense, or marketing cost is a SPECIFIC line item — it is NOT the expense cap. If notes say something like "500 on marketing expense", "marketing recoup of $900", or "marketing cost $X", do NOT set expenseCap to that value. Instead, add a justification entry with field "recoupBasis" and the relevant quote, so the ambiguity (inside cap or outside cap?) can be surfaced to the user.
`;

// -------- Format helpers --------

function describeFields(deal: Deal): string {
  return [
    `dealType: ${deal.dealType}`,
    deal.guaranteeAmount != null ? `guaranteeAmount: $${deal.guaranteeAmount.toLocaleString()}` : `guaranteeAmount: not set`,
    deal.percentage != null ? `percentage: ${(deal.percentage * 100).toFixed(0)}%` : `percentage: not set`,
    deal.expenseCap != null ? `expenseCap: $${deal.expenseCap.toLocaleString()}` : `expenseCap: not set`,
    deal.recoupBasis ? `recoupBasis: ${deal.recoupBasis}` : `recoupBasis: not set`,
  ].join("\n");
}

// -------- Main extractor --------

export async function extractAndStoreNotes(deal: Deal): Promise<NotesExtractionResult | null> {
  console.log(`[AI] Starting extraction for show ${deal.showId}...`);
  if (!deal.dealNotesFreetext?.trim()) {
    console.log("[AI] No notes found, skipping.");
    return null;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "your_api_key_here") return null;

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: "gemini-flash-latest",
    systemInstruction: SYSTEM_PROMPT,
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA as never,
      temperature: 0.1,
    },
  });

  const prompt = `
[DEAL NOTES]
${deal.dealNotesFreetext}

[CURRENT STRUCTURED FIELDS (FOR COMPARISON ONLY)]
${describeFields(deal)}

TASK:
1. Build a Shadow Deal EXCLUSIVELY from [DEAL NOTES].
   - DO NOT look at [CURRENT STRUCTURED FIELDS] when deciding what belongs in the shadowDeal.
   - If a value is not in [DEAL NOTES], set it to null.
2. Compare your extracted Shadow Deal against [CURRENT STRUCTURED FIELDS] to find contradictions.

(Request ID: ${Date.now()})
`;

  let raw: NotesExtractionResult;
  try {
    const result = await model.generateContent(prompt);
    let text = result.response.text();
    // Strip markdown code blocks if present
    text = text.replace(/```json\n?/, "").replace(/\n?```/, "").trim();
    raw = JSON.parse(text);
  } catch (error) {
    const is429 =
      error != null &&
      typeof error === "object" &&
      "status" in error &&
      (error as { status: number }).status === 429;

    if (is429) {
      // Store a rate-limit marker so the next page load / button click doesn't
      // immediately retry and burn another quota slot.
      const retryAfter = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      await db
        .update(deals)
        .set({ notesExtractionJson: JSON.stringify({ rateLimited: true, retryAfter }) })
        .where(eq(deals.showId, deal.showId));
      console.warn(`[AI] Rate limited — marked show ${deal.showId}, retry after ${retryAfter}`);
    } else {
      console.error("Gemini API failed or returned invalid JSON:", error);
    }
    return null;
  }

  // Drop contradictions where the AI suggested 0 for a cap/amount field —
  // this means the notes didn't mention the value; 0 is not a meaningful cap.
  const CAP_FIELDS = new Set(["expenseCap", "hospitalityCap", "guaranteeAmount"]);
  const cleanedContradictions = (raw.contradictions ?? []).filter((c) => {
    if (CAP_FIELDS.has(c.field) && (c.suggestedValue === "0" || c.suggestedValue === 0)) return false;
    return true;
  });

  // Drop shadow deal numeric fields that came back as 0 (model didn't find them, defaulted to 0)
  const shadow = raw.shadowDeal;
  if (shadow.guaranteeAmount === 0) shadow.guaranteeAmount = null;
  if (shadow.expenseCap === 0) shadow.expenseCap = null;
  if (shadow.percentage === 0) shadow.percentage = null;

  const extraction: NotesExtractionResult = {
    contradictions: cleanedContradictions,
    ambiguities: raw.ambiguities ?? [],
    shadowDeal: shadow,
    extractedAt: new Date().toISOString(),
    hasIssues: cleanedContradictions.length > 0 || (raw.ambiguities?.length ?? 0) > 0,
  };

  await db
    .update(deals)
    .set({
      notesExtractionJson: JSON.stringify(extraction),
      shadowDealJson: JSON.stringify(raw.shadowDeal),
    })
    .where(eq(deals.showId, deal.showId));

  console.log(`[AI] Extraction complete for show ${deal.showId}.`);
  return extraction;
}

export function parseStoredExtraction(json: string | null | undefined): NotesExtractionResult | null {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json) as NotesExtractionResult & { rateLimited?: boolean };
    if (parsed.rateLimited) return null; // Surface "Check now" button, not stale error state
    return parsed;
  } catch {
    return null;
  }
}

/** Returns true if notes_extraction_json holds a rate-limit marker (not a real result). */
export function isRateLimited(json: string | null | undefined): { limited: boolean; retryAfter?: string } {
  if (!json) return { limited: false };
  try {
    const parsed = JSON.parse(json) as { rateLimited?: boolean; retryAfter?: string };
    if (parsed.rateLimited) return { limited: true, retryAfter: parsed.retryAfter };
  } catch { /* ignore */ }
  return { limited: false };
}
