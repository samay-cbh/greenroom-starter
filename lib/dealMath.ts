/**
 * Deal calculation logic for the in-app settlement tool.
 *
 * Supported deal types:
 *   1. flat                 — $X guaranteed, optional bonuses
 *   2. percentage_of_gross  — X% of gross, no expense deductions
 *   3. percentage_of_net    — X% of net after expenses, optional guarantee floor
 *   4. vs                   — max(guarantee, X% of net), full expense cap logic
 *
 * Not yet supported:
 *   - door deals
 *   - tier ratchets (applyBonuses handles them gracefully but doesn't calculate)
 *   - comps that count toward gross
 *   - recoups (flow separately through the settlement record)
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
    calculationTrace: { field: string; quote: string }[];
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

  const shadow = deal.shadowDealJson ? JSON.parse(deal.shadowDealJson) : null;
  const trace: { field: string; quote: string }[] = shadow?.justifications || [];

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
      calculationTrace: trace,
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
      calculationTrace: trace,
      bonusesApplied: bonusResult.applied,
      bonusesNotTriggered: bonusResult.notTriggered,
    };
  }

  // ---------- vs deal (guarantee vs % of net, artist gets the greater) ----------
  if (deal.dealType === "vs") {
    if (deal.guaranteeAmount == null || deal.percentage == null) {
      return {
        supported: false,
        reason: "Vs deal is missing a guarantee amount or percentage.",
        dealType: deal.dealType,
      };
    }

    const { cappedExpenses, steps: expenseSteps } = applyExpenseCaps(
      expenses,
      deal.expenseCap ?? null,
      deal.hospitalityCap ?? null,
      deal.hospitalityBasis ?? null,
    );

    const netAfterExpenses = netBoxOffice - cappedExpenses;
    const percentagePayout = Math.max(0, netAfterExpenses) * deal.percentage;
    const guarantee = deal.guaranteeAmount;
    const artistShare = Math.max(guarantee, percentagePayout);
    const vsWon = percentagePayout > guarantee;

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
      totalToArtist: artistShare + bonusResult.totalApplied,
      steps: [
        { label: "Gross box office", value: grossBoxOffice },
        { label: "Less service fees", value: -totalFees },
        { label: "Net box office", value: netBoxOffice },
        ...expenseSteps,
        { label: "Net after expenses", value: netAfterExpenses },
        {
          label: vsWon
            ? `Artist share — ${(deal.percentage * 100).toFixed(0)}% of net (% wins)`
            : `Artist share — guarantee wins`,
          value: artistShare,
          note: vsWon
            ? `${(deal.percentage * 100).toFixed(0)}% of net $${netAfterExpenses.toLocaleString(undefined, { maximumFractionDigits: 0 })} = $${percentagePayout.toLocaleString(undefined, { maximumFractionDigits: 0 })} > $${guarantee.toLocaleString()} guarantee`
            : `$${guarantee.toLocaleString()} guarantee > ${(deal.percentage * 100).toFixed(0)}% of net ($${percentagePayout.toLocaleString(undefined, { maximumFractionDigits: 0 })}) — below breakeven`,
        },
        ...bonusResult.applied.map((b) => ({
          label: b.label,
          value: b.amount,
          note: b.reason,
        })),
      ],
      finalFormula: vsWon
        ? `max(${guarantee}, net × ${deal.percentage}) = ${artistShare.toFixed(2)} (% wins)`
        : `max(${guarantee}, net × ${deal.percentage}) = ${artistShare.toFixed(2)} (guarantee wins)`,
      calculationTrace: trace,
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

    const { cappedExpenses, steps: expenseSteps } = applyExpenseCaps(
      expenses,
      deal.expenseCap ?? null,
      deal.hospitalityCap ?? null,
      deal.hospitalityBasis ?? null,
    );

    const netAfterExpenses = netBoxOffice - cappedExpenses;
    const payout = Math.max(0, netAfterExpenses) * deal.percentage;

    const bonusResult = applyBonuses(parseBonuses(deal), {
      gross: grossBoxOffice,
      tickets,
      capacity: venueCapacity,
    });

    // If there's also a guarantee, treat it as a floor (the field may be set
    // even on percentage_of_net deals as a minimum payment).
    const guarantee = deal.guaranteeAmount ?? 0;
    const artistShare = Math.max(guarantee, payout);

    return {
      supported: true,
      grossBoxOffice,
      netBoxOffice,
      totalExpenses,
      totalToArtist: artistShare + bonusResult.totalApplied,
      steps: [
        { label: "Gross box office", value: grossBoxOffice },
        { label: "Less service fees", value: -totalFees },
        { label: "Net box office", value: netBoxOffice },
        ...expenseSteps,
        { label: "Net after expenses", value: netAfterExpenses },
        {
          label: `${(deal.percentage * 100).toFixed(0)}% of net`,
          value: payout,
        },
        ...(guarantee > 0 && guarantee > payout
          ? [{ label: "Guarantee floor applied", value: guarantee - payout, note: "Net % fell below guarantee" }]
          : []),
        ...bonusResult.applied.map((b) => ({
          label: b.label,
          value: b.amount,
          note: b.reason,
        })),
      ],
      finalFormula: guarantee > 0
        ? `max(${guarantee}, net × ${deal.percentage}) = ${artistShare.toFixed(2)}`
        : `net × ${deal.percentage} = ${payout.toFixed(2)}`,
      calculationTrace: trace,
      bonusesApplied: bonusResult.applied,
      bonusesNotTriggered: bonusResult.notTriggered,
    };
  }

  // ---------- everything else: not supported ----------
  const friendlyName: Record<Deal["dealType"], string> = {
    flat: "Flat guarantee",
    percentage_of_gross: "Percentage of gross",
    percentage_of_net: "Percentage of net",
    vs: "Vs deal (guarantee vs %)",
    door: "Door deal",
  };

  return {
    supported: false,
    dealType: deal.dealType,
    reason:
      `${friendlyName[deal.dealType]} deals aren't supported in the in-app tool yet. ` +
      `Power users at venues like The Crescent default to spreadsheets for these.`,
  };
}

/**
 * Apply expense caps and return individual deduction steps.
 *
 * Hospitality is always shown as its own line so the settlement preview is
 * transparent. hospitalityBasis controls whether it is counted inside the
 * expense cap ceiling ("inside_cap", default) or deducted separately before
 * the cap is applied ("outside_cap").
 */
function applyExpenseCaps(
  expenses: Expense[],
  expenseCap: number | null,
  hospitalityCap: number | null,
  hospitalityBasis: "inside_cap" | "outside_cap" | null,
): { cappedExpenses: number; steps: { label: string; value: number; note?: string }[] } {
  const passedThrough = expenses.filter((e) => !e.absorbedByVenue);

  const hospitalityRaw = passedThrough
    .filter((e) => e.category === "hospitality")
    .reduce((s, e) => s + e.amount, 0);
  const nonHospitalityRaw = passedThrough
    .filter((e) => e.category !== "hospitality")
    .reduce((s, e) => s + e.amount, 0);

  const hospitalityCapped =
    hospitalityCap != null ? Math.min(hospitalityRaw, hospitalityCap) : hospitalityRaw;

  const steps: { label: string; value: number; note?: string }[] = [];

  if (hospitalityBasis === "outside_cap") {
    // Hospitality is a pre-cap deduction; expense cap applies only to non-hospitality
    const otherCapped =
      expenseCap != null ? Math.min(nonHospitalityRaw, expenseCap) : nonHospitalityRaw;

    if (nonHospitalityRaw > 0) {
      const note =
        expenseCap != null && nonHospitalityRaw > expenseCap
          ? `expense cap $${expenseCap.toLocaleString()} applied`
          : undefined;
      steps.push({ label: "Less expenses", value: -otherCapped, note });
    }
    if (hospitalityRaw > 0) {
      const note =
        hospitalityCap != null && hospitalityRaw > hospitalityCap
          ? `capped at $${hospitalityCap.toLocaleString()} ($${hospitalityRaw.toLocaleString()} actual)`
          : undefined;
      steps.push({ label: "Less hospitality (outside cap)", value: -hospitalityCapped, note });
    }

    return { cappedExpenses: otherCapped + hospitalityCapped, steps };
  }

  // Default: inside_cap — hospitality counted within the overall expense cap
  const subtotal = nonHospitalityRaw + hospitalityCapped;
  const totalCapped = expenseCap != null ? Math.min(subtotal, expenseCap) : subtotal;
  const capSaving = subtotal - totalCapped;

  if (nonHospitalityRaw > 0) {
    steps.push({ label: "Less expenses", value: -nonHospitalityRaw });
  }
  if (hospitalityRaw > 0) {
    const note =
      hospitalityCap != null && hospitalityRaw > hospitalityCap
        ? `capped at $${hospitalityCap.toLocaleString()} ($${hospitalityRaw.toLocaleString()} actual)`
        : undefined;
    steps.push({ label: "Less hospitality", value: -hospitalityCapped, note });
  }
  // If the overall cap saves money, surface that as a positive line
  if (capSaving > 0) {
    steps.push({
      label: "Expense cap saving",
      value: capSaving,
      note: `Cap $${expenseCap!.toLocaleString()} — $${capSaving.toLocaleString()} returned to artist`,
    });
  }

  return { cappedExpenses: totalCapped, steps };
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
    } else if (b.type === "tier_ratchet") {
      // Tier ratchets change the percentage dynamically based on sell-through —
      // they need bespoke math per deal. Report as not calculated for now.
      notTriggered.push({
        label: b.label,
        amount: 0,
        reason: "Tier ratchet — not yet calculated by the engine",
      });
    }
  }

  return {
    applied,
    notTriggered,
    totalApplied: applied.reduce((s, b) => s + b.amount, 0),
  };
}
