/**
 * Deal Terms Schema v1 (PRD §7 F0) + supporting types for the F0 → F1 → F2 pipeline.
 *
 * Prototype scope: vs deals only. Flat and percentage_of_gross paths in
 * dealMath.ts don't read these types.
 *
 * Flow:
 *   raw email text
 *     → ParsedDealTerms   (F0 deterministic parser output; may contain ambiguities)
 *     → DealTermsV1       (after user resolves ambiguities via forced choice;
 *                          persisted as deals.deal_terms_json)
 *     → CalculationRecord (F1 engine output, written to settlements.calculation_json)
 */

// ----- Deal Terms Schema v1 (PRD §7 F0) -----

export const DEAL_TERMS_VERSION = "deal_terms_v1" as const;

/**
 * Deal types covered by the v1 schema. The engine only implements `vs_deal`
 * end-to-end in this slice; the others are listed for future expansion.
 */
export type DealTypeV1 = "vs_deal" | "flat_guarantee" | "percent_of_gross";

/** What the deduction is calculated against. v1 engine only supports `"gross"`. */
export type DeductionBasis = "gross" | "net";

/**
 * Where the deduction sits relative to the expense cap.
 *  - `outside_cap`: a separate top-line deduction, NOT counted against the cap
 *    (Mariana's reading of the Coastal Spell recoup).
 *  - `inside_cap`: counted in the bucket the cap limits
 *    (WME's reading of the Coastal Spell recoup).
 */
export type CapScope = "inside_cap" | "outside_cap";

/**
 * A single deduction line on the deal. Marketing recoup, hospitality overage,
 * production overage, etc. v1 prototype only exercises marketing recoup.
 *
 * The engine sorts these by `ordering_priority` ascending and applies each
 * to either the pre-cap total or the in-cap bucket based on `cap_scope`.
 */
export type DealTermsDeduction = {
  id: string;
  label: string;
  amount: number;
  basis: DeductionBasis;
  cap_scope: CapScope;
  ordering_priority: number;
};

/**
 * Bonus tier evaluated against the basis at settlement time.
 *
 * Prototype: Coastal Spell uses `flat_amount + threshold_amount` (gross basis).
 * The engine prefers `flat_amount` when set; falls back to
 * `percent_above_threshold * (gross - threshold_amount)` only if
 * `flat_amount` is absent. percent-based bonuses are not exercised in v1.
 */
export type DealTermsBonusTier = {
  threshold_amount: number;
  basis: "gross" | "net";
  percent_above_threshold: number;
  flat_amount?: number;
  label?: string;
};

/**
 * Expense cap state. `exists: false` means uncapped (`cap_amount` is ignored).
 */
export type DealTermsExpenseCap = {
  exists: boolean;
  cap_amount: number | null;
};

/**
 * The PRD §7 F0 confirmed deal terms shape. Persisted to
 * `deals.deal_terms_json`. The engine reads this and the audit record
 * stores a full snapshot in `CalculationRecord.termsSnapshot`.
 *
 * Audit fields (`source_text`, `confirmed_at`) are prototype additions
 * beyond the PRD JSON example — needed for the F2 audit trail.
 */
export type DealTermsV1 = {
  deal_terms_version: typeof DEAL_TERMS_VERSION;
  deal_type: "vs_deal";
  guarantee_amount: number;
  artist_percent: number;
  expense_cap: DealTermsExpenseCap;
  deductions: DealTermsDeduction[];
  bonus_tiers: DealTermsBonusTier[];
  source_text: string;
  confirmed_at: string;
};

/**
 * Migration alias. During this transition `ConfirmedDealTerms` is a synonym
 * for `DealTermsV1`. Remove after callers are migrated.
 */
export type ConfirmedDealTerms = DealTermsV1;

// ----- Legacy shape (pre-v1) — kept for one-shot migration -----

/**
 * The pre-v1 confirmed-terms shape that the original parser, engine, and
 * `scripts/seed-coastal-terms.ts` wrote before this PR. Detected by the
 * `dealType === "vs"` discriminator and converted by `migrateLegacyTerms()`
 * inside `parseDealTermsJson()`, so any stray legacy JSON in the DB still
 * works without forcing a re-confirm.
 */
export type LegacyConfirmedDealTerms = {
  dealType: "vs";
  guarantee: number;
  artistPercentage: number;
  expenseCap: number | null;
  marketingRecoup: {
    amount: number;
    position: "pre_cap_deduction" | "in_cap_deduction";
  } | null;
  bonusTiers: Array<{
    label: string;
    threshold: number;
    amount: number;
  }>;
  sourceText: string;
  confirmedAt: string;
};

/**
 * @deprecated Pre-v1 recoup position. New code uses `CapScope`.
 * Kept only so legacy types compile during the migration window.
 */
export type RecoupPosition = "pre_cap_deduction" | "in_cap_deduction";

// ----- Parser output (F0) -----

/**
 * Output of the deterministic parser stub. The UI uses `ambiguities[]`
 * to render forced-choice radios; after the user picks, the resolved
 * values are merged into `extracted` to build a `DealTermsV1`.
 */
export type ParsedDealTerms = {
  /** Best-effort extraction. Missing fields prompt manual entry. */
  extracted: {
    guarantee_amount?: number;
    artist_percent?: number;
    expense_cap?: DealTermsExpenseCap;
    /**
     * Partial deduction rows extracted from the email. Each row's
     * `cap_scope` may be missing — the user resolves it via an ambiguity
     * before the deduction is written into `DealTermsV1`.
     */
    deductions?: Array<
      Omit<DealTermsDeduction, "cap_scope"> & { cap_scope?: CapScope }
    >;
    bonus_tiers?: DealTermsBonusTier[];
  };
  /** Fields the parser is unsure about — user must resolve before saving. */
  ambiguities: Ambiguity[];
  /** Per-field confidence. UI flags low-confidence fields for review. */
  confidence: Partial<
    Record<
      | "guarantee_amount"
      | "artist_percent"
      | "expense_cap"
      | "deductions.marketing_recoup.cap_scope",
      "high" | "medium" | "low"
    >
  >;
};

export type Ambiguity = {
  /** Stable dotted path. v1 only models marketing-recoup cap scope. */
  field: "deductions.marketing_recoup.cap_scope";
  sourcePhrase: string;
  options: Array<{
    value: CapScope;
    label: string;
    rationale: string;
  }>;
};

// ----- Calculation record (engine output, written to settlements.calculation_json) -----

export type LineSource =
  | "deal-term"
  | "pos"
  | "receipt"
  | "manual"
  | "computed"
  | "absorbed";

/**
 * Self-contained calculation record. Includes the v1 terms snapshot so it
 * can be re-rendered without re-deriving anything. Versioned so future
 * engine changes don't invalidate old records.
 */
export type CalculationRecord = {
  version: 1;
  calculatedAt: string;
  termsSnapshot: DealTermsV1;
  inputs: {
    grossBoxOffice: number;
    fees: number;
    expenses: Array<{
      id: string;
      label: string;
      amount: number;
      absorbedByVenue: boolean;
      source: LineSource;
    }>;
  };
  /** Ordered worksheet rows. Order = order applied. */
  steps: Array<{
    label: string;
    amount: number;
    source: LineSource;
    note?: string;
  }>;
  netBoxOffice: number;
  artistShare: number;
  guaranteeComparison: {
    guarantee: number;
    artistShare: number;
    winner: "guarantee" | "artist_share";
  };
  bonusesApplied: Array<{ label: string; amount: number; reason: string }>;
  bonusesNotTriggered: Array<{ label: string; amount: number; reason: string }>;
  totalToArtist: number;
};

// ----- JSON helpers -----

/**
 * Parse `deals.deal_terms_json` into a v1 record. Accepts either a v1
 * payload OR the pre-v1 shape; pre-v1 gets migrated transparently so old
 * confirmed terms in the DB don't have to be re-confirmed after this PR.
 */
export function parseDealTermsJson(json: string | null): DealTermsV1 | null {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json);
    if (!parsed || typeof parsed !== "object") return null;
    if (parsed.deal_terms_version === DEAL_TERMS_VERSION) {
      return parsed as DealTermsV1;
    }
    // why: pre-v1 confirmed terms (from scripts/seed-coastal-terms.ts before
    // this PR, or any deal confirmed under the old shape) are detected by
    // the legacy discriminator and migrated in place so the demo and any
    // stray legacy JSON keep working without a forced re-confirm.
    if (parsed.dealType === "vs") {
      return migrateLegacyTerms(parsed as LegacyConfirmedDealTerms);
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * @deprecated alias for `parseDealTermsJson` — kept for in-flight call sites
 * during the v1 migration. Remove after callers are renamed.
 */
export const parseConfirmedTerms = parseDealTermsJson;

export function parseCalculationRecord(
  json: string | null,
): CalculationRecord | null {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json);
    if (parsed && typeof parsed === "object" && parsed.version === 1) {
      return parsed as CalculationRecord;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Convert the pre-v1 `ConfirmedDealTerms` shape to `DealTermsV1`. The
 * marketing recoup (if present) becomes a deduction row keyed by
 * `"marketing_recoup"`; `position: "pre_cap_deduction"` maps to
 * `cap_scope: "outside_cap"`, `"in_cap_deduction"` maps to `"inside_cap"`.
 */
export function migrateLegacyTerms(
  legacy: LegacyConfirmedDealTerms,
): DealTermsV1 {
  const deductions: DealTermsDeduction[] = [];
  if (legacy.marketingRecoup) {
    deductions.push({
      id: "marketing_recoup",
      label: "Marketing Recoup",
      amount: legacy.marketingRecoup.amount,
      basis: "gross",
      cap_scope:
        legacy.marketingRecoup.position === "pre_cap_deduction"
          ? "outside_cap"
          : "inside_cap",
      ordering_priority: 10,
    });
  }
  return {
    deal_terms_version: DEAL_TERMS_VERSION,
    deal_type: "vs_deal",
    guarantee_amount: legacy.guarantee,
    artist_percent: legacy.artistPercentage,
    expense_cap: {
      exists: legacy.expenseCap != null,
      cap_amount: legacy.expenseCap,
    },
    deductions,
    bonus_tiers: legacy.bonusTiers.map((b) => ({
      threshold_amount: b.threshold,
      basis: "gross",
      percent_above_threshold: 0,
      flat_amount: b.amount,
      label: b.label,
    })),
    source_text: legacy.sourceText,
    confirmed_at: legacy.confirmedAt,
  };
}

/** Find the marketing-recoup deduction row by stable id. */
export function getMarketingRecoup(
  terms: DealTermsV1,
): DealTermsDeduction | undefined {
  return terms.deductions.find((d) => d.id === "marketing_recoup");
}

/**
 * Return a new `DealTermsV1` with the marketing-recoup deduction's
 * `cap_scope` flipped. Used by the settle page to compute the counterfactual
 * payout under the OTHER reading of the recoup phrase. Other deductions and
 * bonus tiers are preserved unchanged.
 */
export function flipRecoupCapScope(terms: DealTermsV1): DealTermsV1 {
  return {
    ...terms,
    deductions: terms.deductions.map((d) =>
      d.id === "marketing_recoup"
        ? {
            ...d,
            cap_scope:
              d.cap_scope === "outside_cap" ? "inside_cap" : "outside_cap",
          }
        : d,
    ),
  };
}

// ----- Derived predicates -----

/**
 * Returns true when picking the OTHER marketing-recoup interpretation
 * (outside_cap vs inside_cap) would have produced the same `totalToArtist`
 * for this show. Algebraically: the two readings diverge iff
 * `expenses + recoup > cap` (the cap binds in the in-cap reading but
 * doesn't, or binds differently, in the outside-cap reading). When
 * `expenses + recoup ≤ cap`, both readings deduct the same amount from
 * gross and the dispute is invisible at this particular show's numbers.
 *
 * This matters for honesty in the UI: the Coastal Spell seed sits exactly
 * on the boundary (expenses $1,600 + recoup $900 = cap $2,500), so the
 * live demo shows the same number regardless of which reading the user
 * picks. The canonical $720 dispute example lives in dispute-thread.md
 * and the engine's golden tests, where expenses alone are $2,500.
 */
export function recoupInterpretationsCollapse(
  record: CalculationRecord,
): boolean {
  const recoup = getMarketingRecoup(record.termsSnapshot);
  const cap = record.termsSnapshot.expense_cap;
  if (!recoup || !cap.exists || cap.cap_amount == null) return false;
  const nonAbsorbed = record.inputs.expenses
    .filter((e) => !e.absorbedByVenue)
    .reduce((s, e) => s + e.amount, 0);
  return nonAbsorbed + recoup.amount <= cap.cap_amount;
}
