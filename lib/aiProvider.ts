/**
 * AI provider abstraction for Tier 2 (LLM) extraction.
 *
 * Three implementations today:
 *   - GroqProvider:   free-tier Llama 3.3 70B (30 RPM, ~250-400 tok/s — fast)
 *   - GeminiProvider: free-tier Gemini 2.5 Flash (10 RPM — tight)
 *   - ManualProvider: no-op, surfaces empty form for Tier 3 manual entry
 *
 * Selection is env-driven (AI_PROVIDER=groq|gemini|manual). If no
 * AI_PROVIDER is set, the factory picks whichever key is present:
 * Groq > Gemini > Manual. The brief page still works without any key.
 */

import { GoogleGenerativeAI, type Schema } from "@google/generative-ai";
import Groq from "groq-sdk";
import {
  DealBriefSchema,
  AmbiguitySchema,
  type DealBrief,
  type Ambiguity,
} from "@/lib/dealBrief";
import {
  EXTRACTION_SYSTEM_PROMPT,
  AMBIGUITY_SYSTEM_PROMPT,
  DEAL_BRIEF_JSON_SCHEMA,
  AMBIGUITY_JSON_SCHEMA,
} from "@/lib/aiPrompts";

export interface FewShotExample {
  email: string;
  brief: DealBrief;
}

/**
 * Normalize LLM output before zod validation.
 *
 * Different LLMs (and the same LLM on different days) drift from the
 * requested schema in predictable ways:
 *   - omit nullable fields entirely instead of emitting null
 *   - emit empty strings instead of null for nullable enums
 *   - send `null` for an array that should default to []
 *   - use "marketing_recoup" instead of "marketing" in recoup.category
 *   - put the recoup amount in a description field instead of label
 *
 * Rather than loosen the zod schema (which weakens type safety
 * downstream), we absorb the variance in one place. The schema stays
 * strict; the LLM output gets a thin defensive translation layer.
 */
function normalizeLLMBriefOutput(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const r = raw as Record<string, unknown>;

  // Coerce missing nullable numeric fields to null.
  for (const k of ["guaranteeAmount", "percentage", "expenseCap", "hospitalityCap"]) {
    if (r[k] === undefined) r[k] = null;
  }

  // Coerce invalid percentageBasis values to null (zod enum is strict).
  if (r.percentageBasis !== "gross" && r.percentageBasis !== "net") {
    r.percentageBasis = null;
  }

  // Coerce null/undefined arrays to empty arrays.
  if (r.bonuses == null) r.bonuses = [];
  if (r.recoups == null) r.recoups = [];

  // Normalize recoup objects.
  const validCategories = [
    "marketing",
    "hospitality_overage",
    "production_overage",
    "prior_advance",
    "damages",
    "other",
  ] as const;
  if (Array.isArray(r.recoups)) {
    r.recoups = (r.recoups as unknown[])
      .map((rec) => {
        if (!rec || typeof rec !== "object") return null;
        const x = rec as Record<string, unknown>;

        // Normalize category — accept common LLM variants.
        const cat = String(x.category ?? "").toLowerCase();
        if (
          !validCategories.includes(
            cat as (typeof validCategories)[number],
          )
        ) {
          if (cat.includes("market")) x.category = "marketing";
          else if (cat.includes("hospital")) x.category = "hospitality_overage";
          else if (cat.includes("product")) x.category = "production_overage";
          else if (cat.includes("advance")) x.category = "prior_advance";
          else if (cat.includes("damage")) x.category = "damages";
          else x.category = "other";
        }

        // Ensure label exists — LLM sometimes puts it in description/name.
        if (typeof x.label !== "string" || !x.label) {
          x.label =
            (typeof x.description === "string" && x.description) ||
            (typeof x.name === "string" && x.name) ||
            `${x.category} recoup`;
        }

        // Coerce amount to number.
        if (typeof x.amount !== "number") {
          const n = Number(x.amount);
          x.amount = Number.isFinite(n) ? n : 0;
        }

        // Default placement to outside_cap (the safer assumption).
        if (x.placement !== "inside_cap" && x.placement !== "outside_cap") {
          x.placement = "outside_cap";
        }

        return x;
      })
      .filter((rec): rec is Record<string, unknown> => rec !== null);
  }

  // Default missing meta fields.
  if (!r.extractedBy) r.extractedBy = "tier2_llm";
  if (!r.confidence || typeof r.confidence !== "object") {
    r.confidence = { dealType: 0.5 };
  }

  return r;
}

export interface AIProvider {
  readonly name: string;
  readonly available: boolean;
  /**
   * Extract a DealBrief from the email. Optional `examples` are passed as
   * prior turns in the conversation — Gemini's multi-turn format is the
   * canonical few-shot pattern and outperforms inline examples.
   */
  extractBrief(
    emailText: string,
    examples?: FewShotExample[],
  ): Promise<DealBrief>;
  detectAmbiguities(emailText: string): Promise<Ambiguity[]>;
}

// -------- Manual provider (used when no key is configured) --------

class ManualProvider implements AIProvider {
  readonly name = "manual";
  readonly available = true;

  async extractBrief(): Promise<DealBrief> {
    // Returns an empty shell — the UI surfaces a manual-entry form.
    return DealBriefSchema.parse({
      dealType: "flat",
      guaranteeAmount: null,
      percentage: null,
      percentageBasis: null,
      expenseCap: null,
      hospitalityCap: null,
      bonuses: [],
      recoups: [],
      confidence: {},
      extractedBy: "manual",
    });
  }

  async detectAmbiguities(): Promise<Ambiguity[]> {
    return [];
  }
}

// -------- Groq provider (recommended free-tier choice) --------

class GroqProvider implements AIProvider {
  readonly name = "groq-llama-3.3-70b";
  readonly available = true;

  private client: Groq;
  private model = "llama-3.3-70b-versatile";

  constructor(apiKey: string) {
    this.client = new Groq({ apiKey });
  }

  async extractBrief(
    emailText: string,
    examples: FewShotExample[] = [],
  ): Promise<DealBrief> {
    // Multi-turn few-shot: system → (user_email, assistant_json) × N → user_email.
    // Groq is OpenAI-compatible, so messages follow that shape.
    const messages: Groq.Chat.ChatCompletionMessageParam[] = [
      { role: "system", content: EXTRACTION_SYSTEM_PROMPT },
      ...examples.flatMap(
        (ex): Groq.Chat.ChatCompletionMessageParam[] => [
          { role: "user", content: "Email to extract:\n\n" + ex.email },
          { role: "assistant", content: JSON.stringify(ex.brief) },
        ],
      ),
      { role: "user", content: "Email to extract:\n\n" + emailText },
    ];

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages,
      response_format: { type: "json_object" },
      temperature: 0.1,
    });

    const raw = response.choices[0]?.message?.content;
    if (!raw) throw new Error("Empty response from Groq");
    const parsed = JSON.parse(raw);
    // Normalize LLM variance, then zod-validate. Schema stays strict;
    // common LLM drift (null arrays, missing fields, enum variants)
    // is absorbed in normalizeLLMBriefOutput.
    return DealBriefSchema.parse(normalizeLLMBriefOutput(parsed));
  }

  async detectAmbiguities(emailText: string): Promise<Ambiguity[]> {
    // Groq's JSON mode only returns top-level objects, not arrays. Wrap
    // the array in an object so we can parse, then unwrap.
    const wrappedPrompt =
      AMBIGUITY_SYSTEM_PROMPT +
      `\n\nIMPORTANT: Wrap your JSON array inside an object with key "ambiguities": { "ambiguities": [...] }`;

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: "system", content: wrappedPrompt },
        { role: "user", content: "Email to analyze:\n\n" + emailText },
      ],
      response_format: { type: "json_object" },
      temperature: 0.2,
    });

    const raw = response.choices[0]?.message?.content;
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    const arr = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed.ambiguities)
        ? parsed.ambiguities
        : [];
    return arr
      .map((a: unknown, i: number) => {
        const withId =
          a && typeof a === "object"
            ? { id: (a as { id?: string }).id ?? `amb_${i}`, ...(a as object) }
            : null;
        if (!withId) return null;
        const r = AmbiguitySchema.safeParse(withId);
        return r.success ? r.data : null;
      })
      .filter((a: Ambiguity | null): a is Ambiguity => a !== null);
  }
}

// -------- Gemini provider --------

class GeminiProvider implements AIProvider {
  readonly name = "gemini-2.5-flash";
  readonly available = true;

  private model;

  constructor(apiKey: string) {
    const genAI = new GoogleGenerativeAI(apiKey);
    this.model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
    });
  }

  async extractBrief(
    emailText: string,
    examples: FewShotExample[] = [],
  ): Promise<DealBrief> {
    // Build a multi-turn conversation: system → (example_email → example_json) × N → real_email.
    // This is the canonical few-shot pattern for Gemini and outperforms
    // inlining examples into a single user message.
    const contents: {
      role: "user" | "model";
      parts: { text: string }[];
    }[] = [
      {
        role: "user",
        parts: [{ text: EXTRACTION_SYSTEM_PROMPT }],
      },
      {
        role: "model",
        parts: [
          {
            text: "Understood. Send me an email to extract and I will respond with the DealBrief JSON.",
          },
        ],
      },
    ];

    for (const ex of examples) {
      contents.push({
        role: "user",
        parts: [{ text: "Email to extract:\n\n" + ex.email }],
      });
      contents.push({
        role: "model",
        parts: [{ text: JSON.stringify(ex.brief) }],
      });
    }

    contents.push({
      role: "user",
      parts: [{ text: "Email to extract:\n\n" + emailText }],
    });

    const result = await this.model.generateContent({
      contents,
      generationConfig: {
        responseMimeType: "application/json",
        // Gemini's responseSchema is strictly typed in the SDK; our
        // hand-written JSON schema is structurally valid OpenAPI — cast.
        responseSchema: DEAL_BRIEF_JSON_SCHEMA as unknown as Schema,
        temperature: 0.1,
      },
    });

    const raw = result.response.text();
    const parsed = JSON.parse(raw);
    // Normalize then validate. Even Gemini with native schema enforcement
    // occasionally drifts; the normalizer is cheap insurance.
    return DealBriefSchema.parse(normalizeLLMBriefOutput(parsed));
  }

  async detectAmbiguities(emailText: string): Promise<Ambiguity[]> {
    const result = await this.model.generateContent({
      contents: [
        {
          role: "user",
          parts: [
            { text: AMBIGUITY_SYSTEM_PROMPT },
            { text: "\n\nEmail to analyze:\n\n" + emailText },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: AMBIGUITY_JSON_SCHEMA as unknown as Schema,
        temperature: 0.2,
      },
    });

    const raw = result.response.text();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((a, i) => {
        // Make sure each has an id (model occasionally omits)
        const withId = { id: a.id ?? `amb_${i}`, ...a };
        const r = AmbiguitySchema.safeParse(withId);
        return r.success ? r.data : null;
      })
      .filter((a): a is Ambiguity => a !== null);
  }
}

// -------- Selection --------

let cached: AIProvider | null = null;

/**
 * Provider selection logic:
 *   1. Explicit AI_PROVIDER env var honored if set (groq|gemini|manual)
 *   2. Otherwise auto-pick: Groq (if GROQ_API_KEY) → Gemini (if GEMINI_API_KEY)
 *      → Manual fallback
 *
 * Why Groq is the preferred default: free-tier 30 RPM vs Gemini's 10 RPM,
 * and ~3-5x faster inference. Llama 3.3 70B handles deal extraction well.
 */
export function getAIProvider(): AIProvider {
  if (cached) return cached;

  const choice = process.env.AI_PROVIDER?.toLowerCase();
  const groqKey = process.env.GROQ_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;

  if (choice === "groq") {
    if (groqKey) {
      cached = new GroqProvider(groqKey);
    } else {
      console.warn(
        "[aiProvider] AI_PROVIDER=groq but GROQ_API_KEY not set — falling back.",
      );
      cached = new ManualProvider();
    }
  } else if (choice === "gemini") {
    if (geminiKey) {
      cached = new GeminiProvider(geminiKey);
    } else {
      console.warn(
        "[aiProvider] AI_PROVIDER=gemini but GEMINI_API_KEY not set — falling back.",
      );
      cached = new ManualProvider();
    }
  } else if (choice === "manual") {
    cached = new ManualProvider();
  } else {
    // No explicit choice — auto-pick by key presence.
    if (groqKey) {
      cached = new GroqProvider(groqKey);
    } else if (geminiKey) {
      cached = new GeminiProvider(geminiKey);
    } else {
      cached = new ManualProvider();
    }
  }
  return cached;
}

/** True iff a real LLM provider is wired up. */
export function hasLLMProvider(): boolean {
  return getAIProvider().name !== "manual";
}
