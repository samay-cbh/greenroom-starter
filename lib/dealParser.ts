/**
 * Deterministic deal-email parser — NOT AI.
 *
 * This is a regex-based stub. Production F0 would replace the regex
 * heuristics below with an LLM call that returns the same
 * `ParsedDealTerms` shape: best-effort extraction in `extracted`, low-
 * confidence fields surfaced via `confidence`, and any phrase with multiple
 * defensible readings emitted as a forced-choice `Ambiguity`.
 *
 * The contract (lib/dealTerms.ts → Deal Terms Schema v1) is what the engine
 * reads. As long as the stub and a real model produce the same shape, the
 * rest of the pipeline (confirm UI → server action → engine) doesn't change.
 *
 * Coastal Spell is the canonical demo: the phrase "marketing recoup of
 * $900 against gross" with an explicit expense cap is the ambiguity F0
 * is designed to force a choice on at deal entry.
 */

import type { Deal } from "@/db/schema";
import type {
  Ambiguity,
  CapScope,
  DealTermsBonusTier,
  ParsedDealTerms,
} from "./dealTerms";

const MARKETING_RECOUP_ID = "marketing_recoup";
const MARKETING_RECOUP_LABEL = "Marketing Recoup";
const MARKETING_RECOUP_ORDERING_PRIORITY = 10;

/** "$25k" → 25000, "$2,500" → 2500, "5000" → 5000 */
function parseAmount(raw: string): number {
  const cleaned = raw.replace(/[$,\s]/g, "").toLowerCase();
  const hasK = cleaned.endsWith("k");
  const numeric = parseFloat(hasK ? cleaned.slice(0, -1) : cleaned);
  if (!isFinite(numeric)) return NaN;
  return hasK ? numeric * 1000 : numeric;
}

export function parseDealEmail(text: string): ParsedDealTerms {
  const extracted: ParsedDealTerms["extracted"] = {};
  const ambiguities: Ambiguity[] = [];
  const confidence: ParsedDealTerms["confidence"] = {};

  // ----- guarantee -----
  // Keyword-anchored patterns first — they're high-precision and survive the
  // common shorthand where bookers drop the $ sign ("4,988 g'tee vs 90%
  // gross"). Falling back to "first $N in the email" works for canonical
  // emails like Coastal Spell ("$5,000 vs 80% …") but mis-captures the
  // hospitality line when the guarantee was written without a $.
  const guaranteePatterns: RegExp[] = [
    // "<amount> g'tee | gtee | guarantee" — number before the keyword
    /\$?(\d[\d,]*(?:\.\d+)?)\s*(?:g'?tee|gtee|guarantee)\b/i,
    // "guarantee | g'tee <of|:|space> <amount>" — number after the keyword
    /(?:g'?tee|gtee|guarantee)\s*(?:of\s+|:\s*)?\$?(\d[\d,]*(?:\.\d+)?)/i,
    // "<amount> vs <pct>%" — canonical vs-deal phrasing, $ optional
    /\$?(\d[\d,]*(?:\.\d+)?)\s+vs\s+\d{1,3}\s*%/i,
    // Fallback: first $X(,XXX) in the email — preserves prior behaviour for
    // emails that don't use a guarantee keyword or "vs" phrasing.
    /\$([\d,]+(?:\.\d+)?)/,
  ];
  for (const pat of guaranteePatterns) {
    const m = text.match(pat);
    if (m) {
      const v = parseAmount(m[1]);
      if (!isNaN(v) && v >= 100) {
        extracted.guarantee_amount = v;
        confidence.guarantee_amount = "high";
        break;
      }
    }
  }
  if (extracted.guarantee_amount == null) confidence.guarantee_amount = "low";

  // ----- artist percentage: first X% -----
  const pctMatch = text.match(/(\d{1,3})\s*%/);
  if (pctMatch) {
    const pct = parseInt(pctMatch[1], 10);
    if (pct > 0 && pct <= 100) {
      extracted.artist_percent = pct / 100;
      confidence.artist_percent = "high";
    }
  }
  if (extracted.artist_percent == null) confidence.artist_percent = "low";

  // ----- expense cap: "expenses capped (at)? $X" or "expense cap (of)? $X" -----
  // Deliberately strict on the keyword "expense" to avoid matching the
  // "Hospitality cap $500" pattern that also appears in the Coastal Spell text.
  const capMatch =
    text.match(/expenses?\s+capped(?:\s+at)?\s+\$?([\d,]+(?:\.\d+)?)/i) ??
    text.match(/expense\s+cap(?:\s+of)?\s+\$?([\d,]+(?:\.\d+)?)/i);
  if (capMatch) {
    const v = parseAmount(capMatch[1]);
    if (!isNaN(v)) {
      extracted.expense_cap = { exists: true, cap_amount: v };
      confidence.expense_cap = "high";
    }
  }

  // ----- bonus tiers: "+$X bonus over $Yk gross" -----
  const bonusRegex =
    /\+?\s*\$([\d,]+(?:\.\d+)?)\s+bonus\s+(?:over|above)\s+\$?([\d,.]+k?)\s*gross/gi;
  const bonusTiers: NonNullable<ParsedDealTerms["extracted"]["bonus_tiers"]> = [];
  for (const m of text.matchAll(bonusRegex)) {
    const flat_amount = parseAmount(m[1]);
    const threshold_amount = parseAmount(m[2]);
    if (!isNaN(flat_amount) && !isNaN(threshold_amount)) {
      bonusTiers.push({
        threshold_amount,
        basis: "gross",
        // why: Coastal-shaped tiers are flat dollar bonuses, so the engine
        // uses `flat_amount` and ignores `percent_above_threshold`. The 0
        // is a placeholder consistent with the schema's required field.
        percent_above_threshold: 0,
        flat_amount,
        label: `+$${flat_amount.toLocaleString()} bonus over $${threshold_amount.toLocaleString()} gross`,
      });
    }
  }
  if (bonusTiers.length > 0) extracted.bonus_tiers = bonusTiers;

  // ----- marketing recoup + cap_scope (deductions[]) -----
  const recoupMatch = text.match(
    /marketing\s+recoup\s+(?:of\s+)?\$([\d,]+(?:\.\d+)?)/i,
  );
  if (recoupMatch && recoupMatch.index != null) {
    const amount = parseAmount(recoupMatch[1]);
    if (!isNaN(amount)) {
      // Isolate the sentence containing the recoup mention — that's what
      // we'll quote back to the user as the source phrase. Looking at a
      // bigger window for position hints, though, since deal emails often
      // qualify the recoup in an adjacent clause.
      const sentence = extractSentence(text, recoupMatch.index);
      const winStart = Math.max(0, recoupMatch.index - 40);
      const winEnd = Math.min(
        text.length,
        recoupMatch.index + recoupMatch[0].length + 80,
      );
      const windowText = text.slice(winStart, winEnd);

      const hasIncluded =
        /included\s+in|inside\s+(?:the\s+)?(?:expense\s+)?cap/i.test(windowText);
      const hasAgainstGross = /against\s+gross/i.test(windowText);

      const baseDeduction = {
        id: MARKETING_RECOUP_ID,
        label: MARKETING_RECOUP_LABEL,
        amount,
        basis: "gross" as const,
        ordering_priority: MARKETING_RECOUP_ORDERING_PRIORITY,
      };

      if (hasIncluded) {
        // Unambiguous: stated to be inside the cap.
        extracted.deductions = [
          { ...baseDeduction, cap_scope: "inside_cap" },
        ];
        confidence["deductions.marketing_recoup.cap_scope"] = "high";
      } else if (hasAgainstGross && extracted.expense_cap?.exists) {
        // The Coastal Spell case: "against gross" + an explicit expense cap.
        // Both readings are defensible. Force the user to pick.
        extracted.deductions = [baseDeduction];
        ambiguities.push(makeRecoupAmbiguity(sentence, "coastal_spell"));
        confidence["deductions.marketing_recoup.cap_scope"] = "low";
      } else {
        // Recoup mentioned but no clear position phrase. Still force a choice —
        // an unstated position is exactly the kind of seam the dispute thread
        // is about ("get marketing recoup language explicit in the deal email").
        extracted.deductions = [baseDeduction];
        ambiguities.push(makeRecoupAmbiguity(sentence, "unspecified"));
        confidence["deductions.marketing_recoup.cap_scope"] = "low";
      }
    }
  }

  return { extracted, ambiguities, confidence };
}

/** Return the sentence in `text` that contains the character at `index`. */
function extractSentence(text: string, index: number): string {
  const before = text.slice(0, index);
  const after = text.slice(index);
  const startMatch = before.match(/[.!?]\s+(?=[^.!?]*$)/);
  const start = startMatch
    ? (startMatch.index ?? 0) + startMatch[0].length
    : 0;
  const endMatch = after.match(/[.!?](\s|$)/);
  const end = endMatch ? index + (endMatch.index ?? 0) + 1 : text.length;
  return text.slice(start, end).trim();
}

/**
 * Fill any unset `extracted` fields from the deal record. The email parser
 * is regex-based and will miss anything not in Coastal-shaped prose — this
 * fallback lets the confirm form light up with sensible defaults whenever
 * the booker stored numbers on the deal row even though the prose didn't.
 *
 * Phase A scope: guarantee, artist %, expense cap, and gross-threshold
 * bonus_tiers from `deal.bonusesJson`. Deductions are deliberately NOT
 * synthesized from the deal record — there is no structured deductions
 * field on deals, and asking the booker to confirm a deduction that
 * came from nowhere would be the opposite of F0's contract.
 */
export function mergeDealRecordFallbacks(
  parsed: ParsedDealTerms,
  deal: Deal,
): ParsedDealTerms {
  const extracted: ParsedDealTerms["extracted"] = { ...parsed.extracted };

  if (extracted.guarantee_amount == null && deal.guaranteeAmount != null) {
    extracted.guarantee_amount = deal.guaranteeAmount;
  }
  if (extracted.artist_percent == null && deal.percentage != null) {
    extracted.artist_percent = deal.percentage;
  }
  if (extracted.expense_cap == null && deal.expenseCap != null) {
    extracted.expense_cap = { exists: true, cap_amount: deal.expenseCap };
  }
  if (
    (!extracted.bonus_tiers || extracted.bonus_tiers.length === 0) &&
    deal.bonusesJson
  ) {
    const tiers = bonusesJsonToTiers(deal.bonusesJson);
    if (tiers.length > 0) extracted.bonus_tiers = tiers;
  }

  return { ...parsed, extracted };
}

function bonusesJsonToTiers(json: string): DealTermsBonusTier[] {
  try {
    const arr = JSON.parse(json);
    if (!Array.isArray(arr)) return [];
    const tiers: DealTermsBonusTier[] = [];
    for (const b of arr) {
      // why: only `gross_threshold` maps cleanly to `bonus_tiers` (which
      // expects a threshold + flat amount on a gross or net basis). Sellout
      // and attendance bonuses live in a different shape and would need
      // engine changes before the confirm UI can offer them — that's
      // Phase B scope.
      if (
        b &&
        typeof b === "object" &&
        b.type === "gross_threshold" &&
        typeof b.threshold === "number" &&
        typeof b.amount === "number"
      ) {
        tiers.push({
          threshold_amount: b.threshold,
          basis: "gross",
          percent_above_threshold: 0,
          flat_amount: b.amount,
          label: typeof b.label === "string" ? b.label : undefined,
        });
      }
    }
    return tiers;
  } catch {
    return [];
  }
}

function makeRecoupAmbiguity(
  sourcePhrase: string,
  flavor: "coastal_spell" | "unspecified",
): Ambiguity {
  const outsideCap: { value: CapScope; label: string; rationale: string } = {
    value: "outside_cap",
    label: "Recoup is a separate deduction off gross (outside the expense cap)",
    rationale:
      flavor === "coastal_spell"
        ? "The phrase 'against gross' suggests recoup comes off the top before expenses are computed."
        : "Recoup is treated as a top-line deduction, separate from venue-charged expenses.",
  };
  const insideCap: { value: CapScope; label: string; rationale: string } = {
    value: "inside_cap",
    label: "Recoup is part of the expense cap",
    rationale:
      flavor === "coastal_spell"
        ? "The expense cap functions as a ceiling on all venue-charged costs including marketing."
        : "Recoup is counted against the same cap as other venue-charged expenses.",
  };
  return {
    field: "deductions.marketing_recoup.cap_scope",
    sourcePhrase,
    options: [outsideCap, insideCap],
  };
}
