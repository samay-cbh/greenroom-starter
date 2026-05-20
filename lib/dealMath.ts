/**
 * Deal calculation logic for the in-app settlement tool.
 *
 * IMPORTANT — DELIBERATELY INCOMPLETE.
 *
 * This is the existing Greenroom settlement engine. It was built early in
 * the company's life, when most deals were flat guarantees. It currently
 * handles two deal types end-to-end:
 *
 *   1. flat                 — $X guaranteed, optional sellout bonus
 *   2. percentage_of_gross  — X% of gross, no expense deductions, optional sellout bonus
 *
 * For both, it reads `bonusesJson` and applies bonuses where it can — but
 * only the structured ones. Bonuses that exist only in `dealNotesFreetext`
 * are invisible to this engine.
 *
 * It does NOT handle:
 *
 *   - vs deals (guarantee vs % of net, whichever greater)
 *   - percentage_of_net deals (with expense deductions)
 *   - door deals
 *   - recoups (those flow separately through the settlement record)
 *   - tier ratchets (would need vs-deal support first)
 *   - comps that count toward gross
 *
 * For unsupported deals, the tool returns { supported: false } and the UI
 * shows the "this deal type isn't yet supported" empty state. About 82% of
 * Greenroom's customers default to spreadsheets because of this.
 */

import type { Deal, Expense, TicketSale, Bonus } from "@/db/schema";

export type SettlementCalculation =
  | {
      supported: true;
      grossBoxOffice: number;
      netBoxOffice: number;
      totalExpenses: number;
      totalToArtist: number;
      steps: { label: string; value: number; note?: string }[];
      finalFormula: string;
      // Bonuses that were applied. Empty array if no bonuses on the deal,
      // or if no bonuses triggered.
      bonusesApplied: { label: string; amount: number; reason: string }[];
      // Bonuses that exist on the deal but didn't trigger (helpful context).
      bonusesNotTriggered: { label: string; amount: number; reason: string }[];
    }
  | {
      supported: false;
      reason: string;
      dealType: Deal["dealType"];
    };

interface CalcInput {
  deal: Deal;
  ticketSales: TicketSale[];
  expenses: Expense[];
  // Capacity is needed to evaluate sellout bonuses. Optional — if omitted,
  // sellout bonuses are reported as "can't determine".
  venueCapacity?: number;
  ticketsSold?: number;
}

type WalkoutCandidate = { label: string; threshold: number; percentage: number; value: number };

function getWalkoutCandidates(bonuses: Bonus[], gross: number): WalkoutCandidate[] {
  return bonuses
    .filter((b): b is Extract<Bonus, { type: "gross_percentage_above_threshold" }> =>
      b.type === "gross_percentage_above_threshold"
    )
    .map((b) => ({
      label: b.label,
      threshold: b.threshold,
      percentage: b.percentage,
      value: gross > b.threshold ? (gross - b.threshold) * b.percentage : 0,
    }));
}

export function parseBonuses(deal: Deal): Bonus[] {
  if (!deal.bonusesJson) return [];
  try {
    const parsed = JSON.parse(deal.bonusesJson);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function calculateSettlement(input: CalcInput): SettlementCalculation {
  const { deal, ticketSales, expenses, venueCapacity, ticketsSold } = input;

  const grossBoxOffice = ticketSales.reduce((sum, t) => sum + t.gross, 0);
  const totalFees = ticketSales.reduce((sum, t) => sum + t.fees, 0);
  const netBoxOffice = grossBoxOffice - totalFees;
  const totalExpenses = expenses
    .filter((e) => !e.absorbedByVenue)
    .reduce((sum, e) => sum + e.amount, 0);

  const tickets =
    ticketsSold ?? ticketSales.reduce((sum, t) => sum + (t.qty ?? 0), 0);

  // ---------- flat guarantee ----------
  if (deal.dealType === "flat") {
    if (deal.guaranteeAmount == null) {
      return {
        supported: false,
        reason: "Flat deal is missing a guarantee amount.",
        dealType: deal.dealType,
      };
    }
    const bonusResult = applyBonuses(parseBonuses(deal), {
      gross: grossBoxOffice,
      tickets,
      capacity: venueCapacity,
    });

    return {
      supported: true,
      grossBoxOffice,
      netBoxOffice,
      totalExpenses,
      totalToArtist: deal.guaranteeAmount + bonusResult.totalApplied,
      steps: [
        {
          label: "Flat guarantee",
          value: deal.guaranteeAmount,
          note: "No expense deductions. The guarantee is the floor.",
        },
        ...bonusResult.applied.map((b) => ({
          label: b.label,
          value: b.amount,
          note: b.reason,
        })),
      ],
      finalFormula: bonusResult.applied.length
        ? `flat ${deal.guaranteeAmount} + bonuses ${bonusResult.totalApplied} = ${(deal.guaranteeAmount + bonusResult.totalApplied).toFixed(2)}`
        : `flat guarantee = ${deal.guaranteeAmount}`,
      bonusesApplied: bonusResult.applied,
      bonusesNotTriggered: bonusResult.notTriggered,
    };
  }

  // ---------- percentage of gross ----------
  if (deal.dealType === "percentage_of_gross") {
    if (deal.percentage == null) {
      return {
        supported: false,
        reason: "Percentage-of-gross deal is missing a percentage.",
        dealType: deal.dealType,
      };
    }
    const payout = grossBoxOffice * deal.percentage;
    const bonusResult = applyBonuses(parseBonuses(deal), {
      gross: grossBoxOffice,
      tickets,
      capacity: venueCapacity,
    });

    return {
      supported: true,
      grossBoxOffice,
      netBoxOffice,
      totalExpenses,
      totalToArtist: payout + bonusResult.totalApplied,
      steps: [
        { label: "Gross box office", value: grossBoxOffice },
        {
          label: `× ${(deal.percentage * 100).toFixed(0)}%`,
          value: payout,
          note: "Percentage of gross — no expense deductions.",
        },
        ...bonusResult.applied.map((b) => ({
          label: b.label,
          value: b.amount,
          note: b.reason,
        })),
      ],
      finalFormula: bonusResult.applied.length
        ? `gross × ${deal.percentage} + bonuses = ${(payout + bonusResult.totalApplied).toFixed(2)}`
        : `gross × ${deal.percentage} = ${payout.toFixed(2)}`,
      bonusesApplied: bonusResult.applied,
      bonusesNotTriggered: bonusResult.notTriggered,
    };
  }

  // ---------- percentage of net ----------
  if (deal.dealType === "percentage_of_net") {
    if (deal.percentage == null) {
      return {
        supported: false,
        reason: "Percentage-of-net deal is missing a percentage.",
        dealType: deal.dealType,
      };
    }
    const { capped: cappedExpenses, note: expenseCapNote } = computeCappedExpenses(expenses, deal.expenseCap, deal.hospitalityCap);
    const netBoxOffice = grossBoxOffice - totalFees - cappedExpenses;
    const payout = Math.max(0, netBoxOffice) * deal.percentage;
    const bonusResult = applyBonuses(parseBonuses(deal), {
      gross: grossBoxOffice,
      tickets,
      capacity: venueCapacity,
    });

    const steps: { label: string; value: number; note?: string }[] = [
      { label: "Gross box office", value: grossBoxOffice },
      { label: "− Ticketing fees", value: -totalFees },
      { label: "− Approved expenses", value: -cappedExpenses, note: expenseCapNote },
      { label: "= Net box office", value: netBoxOffice },
      { label: `× ${(deal.percentage * 100).toFixed(0)}%`, value: payout },
      ...bonusResult.applied.map((b) => ({ label: b.label, value: b.amount, note: b.reason })),
    ];

    return {
      supported: true,
      grossBoxOffice,
      netBoxOffice,
      totalExpenses: cappedExpenses,
      totalToArtist: payout + bonusResult.totalApplied,
      steps,
      finalFormula: `(gross − fees − expenses) × ${deal.percentage} = ${payout.toFixed(2)}`,
      bonusesApplied: bonusResult.applied,
      bonusesNotTriggered: bonusResult.notTriggered,
    };
  }

  // ---------- vs deal (guarantee vs % of net, whichever is greater) ----------
  if (deal.dealType === "vs") {
    if (deal.guaranteeAmount == null || deal.percentage == null) {
      return {
        supported: false,
        reason: "Vs deal requires both a guarantee amount and a percentage.",
        dealType: deal.dealType,
      };
    }
    const { capped: cappedExpenses, note: expenseCapNote } = computeCappedExpenses(expenses, deal.expenseCap, deal.hospitalityCap);
    const netBoxOffice = grossBoxOffice - totalFees - cappedExpenses;
    const percentageSide = Math.max(0, netBoxOffice) * deal.percentage;
    const guaranteeSide = deal.guaranteeAmount;

    const parsedBonuses = parseBonuses(deal);
    const walkouts = getWalkoutCandidates(parsedBonuses, grossBoxOffice);
    const walkoutMax = walkouts.length > 0 ? Math.max(...walkouts.map((w) => w.value)) : 0;
    const baseAmount = Math.max(guaranteeSide, percentageSide, walkoutMax);

    const guaranteeWon = baseAmount === guaranteeSide && guaranteeSide >= percentageSide && guaranteeSide >= walkoutMax;
    const percentageWon = percentageSide > guaranteeSide && percentageSide >= walkoutMax;
    const walkoutWon = walkoutMax > guaranteeSide && walkoutMax > percentageSide;

    const regularBonuses = parsedBonuses.filter((b) => b.type !== "gross_percentage_above_threshold");
    const bonusResult = applyBonuses(regularBonuses, {
      gross: grossBoxOffice,
      tickets,
      capacity: venueCapacity,
    });

    const steps: { label: string; value: number; note?: string }[] = [
      { label: "Flat guarantee", value: guaranteeSide, note: guaranteeWon ? "Applied — highest option" : "Not applied" },
      { label: "Gross box office", value: grossBoxOffice },
      { label: "− Ticketing fees", value: -totalFees },
      { label: "− Approved expenses", value: -cappedExpenses, note: expenseCapNote },
      { label: "= Net box office", value: netBoxOffice },
      { label: `× ${(deal.percentage * 100).toFixed(0)}% of net`, value: percentageSide, note: percentageWon ? "Applied — highest option" : "Not applied" },
      ...walkouts.map((w) => ({
        label: w.label,
        value: w.value,
        note: `${(w.percentage * 100).toFixed(0)}% × ($${grossBoxOffice.toLocaleString()} − $${w.threshold.toLocaleString()})${walkoutWon && w.value === walkoutMax ? " · Applied — highest option" : " · Not applied"}`,
      })),
      { label: "= Artist base", value: baseAmount },
      ...bonusResult.applied.map((b) => ({ label: b.label, value: b.amount, note: b.reason })),
    ];

    return {
      supported: true,
      grossBoxOffice,
      netBoxOffice,
      totalExpenses: cappedExpenses,
      totalToArtist: baseAmount + bonusResult.totalApplied,
      steps,
      finalFormula: `max($${guaranteeSide.toLocaleString()} guarantee, net × ${deal.percentage}${walkouts.length ? ", walkout" : ""}) = ${baseAmount.toFixed(2)}`,
      bonusesApplied: bonusResult.applied,
      bonusesNotTriggered: bonusResult.notTriggered,
    };
  }

  // ---------- everything else: not supported ----------
  return {
    supported: false,
    dealType: deal.dealType,
    reason: "Door deals aren't supported in the in-app tool yet.",
  };
}

function computeCappedExpenses(
  expenses: Expense[],
  expenseCap: number | null | undefined,
  hospitalityCap: number | null | undefined,
): { capped: number; note: string | undefined } {
  const hospitality = expenses
    .filter(e => !e.absorbedByVenue && e.category === "hospitality")
    .reduce((s, e) => s + e.amount, 0);
  const other = expenses
    .filter(e => !e.absorbedByVenue && e.category !== "hospitality")
    .reduce((s, e) => s + e.amount, 0);

  const hospitalityPassed = hospitalityCap != null ? Math.min(hospitality, hospitalityCap) : hospitality;
  const subtotal = hospitalityPassed + other;
  const capped = expenseCap != null ? Math.min(subtotal, expenseCap) : subtotal;

  const parts: string[] = [];
  if (hospitalityCap != null && hospitality > hospitalityCap)
    parts.push(`hospitality $${hospitality.toLocaleString()} → capped at $${hospitalityCap.toLocaleString()}`);
  if (expenseCap != null && subtotal > expenseCap)
    parts.push(`total $${subtotal.toLocaleString()} → capped at $${expenseCap.toLocaleString()}`);

  return { capped, note: parts.length ? parts.join("; ") : undefined };
}

/** Evaluate a list of bonuses against the show's actual numbers. */
function applyBonuses(
  bonuses: Bonus[],
  ctx: { gross: number; tickets: number; capacity?: number },
) {
  const applied: { label: string; amount: number; reason: string }[] = [];
  const notTriggered: { label: string; amount: number; reason: string }[] = [];

  for (const b of bonuses) {
    if (b.type === "gross_threshold") {
      if (ctx.gross >= b.threshold) {
        applied.push({
          label: b.label,
          amount: b.amount,
          reason: `Gross ${ctx.gross.toLocaleString()} ≥ ${b.threshold.toLocaleString()}`,
        });
      } else {
        notTriggered.push({
          label: b.label,
          amount: b.amount,
          reason: `Gross ${ctx.gross.toLocaleString()} < ${b.threshold.toLocaleString()}`,
        });
      }
    } else if (b.type === "sellout") {
      if (ctx.capacity != null && ctx.tickets >= ctx.capacity * 0.95) {
        applied.push({
          label: b.label,
          amount: b.amount,
          reason: `${ctx.tickets} of ${ctx.capacity} sold`,
        });
      } else {
        notTriggered.push({
          label: b.label,
          amount: b.amount,
          reason:
            ctx.capacity != null
              ? `${ctx.tickets} of ${ctx.capacity} sold (sellout = ≥95%)`
              : `Capacity unknown — can't evaluate`,
        });
      }
    } else if (b.type === "attendance_threshold") {
      if (ctx.tickets >= b.threshold) {
        applied.push({
          label: b.label,
          amount: b.amount,
          reason: `${ctx.tickets} ≥ ${b.threshold}`,
        });
      } else {
        notTriggered.push({
          label: b.label,
          amount: b.amount,
          reason: `${ctx.tickets} < ${b.threshold}`,
        });
      }
    } else if (b.type === "gross_percentage_above_threshold") {
      // Handled as a vs-deal candidate, not an additive bonus — skip here.
    } else if (b.type === "tier_ratchet") {
      notTriggered.push({
        label: b.label,
        amount: 0,
        reason: "Tier ratchets need vs-deal or % of net support — not yet handled",
      });
    }
  }

  return {
    applied,
    notTriggered,
    totalApplied: applied.reduce((s, b) => s + b.amount, 0),
  };
}
