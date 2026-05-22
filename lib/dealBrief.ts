/**
 * The Deal Brief — schema, types, and helpers.
 *
 * The Deal Brief is the artifact produced by the Deal Modeling slice. Its
 * job is to turn the prose in a deal email (the truth Mariana trusts) into
 * a typed, confirmed source of truth that the settlement engine can read.
 *
 * Three orthogonal payloads are persisted per brief:
 *   - extracted:      the typed deal, derived from the email
 *   - ambiguities:    sentences that could be read two ways (Coastal Spell)
 *   - contradictions: findings from cross-checking the brief against the
 *                     existing DB rows (the 12 planted breadcrumbs)
 */

import { z } from "zod";

/**
 * Percentages must be stored as decimal fractions (0.0–1.0). Tier 0
 * always emits decimals. LLMs are inconsistent — some return 0.80,
 * others return 80 — so we normalize defensively here. The threshold of
 * 1.5 cleanly separates "already-decimal" from "percentage-points":
 * a real settlement percentage never exceeds ~120%.
 */
const PercentageSchema = z.number().transform((n) => {
  if (n <= 1.5) return n; // already decimal
  return n / 100; // looks like percentage points (e.g. 80 → 0.80)
});

// -------- Deal types & flavors --------

export const DealTypeSchema = z.enum([
  "flat",
  "percentage_of_gross",
  "percentage_of_net",
  "vs",
  "door",
]);
export type DealType = z.infer<typeof DealTypeSchema>;

/**
 * Vs deals come in four flavors. The legacy schema collapses these into a
 * single `vs` row — that collapse is one of the reasons 62.5% of deals
 * can't settle in-app today.
 */
export const VsFlavorSchema = z.enum([
  "standard", // guarantee vs % of net after expenses
  "walkout", // guarantee vs % of net, +100% gross above breakeven
  "ratchet", // % escalates by sell-through tier
  "vs_gross", // guarantee vs % of gross (no expense deductions)
]);
export type VsFlavor = z.infer<typeof VsFlavorSchema>;

// -------- Bonuses (richer than the legacy schema) --------

export const BonusSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("gross_threshold"),
    label: z.string(),
    threshold: z.number(),
    amount: z.number(),
    stacks: z.boolean().optional(),
  }),
  z.object({
    type: z.literal("sellout"),
    label: z.string(),
    amount: z.number(),
  }),
  z.object({
    type: z.literal("attendance_threshold"),
    label: z.string(),
    threshold: z.number(),
    amount: z.number(),
  }),
  z.object({
    type: z.literal("tier_ratchet"),
    label: z.string(),
    tiers: z.array(
      z.object({
        from: z.number(),
        // `to: null` means "no upper bound" (open-ended top tier). LLMs
        // sometimes omit the field entirely instead of emitting null — accept
        // either, normalize downstream as null.
        to: z.number().nullish(),
        percentage: PercentageSchema,
      }),
    ),
  }),
  z.object({
    type: z.literal("walkout_pot"),
    label: z.string(),
    breakeven: z.number(),
    sharePctAbove: z.number(), // typically 1.0 — 100% of incremental gross
  }),
]);
export type BriefBonus = z.infer<typeof BonusSchema>;

// -------- Recoups (with the Coastal Spell-prevention field) --------

export const RecoupPlacementSchema = z.enum(["inside_cap", "outside_cap"]);
export type RecoupPlacement = z.infer<typeof RecoupPlacementSchema>;

export const RecoupSchema = z.object({
  category: z.enum([
    "marketing",
    "hospitality_overage",
    "production_overage",
    "prior_advance",
    "damages",
    "other",
  ]),
  label: z.string(),
  amount: z.number(),
  /**
   * The single field that would have prevented the $720 Coastal Spell loss.
   * Determines whether this recoup is part of the expense cap (and thus
   * fights for room with other expenses) or sits outside the cap and
   * always comes off the top.
   */
  placement: RecoupPlacementSchema,
});
export type BriefRecoup = z.infer<typeof RecoupSchema>;

// -------- The DealBrief itself (the extractedJson payload) --------

export const DealBriefSchema = z.object({
  /** Mirrors the legacy dealType but with Vs flavors made first-class. */
  dealType: DealTypeSchema,
  vsFlavor: VsFlavorSchema.optional(),

  guaranteeAmount: z.number().nullable(),
  percentage: z.union([PercentageSchema, z.null()]).nullable(),
  percentageBasis: z.enum(["gross", "net"]).nullable(),

  expenseCap: z.number().nullable(),
  hospitalityCap: z.number().nullable(),

  bonuses: z.array(BonusSchema).default([]),
  recoups: z.array(RecoupSchema).default([]),

  /**
   * Per-field confidence from Tier 0 (deterministic parser). Used to
   * decide whether to escalate to Tier 1/2 and what to show Mariana.
   * Range 0..1, 1 = parsed verbatim from a clear pattern.
   */
  confidence: z
    .object({
      dealType: z.number().min(0).max(1),
      guaranteeAmount: z.number().min(0).max(1).optional(),
      percentage: z.number().min(0).max(1).optional(),
      expenseCap: z.number().min(0).max(1).optional(),
      hospitalityCap: z.number().min(0).max(1).optional(),
    })
    .partial()
    .default({}),

  /**
   * Source provenance — character offsets in the email for each field.
   * Powers the hover-to-source UX. Optional because Tier 2 (LLM) doesn't
   * always cite cleanly.
   */
  sources: z
    .record(
      z.string(),
      z.object({
        start: z.number(),
        end: z.number(),
      }),
    )
    .optional(),

  /**
   * Provenance for the brief itself — which tier produced this extraction.
   * Useful for telemetry and for downgrading trust in mariana's review.
   */
  extractedBy: z.enum(["tier0_parser", "tier1_clone", "tier2_llm", "manual"]),
});
export type DealBrief = z.infer<typeof DealBriefSchema>;

// -------- Ambiguities (the Coastal Spell detector) --------

export const AmbiguitySchema = z.object({
  id: z.string(),
  /** The exact span in the source email that's ambiguous. */
  span: z.object({
    start: z.number(),
    end: z.number(),
    excerpt: z.string(),
  }),
  /** Two (or more) defensible readings of the same words. */
  readingA: z.string(),
  readingB: z.string(),
  /** Dollar swing between the readings, when computable. */
  dollarImpact: z.number().nullish(),
  /** Mariana's resolution, once she picks one. */
  resolved: z
    .object({
      pick: z.enum(["A", "B"]),
      at: z.string(), // ISO timestamp
    })
    .optional(),
});
export type Ambiguity = z.infer<typeof AmbiguitySchema>;

// -------- Contradictions (the 12-breadcrumb detector) --------

export const ContradictionSchema = z.object({
  id: z.string(),
  kind: z.enum([
    "percentage_drift", // prose says X%, structured field says Y%
    "deal_type_mismatch", // prose describes Vs deal, structured says pct_of_net
    "stale_prior_show_count", // artist played many shows, field says 0
    "silent_hospitality_overrun", // hosp > cap, nothing absorbed
    "disputed_with_positive_signoff", // status=disputed, signoff text="looks good"
    "paid_with_disputed_recoup", // status=paid, recoup status=disputed
    "reversed_timestamps", // signed_at < submitted_at
    "duplicate_expense", // same show/category/amount within 24h
    "cross_show_agent_pattern", // agent has ≥3 disputed marketing recoups
  ]),
  severity: z.enum(["info", "warn", "high"]),
  message: z.string(),
  evidence: z.record(z.string(), z.unknown()),
});
export type Contradiction = z.infer<typeof ContradictionSchema>;

/**
 * True iff the brief contains no real extraction signal. Used to short-
 * circuit the post-extraction pipeline (persist, contradiction checks)
 * when neither Tier 0 nor Tier 2 found anything in the email.
 */
export function briefIsEmpty(brief: DealBrief): boolean {
  const conf = brief.confidence ?? {};
  const hasAnyConfidence = Object.values(conf).some(
    (v) => typeof v === "number" && v > 0,
  );
  const hasAnyValue =
    brief.guaranteeAmount != null ||
    brief.percentage != null ||
    brief.expenseCap != null ||
    brief.hospitalityCap != null ||
    brief.bonuses.length > 0 ||
    brief.recoups.length > 0;
  return !hasAnyConfidence && !hasAnyValue;
}

// -------- Safe parse helpers (Drizzle stores these as text JSON) --------

export function parseDealBrief(json: string | null | undefined): DealBrief | null {
  if (!json) return null;
  try {
    return DealBriefSchema.parse(JSON.parse(json));
  } catch {
    return null;
  }
}

export function parseAmbiguities(
  json: string | null | undefined,
): Ambiguity[] {
  if (!json) return [];
  try {
    const arr = JSON.parse(json);
    if (!Array.isArray(arr)) return [];
    return arr
      .map((a) => {
        const result = AmbiguitySchema.safeParse(a);
        return result.success ? result.data : null;
      })
      .filter((a): a is Ambiguity => a !== null);
  } catch {
    return [];
  }
}

export function parseContradictions(
  json: string | null | undefined,
): Contradiction[] {
  if (!json) return [];
  try {
    const arr = JSON.parse(json);
    if (!Array.isArray(arr)) return [];
    return arr
      .map((c) => {
        const result = ContradictionSchema.safeParse(c);
        return result.success ? result.data : null;
      })
      .filter((c): c is Contradiction => c !== null);
  } catch {
    return [];
  }
}
