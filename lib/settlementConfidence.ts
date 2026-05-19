import type { Deal, Expense, Recoup, Settlement, TicketSale } from "@/db/schema";

type ConfidenceLevel = "high" | "medium" | "low";
type ReviewSeverity = "info" | "warning" | "critical";

export type InterpretedDeal = {
  dealType: "vs_net" | "vs_gross" | "percentage_net" | "percentage_gross" | "flat" | "door" | "unknown";
  guarantee: number | null;
  percentage: number | null;
  percentageBasis: "gross" | "net" | null;
  expenseRules: {
    category: string;
    cap: number | null;
    approvalRequired: boolean;
    sourceText: string;
    confidence: ConfidenceLevel;
  }[];
  marketingRecoup: {
    amount: number | null;
    insideExpenseCap: boolean | null;
    approvalRequired: boolean;
    sourceText: string;
    confidence: ConfidenceLevel;
  } | null;
  walkoutThreshold: number | null;
  sourceText: string;
};

export type ConfidenceIssue = {
  id: string;
  severity: ReviewSeverity;
  title: string;
  detail: string;
  sourceText?: string;
  recommendation: string;
};

export type SettlementExplanation = {
  id: string;
  label: string;
  amount: number | null;
  why: string;
  source: string;
  confidence: ConfidenceLevel;
  status?: string;
};

export type SettlementConfidenceResult = {
  score: number;
  level: ConfidenceLevel;
  summary: string;
  interpretation: InterpretedDeal;
  issues: ConfidenceIssue[];
  explanations: SettlementExplanation[];
};

type ConfidenceInput = {
  deal: Deal;
  expenses: Expense[];
  ticketSales: TicketSale[];
  settlement: Settlement | null;
  recoups: Recoup[];
};

const MONEY_RE = /\$?\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{2})?\s?k?\b/i;

export function analyzeSettlementConfidence({
  deal,
  expenses,
  ticketSales,
  settlement,
  recoups,
}: ConfidenceInput): SettlementConfidenceResult {
  const notes = deal.dealNotesFreetext ?? "";
  const interpretation = interpretDealNotes(notes, deal);
  const issues: ConfidenceIssue[] = [
    ...detectAmbiguity(notes),
    ...detectStructuredContradictions(deal, interpretation),
    ...detectSettlementContradictions(settlement, recoups),
    ...detectExpenseGaps(deal, expenses, interpretation),
  ];

  const explanations = buildExplanations({
    deal,
    expenses,
    ticketSales,
    settlement,
    recoups,
    interpretation,
  });

  const score = confidenceScore(interpretation, issues);
  const level = score >= 80 ? "high" : score >= 58 ? "medium" : "low";

  return {
    score,
    level,
    summary: summaryFor(level, issues),
    interpretation,
    issues,
    explanations,
  };
}

function interpretDealNotes(notes: string, deal: Deal): InterpretedDeal {
  const lower = notes.toLowerCase();
  const guarantee = extractGuarantee(notes) ?? deal.guaranteeAmount ?? null;
  const percentage = extractPercentage(notes) ?? percentToWhole(deal.percentage);
  const percentageBasis = extractPercentageBasis(notes) ?? deal.percentageBasis ?? null;

  const dealType = (() => {
    if (lower.includes(" vs ") || lower.includes(" versus ") || lower.includes("whichever greater")) {
      return percentageBasis === "gross" ? "vs_gross" : "vs_net";
    }
    if (lower.includes("door")) return "door";
    if (percentage != null) return percentageBasis === "gross" ? "percentage_gross" : "percentage_net";
    if (guarantee != null) return "flat";
    return "unknown";
  })();

  const expenseRules = extractExpenseRules(notes, deal);
  const marketingRecoup = extractMarketingRecoup(notes);
  const walkoutThreshold = extractWalkoutThreshold(notes);

  return {
    dealType,
    guarantee,
    percentage,
    percentageBasis,
    expenseRules,
    marketingRecoup,
    walkoutThreshold,
    sourceText: notes,
  };
}

function extractGuarantee(notes: string): number | null {
  const guaranteeMatch =
    notes.match(/\$?\s?(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s?k?\s*(?:g'?tee|guarantee)/i) ??
    notes.match(/(?:guarantee|g'?tee)\s*(?:of)?\s*\$?\s?(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s?k?\b/i) ??
    notes.match(/^\s*\$?\s?(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s?k?\s*(?:vs|versus)\b/i);
  return guaranteeMatch ? moneyToNumber(guaranteeMatch[1], guaranteeMatch[0]) : null;
}

function extractPercentage(notes: string): number | null {
  const match = notes.match(/(\d{2,3})\s*%/) ?? notes.match(/\b(\d{2})\s*\/\s*(\d{2})\b/);
  if (!match) return null;
  return Number(match[1]);
}

function extractPercentageBasis(notes: string): "gross" | "net" | null {
  const explicitPercentageBasis = notes.match(/\d{2,3}\s*%\s*(?:of|on)?\s*(gross|net)\b/i);
  if (explicitPercentageBasis) return explicitPercentageBasis[1].toLowerCase() as "gross" | "net";

  const splitBasis = notes.match(/\b\d{2}\s*\/\s*\d{2}\s*(?:split)?\s*(?:of|on)?\s*(gross|net)\b/i);
  if (splitBasis) return splitBasis[1].toLowerCase() as "gross" | "net";

  const percentageClause = sentenceContaining(notes, /\d{2,3}\s*%|\b\d{2}\s*\/\s*\d{2}\b/);
  if (!percentageClause) return null;
  if (/\bnet\b/i.test(percentageClause)) return "net";
  if (/\bgross\b/i.test(percentageClause)) return "gross";
  return null;
}

function extractExpenseRules(notes: string, deal: Deal): InterpretedDeal["expenseRules"] {
  const rules: InterpretedDeal["expenseRules"] = [];
  const expenseCapClause =
    sentenceContaining(notes, /expense.*cap|cap.*expense|expenses capped|capped at/i) ??
    sentenceContaining(notes, /expense/i);
  if (expenseCapClause) {
    const cap = extractMoneyNear(expenseCapClause, /cap|capped|expenses/i) ?? deal.expenseCap ?? null;
    rules.push({
      category: "approved expenses",
      cap,
      approvalRequired: /approved|advance|mutually agreed/i.test(expenseCapClause),
      sourceText: expenseCapClause,
      confidence: cap != null ? "high" : "medium",
    });
  } else if (deal.expenseCap != null) {
    rules.push({
      category: "approved expenses",
      cap: deal.expenseCap,
      approvalRequired: false,
      sourceText: "Structured expense cap field",
      confidence: "medium",
    });
  }

  const hospitalityClause = sentenceContaining(notes, /hospitality/i);
  if (hospitalityClause || deal.hospitalityCap != null) {
    rules.push({
      category: "hospitality",
      cap: hospitalityClause ? extractMoneyNear(hospitalityClause, /hospitality/i) : deal.hospitalityCap,
      approvalRequired: hospitalityClause ? /approved|advance|mutually agreed/i.test(hospitalityClause) : false,
      sourceText: hospitalityClause ?? "Structured hospitality cap field",
      confidence: hospitalityClause ? "high" : "medium",
    });
  }

  const marketingClause = sentenceContaining(notes, /marketing/i);
  if (marketingClause && /cap|capped|approved|support|recoup/i.test(marketingClause)) {
    rules.push({
      category: "marketing",
      cap: extractMoneyNear(marketingClause, /marketing/i),
      approvalRequired: /approved|advance|mutually agreed/i.test(marketingClause),
      sourceText: marketingClause,
      confidence: /mutually agreed|support/i.test(marketingClause) ? "low" : "medium",
    });
  }

  return dedupeRules(rules);
}

function extractMarketingRecoup(notes: string): InterpretedDeal["marketingRecoup"] {
  const clause = sentenceContaining(notes, /marketing/i);
  if (!clause || !/recoup|support|ad spend|promo/i.test(clause)) return null;
  const insideExpenseCap =
    /inside|within|included in|against expense cap/i.test(clause)
      ? true
      : /outside|in addition|against gross|off the top/i.test(clause)
        ? false
        : null;

  return {
    amount: extractMoneyNear(clause, /marketing|recoup/i),
    insideExpenseCap,
    approvalRequired: /approved|advance|mutually agreed/i.test(clause),
    sourceText: clause,
    confidence: insideExpenseCap == null || /mutually agreed|support/i.test(clause) ? "low" : "medium",
  };
}

function extractWalkoutThreshold(notes: string): number | null {
  const clause = sentenceContaining(notes, /walkout|threshold|after \d{3}/i);
  if (!clause || !/walkout|after/i.test(clause.toLowerCase())) return null;
  const match = clause.match(/after\s+(\d{3,4})\s*(?:paid|tickets|sold|attendance)?/i);
  return match ? Number(match[1]) : null;
}

function detectAmbiguity(notes: string): ConfidenceIssue[] {
  const out: ConfidenceIssue[] = [];
  const ambiguousClauses = [
    { pattern: /mutually agreed/i, title: "Mutual agreement language needs review" },
    { pattern: /marketing support/i, title: "Marketing support is underspecified" },
    { pattern: /approved expenses?/i, title: "Approved expenses may need proof" },
    { pattern: /reasonable|customary|TBD|to be confirmed/i, title: "Soft language creates settlement risk" },
  ];

  for (const item of ambiguousClauses) {
    const sourceText = sentenceContaining(notes, item.pattern);
    if (!sourceText) continue;
    out.push({
      id: `ambiguous-${out.length}`,
      severity: item.pattern.test("approved expenses") ? "info" : "warning",
      title: item.title,
      detail: "The notes point to a judgment call that could be read differently by the venue, TM, or agent.",
      sourceText,
      recommendation: "Confirm the intended interpretation before sending the settlement.",
    });
  }

  const marketing = sentenceContaining(notes, /marketing/i);
  if (marketing && /recoup/i.test(marketing) && !/inside|outside|cap|gross|net|off the top/i.test(marketing)) {
    out.push({
      id: "marketing-recoup-placement",
      severity: "critical",
      title: "Marketing recoup placement is ambiguous",
      detail: "The clause mentions a marketing recoup but does not say whether it sits inside the expense cap, outside the cap, or against gross.",
      sourceText: marketing,
      recommendation: "Resolve this in writing; this exact ambiguity caused the Coastal Spell dispute.",
    });
  }

  return out;
}

function detectStructuredContradictions(deal: Deal, interpretation: InterpretedDeal): ConfidenceIssue[] {
  const out: ConfidenceIssue[] = [];
  const interpretedTypeToStructured: Record<InterpretedDeal["dealType"], Deal["dealType"] | null> = {
    vs_net: "vs",
    vs_gross: "vs",
    percentage_net: "percentage_of_net",
    percentage_gross: "percentage_of_gross",
    flat: "flat",
    door: "door",
    unknown: null,
  };
  const expectedType = interpretedTypeToStructured[interpretation.dealType];

  if (expectedType && expectedType !== deal.dealType) {
    out.push({
      id: "deal-type-conflict",
      severity: "critical",
      title: "Structured deal type conflicts with notes",
      detail: `The structured field says ${deal.dealType}, but the notes read like ${interpretation.dealType}.`,
      sourceText: interpretation.sourceText,
      recommendation: "Treat the prose as the review target and update the structured deal before settlement.",
    });
  }

  if (interpretation.percentage != null && deal.percentage != null) {
    const structuredPct = Math.round(deal.percentage * 100);
    if (Math.abs(structuredPct - interpretation.percentage) >= 2) {
      out.push({
        id: "percentage-conflict",
        severity: "critical",
        title: "Percentage split conflicts with notes",
        detail: `Structured split is ${structuredPct}%, but the notes say ${interpretation.percentage}%.`,
        sourceText: interpretation.sourceText,
        recommendation: "Review the latest negotiation thread before calculating payout.",
      });
    }
  }

  if (interpretation.percentageBasis && deal.percentageBasis && interpretation.percentageBasis !== deal.percentageBasis) {
    out.push({
      id: "basis-conflict",
      severity: "critical",
      title: "Gross/net basis conflicts with notes",
      detail: `Structured basis is ${deal.percentageBasis}, but the notes say ${interpretation.percentageBasis}.`,
      sourceText: interpretation.sourceText,
      recommendation: "Do not settle until the basis is confirmed.",
    });
  }

  return out;
}

function detectSettlementContradictions(settlement: Settlement | null, recoups: Recoup[]): ConfidenceIssue[] {
  const out: ConfidenceIssue[] = [];
  if (!settlement) return out;

  if (settlement.status === "disputed" && settlement.signoffText && /looks good|ok|sign off|wire/i.test(settlement.signoffText)) {
    out.push({
      id: "status-signoff-conflict",
      severity: "warning",
      title: "Status and sign-off language disagree",
      detail: "The settlement is marked disputed, but the artist-team sign-off sounds positive.",
      sourceText: settlement.signoffText,
      recommendation: "Check whether the dispute was reopened after sign-off or the status is stale.",
    });
  }

  const disputedRecoups = recoups.filter((r) => r.status === "disputed");
  if (settlement.status === "paid" && disputedRecoups.length > 0) {
    out.push({
      id: "paid-with-disputed-recoup",
      severity: "critical",
      title: "Paid settlement still has disputed recoups",
      detail: `${disputedRecoups.length} recoup line item remains disputed after payment.`,
      recommendation: "Resolve or withdraw the disputed recoup before treating the account as clean.",
    });
  }

  if (settlement.submittedAt && settlement.signedAt && new Date(settlement.signedAt) < new Date(settlement.submittedAt)) {
    out.push({
      id: "timestamp-order",
      severity: "warning",
      title: "Lifecycle timestamps are out of order",
      detail: "Signed date appears before submitted date.",
      recommendation: "Verify settlement history before relying on lifecycle status.",
    });
  }

  return out;
}

function detectExpenseGaps(
  deal: Deal,
  expenses: Expense[],
  interpretation: InterpretedDeal,
): ConfidenceIssue[] {
  const out: ConfidenceIssue[] = [];
  const hospitalityCap = interpretation.expenseRules.find((r) => r.category === "hospitality")?.cap ?? deal.hospitalityCap;
  if (hospitalityCap != null) {
    const hospitalityTotal = expenses
      .filter((e) => e.category === "hospitality" && !e.absorbedByVenue)
      .reduce((sum, e) => sum + e.amount, 0);
    if (hospitalityTotal > hospitalityCap) {
      out.push({
        id: "hospitality-over-cap",
        severity: "warning",
        title: "Hospitality exceeds cap",
        detail: `Hospitality passed through is $${hospitalityTotal.toFixed(2)} against a $${hospitalityCap.toFixed(2)} cap.`,
        recommendation: "Show the absorbed amount or explain why the overage is artist-approved.",
      });
    }
  }

  return out;
}

function buildExplanations({
  deal,
  expenses,
  ticketSales,
  settlement,
  recoups,
  interpretation,
}: ConfidenceInput & { interpretation: InterpretedDeal }): SettlementExplanation[] {
  const gross = ticketSales.reduce((sum, t) => sum + t.gross, 0);
  const fees = ticketSales.reduce((sum, t) => sum + t.fees, 0);
  const passThroughExpenseRows = expenses.filter((e) => !e.absorbedByVenue);
  const passThroughExpenses = passThroughExpenseRows.reduce((sum, e) => sum + e.amount, 0);

  const explanations: SettlementExplanation[] = [
    {
      id: "gross",
      label: "Gross box office",
      amount: gross,
      why: "Imported from ticket sales for this show.",
      source: `${ticketSales.length} ticket sales record${ticketSales.length === 1 ? "" : "s"}`,
      confidence: ticketSales.length > 0 ? "high" : "low",
    },
    {
      id: "net",
      label: "Net box office",
      amount: gross - fees,
      why: "Gross box office less ticketing fees.",
      source: `Fees total $${fees.toFixed(2)}`,
      confidence: ticketSales.length > 0 ? "high" : "low",
    },
    {
      id: "expenses",
      label: "Passed-through expenses",
      amount: passThroughExpenses,
      why: "Only expenses not absorbed by the venue are included.",
      source: `${passThroughExpenseRows.length} expense line item${passThroughExpenseRows.length === 1 ? "" : "s"}`,
      confidence: expenses.length > 0 ? "medium" : "low",
    },
  ];

  if (interpretation.guarantee != null) {
    explanations.push({
      id: "guarantee",
      label: "Guarantee floor",
      amount: interpretation.guarantee,
      why: "The artist should receive at least this amount before upside rules are considered.",
      source: sourceForValue(interpretation.sourceText, /\$|guarantee|g'?tee|vs/i),
      confidence: deal.guaranteeAmount === interpretation.guarantee ? "high" : "medium",
    });
  }

  if (interpretation.percentage != null) {
    explanations.push({
      id: "percentage",
      label: `${interpretation.percentage}% of ${interpretation.percentageBasis ?? "basis unclear"}`,
      amount: null,
      why: "The percentage term determines the upside side of the deal.",
      source: sourceForValue(interpretation.sourceText, /%|split|net|gross/i),
      confidence: interpretation.percentageBasis ? "high" : "medium",
    });
  }

  for (const rule of interpretation.expenseRules) {
    explanations.push({
      id: `expense-${rule.category}`,
      label: `${titleCase(rule.category)} rule`,
      amount: rule.cap,
      why: rule.approvalRequired
        ? "This deduction likely requires approval or prior agreement."
        : "This controls which expenses can be passed through to the artist calculation.",
      source: rule.sourceText,
      confidence: rule.confidence,
    });
  }

  for (const recoup of recoups) {
    explanations.push({
      id: `recoup-${recoup.id}`,
      label: recoup.label,
      amount: recoup.amount,
      why: "Venue cost listed as a recoup separate from normal show expenses.",
      source: interpretation.marketingRecoup?.sourceText ?? "Settlement recoups record",
      confidence: recoup.status === "disputed" ? "low" : "medium",
      status: recoup.status,
    });
  }

  if (interpretation.walkoutThreshold != null) {
    explanations.push({
      id: "walkout",
      label: "Walkout threshold",
      amount: null,
      why: "Ticket count above this threshold may trigger a separate artist walkout rule.",
      source: sourceForValue(interpretation.sourceText, /walkout|after/i),
      confidence: "medium",
    });
  }

  if (settlement?.totalToArtist != null) {
    explanations.push({
      id: "total-to-artist",
      label: "Logged total to artist",
      amount: settlement.totalToArtist,
      why: "This is the settlement total recorded in Greenroom, even when the in-app calculator cannot reproduce the deal.",
      source: settlement.calculationJson ? "Settlement calculation JSON" : "Settlement record",
      confidence: settlement.status === "disputed" ? "medium" : "high",
      status: settlement.status,
    });
  }

  return explanations;
}

function confidenceScore(interpretation: InterpretedDeal, issues: ConfidenceIssue[]) {
  let score = 88;
  if (interpretation.dealType === "unknown") score -= 18;
  if (interpretation.percentage != null && !interpretation.percentageBasis) score -= 10;
  if (interpretation.marketingRecoup?.insideExpenseCap == null && interpretation.marketingRecoup) score -= 14;
  for (const issue of issues) {
    score -= issue.severity === "critical" ? 18 : issue.severity === "warning" ? 10 : 4;
  }
  return Math.max(18, Math.min(96, score));
}

function summaryFor(level: ConfidenceLevel, issues: ConfidenceIssue[]) {
  if (level === "high") return "Deal terms look internally consistent. Show sources before sending.";
  if (issues.some((i) => i.severity === "critical")) {
    return "Manual review required before settlement. At least one term conflicts or is underspecified.";
  }
  return "Usable with review. The assistant found clauses Mariana should confirm before final sign-off.";
}

function sentenceContaining(text: string, pattern: RegExp): string | null {
  const sentences = text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return sentences.find((s) => pattern.test(s)) ?? null;
}

function extractMoneyNear(text: string, pattern: RegExp): number | null {
  if (!pattern.test(text)) return null;
  const match = text.match(MONEY_RE);
  return match ? moneyToNumber(match[1], match[0]) : null;
}

function moneyToNumber(value: string, raw: string): number {
  const base = Number(value.replace(/,/g, ""));
  return /\d\s*k\b/i.test(raw) ? base * 1000 : base;
}

function percentToWhole(value: number | null): number | null {
  return value == null ? null : Math.round(value * 100);
}

function sourceForValue(text: string, pattern: RegExp) {
  return sentenceContaining(text, pattern) ?? "Structured deal field";
}

function dedupeRules(rules: InterpretedDeal["expenseRules"]) {
  const seen = new Set<string>();
  return rules.filter((rule) => {
    const key = `${rule.category}-${rule.sourceText}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function titleCase(value: string) {
  return value.replace(/\b\w/g, (c) => c.toUpperCase());
}
