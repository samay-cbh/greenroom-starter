import type { Deal, Expense, TicketSale, Bonus } from "@/db/schema";

export type SettlementCalculation =
  | {
      supported: true;
      dealType: Deal["dealType"];
      grossBoxOffice: number;
      netBoxOffice: number;
      totalExpenses: number;
      totalToArtist: number;
      steps: { label: string; value: number; note?: string }[];
      finalFormula: string;
      bonusesApplied: { label: string; amount: number; reason: string }[];
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
  const rawExpenses = expenses
    .filter((e) => !e.absorbedByVenue)
    .reduce((sum, e) => sum + e.amount, 0);
  const totalExpenses =
    deal.expenseCap != null ? Math.min(rawExpenses, deal.expenseCap) : rawExpenses;

  const tickets =
    ticketsSold ?? ticketSales.reduce((sum, t) => sum + (t.qty ?? 0), 0);

  const bonuses = parseBonuses(deal);

  const bonusResult = applyBonuses(bonuses, {
    gross: grossBoxOffice,
    tickets,
    capacity: venueCapacity,
  });

  const steps: { label: string; value: number; note?: string }[] = [];
  let finalFormula = "";
  let basePayout = 0;

  // Helpers
  const addBonusSteps = () => {
    bonusResult.applied.forEach((b) => {
      steps.push({ label: b.label, value: b.amount, note: b.reason });
    });
  };

  // Determine effective percentage (handles tier_ratchet)
  let effectivePct = deal.percentage ?? 0;
  const ratchet = bonuses.find((b) => b.type === "tier_ratchet");
  if (ratchet && ratchet.type === "tier_ratchet") {
    let triggeredTier = null;
    for (const tier of ratchet.tiers) {
      // Is this tier based on gross or capacity?
      const isCapacityBased = tier.from <= 1 && (tier.to == null || tier.to <= 1);
      const metric = isCapacityBased ? tickets / Math.max(venueCapacity ?? 1, 1) : grossBoxOffice;

      if (metric >= tier.from && (tier.to == null || metric < tier.to)) {
        effectivePct = tier.percentage;
        triggeredTier = tier;
        break;
      }
    }
  }

  const formatPct = (p: number) => `${(p * 100).toFixed(0)}%`;

  switch (deal.dealType) {
    case "flat": {
      if (deal.guaranteeAmount == null) return unsupported("Flat deal missing guarantee amount.", deal.dealType);
      
      basePayout = deal.guaranteeAmount;
      steps.push({
        label: "Flat guarantee",
        value: basePayout,
        note: "Fixed floor. No expense deductions.",
      });
      addBonusSteps();
      
      finalFormula = `Flat ${deal.guaranteeAmount} + bonuses = ${(basePayout + bonusResult.totalApplied).toFixed(2)}`;
      break;
    }

    case "percentage_of_gross": {
      if (deal.percentage == null) return unsupported("Deal missing percentage.", deal.dealType);
      
      basePayout = grossBoxOffice * effectivePct;
      steps.push({ label: "Gross box office", value: grossBoxOffice });
      steps.push({
        label: `× ${formatPct(effectivePct)}`,
        value: basePayout,
        note: "Percentage of gross (no expense deductions)",
      });
      addBonusSteps();
      
      finalFormula = `Gross × ${effectivePct} + bonuses = ${(basePayout + bonusResult.totalApplied).toFixed(2)}`;
      break;
    }

    case "percentage_of_net": {
      if (deal.percentage == null) return unsupported("Deal missing percentage.", deal.dealType);
      
      const net = Math.max(0, netBoxOffice - totalExpenses);
      basePayout = net * effectivePct;
      
      steps.push({ label: "Net box office", value: netBoxOffice });
      steps.push({ label: "− Expenses", value: -totalExpenses });
      steps.push({
        label: `× ${formatPct(effectivePct)}`,
        value: basePayout,
        note: "Artist's share of net after expenses",
      });
      addBonusSteps();
      
      finalFormula = `Net × ${effectivePct} + bonuses = ${(basePayout + bonusResult.totalApplied).toFixed(2)}`;
      break;
    }

    case "door": {
      basePayout = Math.max(0, netBoxOffice - totalExpenses);
      steps.push({ label: "Net box office", value: netBoxOffice });
      steps.push({ label: "− Expenses", value: -totalExpenses, note: "Expenses deducted from door" });
      steps.push({ label: "Door payout", value: basePayout });
      addBonusSteps();
      
      finalFormula = `(Net − Expenses) + bonuses = ${(basePayout + bonusResult.totalApplied).toFixed(2)}`;
      break;
    }

    case "vs": {
      if (deal.guaranteeAmount == null || deal.percentage == null) {
        return unsupported("Vs deal missing guarantee or percentage.", deal.dealType);
      }

      const isGross = deal.percentageBasis === "gross";
      const baseForPct = isGross ? grossBoxOffice : Math.max(0, netBoxOffice - totalExpenses);
      const pctPayout = baseForPct * effectivePct;
      const goesIntoPct = pctPayout > deal.guaranteeAmount;
      
      basePayout = Math.max(deal.guaranteeAmount, pctPayout);
      
      steps.push({
        label: "Guarantee",
        value: deal.guaranteeAmount,
        note: goesIntoPct ? "Floor amount (exceeded)" : "Floor amount (applies)",
      });
      
      steps.push({
        label: `${formatPct(effectivePct)} of ${isGross ? "gross" : "net"}`,
        value: pctPayout,
        note: goesIntoPct ? "Percentage payout applies" : "Below guarantee threshold",
      });

      steps.push({
        label: "Vs deal winner",
        value: basePayout,
        note: goesIntoPct ? "Percentage is greater than guarantee" : "Guarantee is greater than percentage",
      });

      addBonusSteps();
      
      finalFormula = `max(${deal.guaranteeAmount}, ${formatPct(effectivePct)} of ${isGross ? "gross" : "net"}) + bonuses = ${(basePayout + bonusResult.totalApplied).toFixed(2)}`;
      break;
    }

    default:
      return unsupported(`Unknown deal type: ${deal.dealType}`, deal.dealType);
  }

  return {
    supported: true,
    dealType: deal.dealType,
    grossBoxOffice,
    netBoxOffice,
    totalExpenses,
    totalToArtist: basePayout + bonusResult.totalApplied,
    steps,
    finalFormula,
    bonusesApplied: bonusResult.applied,
    bonusesNotTriggered: bonusResult.notTriggered,
  };
}

function unsupported(reason: string, dealType: string): SettlementCalculation {
  return { supported: false, reason, dealType: dealType as Deal["dealType"] };
}

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
      if (ctx.capacity != null && ctx.capacity > 0 && (ctx.tickets / ctx.capacity) >= 0.95) {
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
            ctx.capacity != null && ctx.capacity > 0
              ? `${ctx.tickets} of ${ctx.capacity} sold (sellout = ≥95%)`
              : `Capacity unknown or zero — can't evaluate`,
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
      const isCapacityBased = b.tiers.some(t => t.from <= 1 && (t.to == null || t.to <= 1));
      const metric = isCapacityBased ? ctx.tickets / Math.max(ctx.capacity ?? 1, 1) : ctx.gross;
      
      const triggeredTier = b.tiers.find(t => metric >= t.from && (t.to == null || metric < t.to));
      
      if (triggeredTier) {
        applied.push({
          label: b.label,
          amount: 0,
          reason: `Ratchet active at ${(triggeredTier.percentage * 100).toFixed(0)}%`,
        });
      } else {
        notTriggered.push({
          label: b.label,
          amount: 0,
          reason: "Did not meet ratchet requirements",
        });
      }
    }
  }

  return {
    applied,
    notTriggered,
    totalApplied: applied.reduce((s, b) => s + b.amount, 0),
  };
}
