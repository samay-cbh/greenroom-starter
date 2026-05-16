/**
 * Server-side shadow deal comparison.
 *
 * Takes the stored shadowDealJson (AI-extracted "negotiated truth") and
 * compares it against the current structured deal fields. Returns the same
 * FieldContradiction / FieldAmbiguity shapes used by the badge — but without
 * an AI API call. Runs on every page load so the badge is always up-to-date.
 *
 * Dismissed fields are excluded so previously acknowledged suggestions don't
 * resurface across page loads.
 */

import type { Deal, Expense } from "@/db/schema";
import type { FieldContradiction, FieldAmbiguity, ShadowDeal } from "./notesExtractor";

function fmtField(field: string, deal: Deal): string {
  switch (field) {
    case "dealType":
      return deal.dealType ?? "not set";
    case "guaranteeAmount":
      return deal.guaranteeAmount != null
        ? `$${deal.guaranteeAmount.toLocaleString()}`
        : "not set";
    case "percentage":
      return deal.percentage != null
        ? `${(deal.percentage * 100).toFixed(0)}%`
        : "not set";
    case "expenseCap":
      return deal.expenseCap != null
        ? `$${deal.expenseCap.toLocaleString()}`
        : "not set";
    case "recoupBasis":
      return deal.recoupBasis ?? "not set";
    default:
      return "not set";
  }
}

export function parseShadowDismissals(json: string | null | undefined): string[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function parseShadowDeal(json: string | null | undefined): ShadowDeal | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as ShadowDeal;
  } catch {
    return null;
  }
}

export function compareShadowToFields(
  shadow: ShadowDeal,
  deal: Deal,
  dismissed: string[],
  expenses: Expense[],
): { contradictions: FieldContradiction[]; ambiguities: FieldAmbiguity[] } {
  const contradictions: FieldContradiction[] = [];
  const ambiguities: FieldAmbiguity[] = [];
  const out = new Set(dismissed);

  const justify = (field: string) =>
    shadow.justifications?.find((j) => j.field === field)?.quote ?? "";

  // dealType
  if (shadow.dealType && shadow.dealType !== deal.dealType && !out.has("dealType")) {
    contradictions.push({
      field: "dealType",
      label: "Deal type",
      currentValue: deal.dealType,
      notesSay: shadow.dealType,
      excerpt: justify("dealType"),
      suggestedValue: shadow.dealType,
      severity: "error",
    });
  }

  // guaranteeAmount — $1 tolerance for rounding
  if (
    shadow.guaranteeAmount != null &&
    Math.abs((deal.guaranteeAmount ?? 0) - shadow.guaranteeAmount) > 1 &&
    !out.has("guaranteeAmount")
  ) {
    contradictions.push({
      field: "guaranteeAmount",
      label: "Guarantee",
      currentValue: fmtField("guaranteeAmount", deal),
      notesSay: `$${shadow.guaranteeAmount.toLocaleString()}`,
      excerpt: justify("guaranteeAmount"),
      suggestedValue: shadow.guaranteeAmount,
      severity: "error",
    });
  }

  // percentage — 0.5% tolerance
  if (
    shadow.percentage != null &&
    Math.abs((deal.percentage ?? 0) - shadow.percentage) > 0.005 &&
    !out.has("percentage")
  ) {
    contradictions.push({
      field: "percentage",
      label: "Percentage",
      currentValue: fmtField("percentage", deal),
      notesSay: `${(shadow.percentage * 100).toFixed(0)}%`,
      excerpt: justify("percentage"),
      suggestedValue: shadow.percentage,
      severity: "error",
    });
  }

  // expenseCap — $1 tolerance
  if (
    shadow.expenseCap != null &&
    Math.abs((deal.expenseCap ?? 0) - shadow.expenseCap) > 1 &&
    !out.has("expenseCap")
  ) {
    contradictions.push({
      field: "expenseCap",
      label: "Expense cap",
      currentValue: fmtField("expenseCap", deal),
      notesSay: `$${shadow.expenseCap.toLocaleString()}`,
      excerpt: justify("expenseCap"),
      suggestedValue: shadow.expenseCap,
      severity: "error",
    });
  }

  // recoupBasis contradiction — shadow AND deal both have a value but they differ
  if (
    shadow.recoupBasis &&
    deal.recoupBasis &&
    shadow.recoupBasis !== deal.recoupBasis &&
    !out.has("recoupBasis")
  ) {
    contradictions.push({
      field: "recoupBasis",
      label: "Recoup basis",
      currentValue: deal.recoupBasis,
      notesSay: shadow.recoupBasis,
      excerpt: justify("recoupBasis"),
      suggestedValue: shadow.recoupBasis,
      severity: "warning",
    });
  }

  // recoupBasis ambiguity — shadow extracted a recoup quote but basis is null on deal
  if (!deal.recoupBasis && !out.has("recoupBasis_ambiguity")) {
    const excerpt = justify("recoupBasis");
    if (excerpt) {
      ambiguities.push({
        field: "recoupBasis",
        label: "Recoup basis",
        excerpt,
        question:
          "Notes mention a recoup. Should it apply inside the expense cap or as a separate gross deduction?",
      });
    }
  }

  // hospitalityBasis ambiguity — hospitality expenses exist but basis not set
  const hasHospitality = expenses.some(
    (e) => !e.absorbedByVenue && e.category === "hospitality" && e.amount > 0,
  );
  if (hasHospitality && !deal.hospitalityBasis && !out.has("hospitalityBasis")) {
    ambiguities.push({
      field: "hospitalityBasis" as keyof Deal,
      label: "Hospitality treatment",
      excerpt: "",
      question:
        "Hospitality expenses were submitted. Should they be deducted inside the expense cap, or separately outside of it?",
    });
  }

  return { contradictions, ambiguities };
}
