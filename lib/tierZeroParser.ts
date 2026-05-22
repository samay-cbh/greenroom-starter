/**
 * Tier 0 — Deterministic deal-email parser.
 *
 * The cheapest LLM call is the one you don't make. Real deal emails follow
 * regular patterns ~70% of the time. This parser handles them with regex
 * rules and explicit confidence scoring. When confidence is high and no
 * ambiguity triggers fired, the LLM is skipped entirely.
 *
 * Patterns supported (drawn from db/seed.ts:generateVsDealNotes):
 *   - flat:    "Flat $X" / "Flat guarantee $X"
 *   - vs:      "$X vs Y% of net after expenses"
 *              "X g'tee vs Y/Z net" / "$X vs Y% of GROSS"
 *   - flavors: walkout, ratchet, vs_gross detected via keywords
 *   - %-net:   "Y% of net after expenses"
 *   - %-gross: "Y% of gross"
 *   - door:    "Door deal"
 *   - caps:    "Expenses capped $X" / "Expense cap $X" / "Expenses to X"
 *              "Hospitality cap $X" / "Hosp $X"
 *   - bonuses: sellout, gross_threshold, attendance_threshold, walkout_pot
 *   - recoups: marketing/hospitality/production with placement detection
 *
 * Ambiguity triggers (force LLM escalation even with high field confidence):
 *   - "renegotiated" / "updated X days before" / "[Updated"
 *   - marketing recoup mentioned alongside expense cap with no explicit
 *     placement language (the Coastal Spell pattern)
 *   - "performance bonuses per the email" with no specifics
 *
 * Provenance: every matched field records its character span for the
 * sources map. Powers hover-to-source in the brief UI.
 */

import type { DealBrief, BriefBonus, BriefRecoup, Ambiguity } from "./dealBrief";

export const TIER0_CONFIDENCE_THRESHOLD = 0.9;

export type Tier0Result = {
  brief: DealBrief;
  ambiguities: Ambiguity[];
  /** Labels of escalation triggers. Non-empty → escalate to Tier 2. */
  triggers: string[];
  /** 0..1, weighted by how cleanly each field matched. */
  overallConfidence: number;
  /** For debugging/telemetry; not persisted. */
  matchedRules: string[];
};

interface MatchContext {
  text: string;
  sources: Record<string, { start: number; end: number }>;
  fieldConfidence: Record<string, number>;
  matchedRules: string[];
}

function record(
  ctx: MatchContext,
  field: string,
  match: RegExpExecArray | null,
  confidence: number,
  rule: string,
) {
  if (!match) return;
  ctx.sources[field] = {
    start: match.index,
    end: match.index + match[0].length,
  };
  ctx.fieldConfidence[field] = confidence;
  ctx.matchedRules.push(rule);
}

function parseMoney(raw: string): number | null {
  const cleaned = raw.replace(/[$,]/g, "").trim();
  // Handle "5k" / "25k" shorthand
  if (/^\d+(\.\d+)?k$/i.test(cleaned)) {
    return Math.round(parseFloat(cleaned) * 1000);
  }
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

// -------- The parser --------

export function parseDealEmailTier0(emailText: string): Tier0Result {
  const ctx: MatchContext = {
    text: emailText,
    sources: {},
    fieldConfidence: {},
    matchedRules: [],
  };

  // Deal type detection — order matters (most specific first).
  // We snapshot the brief as we go.
  let dealType: DealBrief["dealType"] | null = null;
  let vsFlavor: DealBrief["vsFlavor"] | undefined;

  // Walkout / ratchet are flavors of vs — detected as keyword presence and
  // applied only if the email is also a vs deal.
  const hasWalkout = /\bwalkout\s+(pot|above|over|incremental)/i.test(emailText);
  const hasRatchet =
    /\b(ratchet|ratchets\s+to|escalator|escalates)\b/i.test(emailText) ||
    // Implicit ratchet: "75% net to 80% sold, 85% above" — same math, no keyword.
    /\d{1,3}\s*%\s+(?:net|gross)?\s*to\s+\d{1,3}\s*%\s+sold/i.test(emailText);
  const hasVsGross = /\bvs\s+\d{1,3}(\.\d+)?\s*%\s+of\s+gross\b/i.test(
    emailText,
  );

  // Vs deal (any flavor). Accept BOTH "vs Y%" and "vs Y/Z" split notation.
  // Real prose in the corpus uses both interchangeably (e.g. "vs 80% net"
  // and "vs 85/15 net" both appear).
  const vsMatch =
    /(?:\$?([\d,]+(?:\.\d+)?)\s*(?:g'?tee|guarantee))?\s*vs\s+(\d{1,3}(?:\.\d+)?)\s*(?:%|\/\s*\d{1,3})/i.exec(
      emailText,
    );
  // Plain vs without explicit guarantee word: "$5,000 vs 80%" / "$5,000 vs 85/15"
  const vsBareMatch = !vsMatch
    ? /\$?([\d,]+(?:\.\d+)?)\s+vs\s+(\d{1,3}(?:\.\d+)?)\s*(?:%|\/\s*\d{1,3})/i.exec(
        emailText,
      )
    : null;
  // Third pattern: "X g'tee with escalator/ratchet" — describes the same
  // vs-with-ratchet structure without using the "vs" keyword.
  const vsImplicitMatch =
    !vsMatch && !vsBareMatch
      ? /\$?([\d,]+(?:\.\d+)?)\s+g'?tee\s+with\s+(escalator|ratchet)/i.exec(
          emailText,
        )
      : null;
  const vsAny = vsMatch ?? vsBareMatch ?? vsImplicitMatch;

  if (vsAny) {
    dealType = "vs";
    if (hasVsGross) vsFlavor = "vs_gross";
    else if (hasWalkout) vsFlavor = "walkout";
    else if (hasRatchet) vsFlavor = "ratchet";
    else vsFlavor = "standard";
    record(ctx, "dealType", vsAny, vsFlavor === "standard" ? 0.95 : 0.85, "vs");
  }

  // Flat: "Flat $X" or "Flat guarantee $X" or "Flat $X. No upside."
  if (!dealType) {
    const flatMatch = /\bflat\s+(?:guarantee\s+)?\$?([\d,]+(?:\.\d+)?)/i.exec(
      emailText,
    );
    if (flatMatch) {
      dealType = "flat";
      record(ctx, "dealType", flatMatch, 0.98, "flat");
    }
  }

  // Door deal
  if (!dealType) {
    const doorMatch = /\bdoor\s+deal\b/i.exec(emailText);
    if (doorMatch) {
      dealType = "door";
      record(ctx, "dealType", doorMatch, 0.95, "door");
    }
  }

  // Percentage of net: "Y% of net after expenses" (without "vs")
  if (!dealType) {
    const pctNetMatch = /(\d{1,3}(?:\.\d+)?)\s*%\s+of\s+net\b/i.exec(emailText);
    if (pctNetMatch) {
      dealType = "percentage_of_net";
      record(ctx, "dealType", pctNetMatch, 0.9, "percentage_of_net");
    }
  }

  // Percentage of gross: "Y% of gross" (without "vs"). Negative lookahead
  // for "above" so we don't catch the walkout pot's "100% of gross above $X".
  if (!dealType) {
    const pctGrossMatch = /(\d{1,3}(?:\.\d+)?)\s*%\s+of\s+gross\b(?!\s+above)/i.exec(
      emailText,
    );
    if (pctGrossMatch) {
      dealType = "percentage_of_gross";
      record(ctx, "dealType", pctGrossMatch, 0.9, "percentage_of_gross");
    }
  }

  // -------- Guarantee amount --------
  let guaranteeAmount: number | null = null;
  if (dealType === "flat") {
    const m = /\bflat\s+(?:guarantee\s+)?\$?([\d,]+(?:\.\d+)?)/i.exec(emailText);
    if (m) {
      guaranteeAmount = parseMoney(m[1]);
      record(ctx, "guaranteeAmount", m, 0.98, "flat_amount");
    }
  } else if (dealType === "vs" && vsAny) {
    // The guarantee is the number before "vs" (group 1 of vsAny).
    const raw = vsAny[1];
    if (raw) {
      guaranteeAmount = parseMoney(raw);
      record(ctx, "guaranteeAmount", vsAny, 0.95, "vs_guarantee");
    } else {
      // Try a separate lookbehind: "$5,000" earlier in the sentence
      const before = emailText.slice(0, vsAny.index);
      const lastMoney = /\$([\d,]+(?:\.\d+)?)(?!\s*%)/g;
      let last: RegExpExecArray | null = null;
      let next;
      while ((next = lastMoney.exec(before)) !== null) last = next;
      if (last) {
        guaranteeAmount = parseMoney(last[1]);
        record(ctx, "guaranteeAmount", last, 0.85, "vs_guarantee_before");
      }
    }
  }

  // -------- Percentage --------
  // For Vs deals, the deal % MUST be the one immediately after "vs" — we
  // can't let later patterns like the walkout pot's "100% of gross above
  // $X" win. For non-vs deals, the standalone "X% of {net|gross}" matters.
  let percentage: number | null = null;
  let percentageBasis: "gross" | "net" | null = null;
  if (dealType === "vs") {
    // Anchor to "vs". Make "of" optional ("vs 80% net" is common shorthand).
    const vsPctMatch =
      /\bvs\s+(\d{1,3}(?:\.\d+)?)\s*%\s+(?:of\s+)?(net|gross)\b/i.exec(
        emailText,
      ) ?? /\bvs\s+(\d{1,3}(?:\.\d+)?)\s*%/i.exec(emailText);
    if (vsPctMatch) {
      percentage = Number(vsPctMatch[1]) / 100;
      // Pull basis from the regex if we matched the longer pattern; else
      // default by flavor (vs_gross → gross, anything else → net).
      const matchedBasis = vsPctMatch[2]?.toLowerCase();
      percentageBasis =
        matchedBasis === "gross" || matchedBasis === "net"
          ? (matchedBasis as "gross" | "net")
          : vsFlavor === "vs_gross"
            ? "gross"
            : "net";
      record(ctx, "percentage", vsPctMatch, matchedBasis ? 0.95 : 0.85, "vs_pct");
    } else {
      // X/Y split shorthand: "80/20 after expenses"
      const splitMatch = /\b(\d{2})\s*\/\s*(\d{2})\s+(after|net|split)/i.exec(
        emailText,
      );
      if (splitMatch) {
        const a = Number(splitMatch[1]);
        const b = Number(splitMatch[2]);
        if (a + b === 100) {
          percentage = a / 100;
          percentageBasis = "net";
          record(ctx, "percentage", splitMatch, 0.85, "split_pattern");
        }
      }
    }
  } else if (
    dealType === "percentage_of_net" ||
    dealType === "percentage_of_gross"
  ) {
    // For % deals there's no "vs" anchor; the standalone pattern is fine
    // because there's no walkout-pot phrase competing for the match.
    const pctMatch = /(\d{1,3}(?:\.\d+)?)\s*%\s+of\s+(net|gross)\b/i.exec(
      emailText,
    );
    if (pctMatch) {
      percentage = Number(pctMatch[1]) / 100;
      percentageBasis = pctMatch[2].toLowerCase() as "gross" | "net";
      record(ctx, "percentage", pctMatch, 0.95, "pct_of_basis");
    }
  }

  // -------- Expense cap --------
  // Accept "Expenses capped $X", "Expenses capped at $X", "Expenses to $X",
  // "Expense cap $X", "Expense cap at $X". All common in real emails.
  let expenseCap: number | null = null;
  if (vsFlavor !== "vs_gross" && dealType !== "percentage_of_gross") {
    const expMatch =
      /\bexpense(?:s)?\s+cap(?:ped)?\s+(?:at\s+)?\$?([\d,]+(?:\.\d+)?)/i.exec(
        emailText,
      ) ??
      /\bexpenses\s+to\s+\$?([\d,]+(?:\.\d+)?)/i.exec(emailText) ??
      /\bcap(?:ped)?\s+(?:at\s+)?\$([\d,]+(?:\.\d+)?)\s+in\s+expenses/i.exec(
        emailText,
      );
    if (expMatch) {
      expenseCap = parseMoney(expMatch[1]);
      record(ctx, "expenseCap", expMatch, 0.95, "expense_cap");
    }
  }

  // -------- Hospitality cap --------
  // Same "at" tolerance as expense cap.
  let hospitalityCap: number | null = null;
  const hospMatch =
    /\bhospitality\s+(?:cap(?:ped)?\s+)?(?:at\s+)?\$?([\d,]+(?:\.\d+)?)/i.exec(
      emailText,
    ) ??
    /\bhosp(?:\.|itality)?\s+(?:cap(?:ped)?\s+)?(?:at\s+)?\$([\d,]+(?:\.\d+)?)/i.exec(
      emailText,
    );
  if (hospMatch) {
    hospitalityCap = parseMoney(hospMatch[1]);
    record(ctx, "hospitalityCap", hospMatch, 0.95, "hospitality_cap");
  }

  // -------- Bonuses --------
  const bonuses: BriefBonus[] = [];

  // Sellout bonus
  const selloutMatch =
    /\+?\$?([\d,]+(?:\.\d+)?)\s+(?:on\s+|if\s+|bonus\s+on\s+)sellout\b/i.exec(
      emailText,
    );
  if (selloutMatch) {
    const amount = parseMoney(selloutMatch[1]) ?? 0;
    bonuses.push({
      type: "sellout",
      label: `+$${amount.toLocaleString()} on sellout`,
      amount,
    });
    ctx.matchedRules.push("sellout_bonus");
  }

  // Gross threshold: "+$X if gross > $Y" or "+$X bonus over $Y gross"
  const grossThresholdPatterns = [
    /\+?\$?([\d,]+(?:\.\d+)?)\s+if\s+gross\s+>\s*\$?([\d,]+(?:\.\d+)?k?)/gi,
    /\+?\$?([\d,]+(?:\.\d+)?)\s+bonus\s+over\s+\$?([\d,]+(?:\.\d+)?k?)\s+gross/gi,
  ];
  for (const pattern of grossThresholdPatterns) {
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(emailText)) !== null) {
      const amount = parseMoney(m[1]) ?? 0;
      const threshold = parseMoney(m[2]) ?? 0;
      // Don't double-add the same bonus
      if (
        !bonuses.some(
          (b) =>
            b.type === "gross_threshold" &&
            "threshold" in b &&
            b.threshold === threshold &&
            b.amount === amount,
        )
      ) {
        bonuses.push({
          type: "gross_threshold",
          label: `+$${amount.toLocaleString()} if gross > $${threshold.toLocaleString()}`,
          threshold,
          amount,
        });
        ctx.matchedRules.push("gross_threshold");
      }
    }
  }

  // Attendance threshold: "+$X if attendance > N"
  const attendanceMatch =
    /\+?\$?([\d,]+(?:\.\d+)?)\s+if\s+attendance\s+>\s*(\d+)/i.exec(emailText);
  if (attendanceMatch) {
    const amount = parseMoney(attendanceMatch[1]) ?? 0;
    const threshold = Number(attendanceMatch[2]);
    bonuses.push({
      type: "attendance_threshold",
      label: `+$${amount.toLocaleString()} if attendance > ${threshold}`,
      threshold,
      amount,
    });
    ctx.matchedRules.push("attendance_threshold");
  }

  // Walkout pot: "100% of gross above $X" or "Walkout pot: ... above $X"
  if (vsFlavor === "walkout") {
    const walkoutMatch =
      /(\d{1,3})\s*%\s+of\s+gross\s+above\s+\$?([\d,]+(?:\.\d+)?k?)/i.exec(
        emailText,
      );
    if (walkoutMatch) {
      const sharePct = Number(walkoutMatch[1]) / 100;
      const breakeven = parseMoney(walkoutMatch[2]) ?? 0;
      bonuses.push({
        type: "walkout_pot",
        label: `Walkout pot: ${(sharePct * 100).toFixed(0)}% of gross above $${breakeven.toLocaleString()}`,
        breakeven,
        sharePctAbove: sharePct,
      });
      ctx.matchedRules.push("walkout_pot");
    }
  }

  // -------- Recoups --------
  const recoups: BriefRecoup[] = [];
  const recoupPatterns = [
    /\b(marketing|hospitality|production)\s+recoup\s+(?:of\s+)?\$?([\d,]+(?:\.\d+)?)/gi,
    /\$?([\d,]+(?:\.\d+)?)\s+(marketing|hospitality|production)\s+recoup/gi,
  ];
  for (let i = 0; i < recoupPatterns.length; i++) {
    const pattern = recoupPatterns[i];
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(emailText)) !== null) {
      const category = (i === 0 ? m[1] : m[2]).toLowerCase() as
        | "marketing"
        | "hospitality"
        | "production";
      const amount = parseMoney(i === 0 ? m[2] : m[1]) ?? 0;
      const mapped =
        category === "marketing"
          ? "marketing"
          : category === "hospitality"
            ? "hospitality_overage"
            : "production_overage";

      // Placement detection — explicit signals around the match
      const window = emailText.slice(
        Math.max(0, m.index - 60),
        Math.min(emailText.length, m.index + m[0].length + 80),
      );
      const explicitInside =
        /\b(inside\s+(?:the\s+)?cap|included\s+in\s+(?:the\s+)?cap|part\s+of\s+(?:the\s+)?cap|counts\s+against\s+(?:the\s+)?cap)\b/i.test(
          window,
        );
      const explicitOutside =
        /\b(outside\s+(?:the\s+)?cap|in\s+addition\s+to|separate\s+from|against\s+gross\s+before|off\s+the\s+top)\b/i.test(
          window,
        );
      const placement: "inside_cap" | "outside_cap" = explicitInside
        ? "inside_cap"
        : "outside_cap";

      if (
        !recoups.some((r) => r.category === mapped && r.amount === amount)
      ) {
        recoups.push({
          category: mapped,
          label: `${category[0].toUpperCase() + category.slice(1)} recoup`,
          amount,
          placement,
        });
        ctx.matchedRules.push(`recoup_${category}`);
      }

      void explicitOutside; // tracked for future telemetry
    }
  }

  // -------- Ambiguity triggers --------
  const triggers: string[] = [];
  const ambiguities: Ambiguity[] = [];

  // Trigger: renegotiation footnotes
  if (
    /\b(renegotiated|updated\s+\d+\s+(days?|weeks?)\s+before|\[updated|via\s+phone\s+call|phone\s+call\s+with)\b/i.test(
      emailText,
    )
  ) {
    triggers.push("renegotiation_footnote");
  }

  // Trigger: marketing recoup + expense cap with NO explicit placement language
  // (the Coastal Spell pattern — root cause of the $720 loss)
  const hasMarketingRecoup = recoups.some((r) => r.category === "marketing");
  const hasCap = expenseCap != null;
  if (hasMarketingRecoup && hasCap) {
    const explicitPlacement =
      /\b(inside\s+(?:the\s+)?cap|included\s+in\s+(?:the\s+)?cap|outside\s+(?:the\s+)?cap|in\s+addition\s+to\s+(?:the\s+)?cap|separate\s+from\s+(?:the\s+)?cap|against\s+gross\s+before\s+expenses)\b/i.test(
        emailText,
      );
    if (!explicitPlacement) {
      triggers.push("recoup_placement_ambiguous");

      // Emit an ambiguity card so the UI surfaces it even if LLM is skipped.
      const recoupMatch = /(marketing\s+recoup\s+(?:of\s+)?\$?[\d,]+(?:\.\d+)?[^.\n]*)/i.exec(
        emailText,
      );
      const recoup = recoups.find((r) => r.category === "marketing");
      const span = recoupMatch
        ? {
            start: recoupMatch.index,
            end: recoupMatch.index + recoupMatch[0].length,
            excerpt: recoupMatch[1],
          }
        : { start: 0, end: 0, excerpt: "marketing recoup vs expense cap" };

      // Estimate dollar impact: percentage applied to the recoup amount,
      // which is the swing between "recoup off gross" vs "recoup inside cap"
      const swing =
        recoup && percentage != null
          ? Math.round(recoup.amount * percentage)
          : null;

      ambiguities.push({
        id: `tier0_recoup_placement`,
        span,
        readingA: `The recoup is OUTSIDE the expense cap — comes off gross before the cap is applied.`,
        readingB: `The recoup is INSIDE the expense cap — counts against the cap alongside other expenses.`,
        dollarImpact: swing,
      });
    }
  }

  // Trigger: "performance bonuses per the email" or "see email thread"
  if (
    /\b(performance\s+bonuses\s+per\s+(?:the\s+)?(?:deal|email)|see\s+(?:the\s+)?email\s+thread)\b/i.test(
      emailText,
    )
  ) {
    triggers.push("bonuses_by_reference");
  }

  // -------- Confidence aggregation --------
  // If no dealType: confidence 0.
  // Else: average of field confidences (only for fields we care about for
  // the detected deal type), minus penalties for triggers.
  let overall = 0;
  if (dealType) {
    const required: string[] = ["dealType"];
    if (dealType === "vs" || dealType === "flat") required.push("guaranteeAmount");
    if (dealType === "vs" || dealType === "percentage_of_net" || dealType === "percentage_of_gross") {
      required.push("percentage");
    }
    if (vsFlavor !== "vs_gross" && (dealType === "vs" || dealType === "percentage_of_net" || dealType === "door")) {
      required.push("expenseCap");
    }

    const scores = required.map((f) => ctx.fieldConfidence[f] ?? 0);
    overall = scores.reduce((a, b) => a + b, 0) / scores.length;
    // Penalty: 0.15 per trigger
    overall = Math.max(0, overall - triggers.length * 0.15);
  }

  const brief: DealBrief = {
    dealType: dealType ?? "flat", // safe default; overall=0 if guessed
    vsFlavor,
    guaranteeAmount,
    percentage,
    percentageBasis,
    expenseCap,
    hospitalityCap,
    bonuses,
    recoups,
    confidence: ctx.fieldConfidence,
    sources: ctx.sources,
    extractedBy: "tier0_parser",
  };

  return {
    brief,
    ambiguities,
    triggers,
    overallConfidence: overall,
    matchedRules: ctx.matchedRules,
  };
}

/**
 * Merge Tier 0 ambiguities with Tier 2 (LLM) ambiguities, de-duping by
 * roughly-overlapping spans. Tier 0 findings are deterministic and always
 * trustworthy; LLM findings layer on top.
 */
export function mergeAmbiguities(
  tier0: Ambiguity[],
  tier2: Ambiguity[],
): Ambiguity[] {
  const merged = [...tier0];
  for (const a of tier2) {
    const dup = merged.some(
      (m) =>
        Math.abs(m.span.start - a.span.start) < 20 &&
        Math.abs(m.span.end - a.span.end) < 40,
    );
    if (!dup) merged.push(a);
  }
  return merged;
}
