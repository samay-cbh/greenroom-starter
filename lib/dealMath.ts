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
import type { CalculationRecord, DealTermsV1 } from "@/lib/dealTerms";

/** Why settlement math did not run — drives settle-page messaging. */
export type SettlementBlocker =
  | "confirm_terms"
  | "terms_not_supported"
  | "missing_deal_field"
  | "unsupported_deal_type";

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
      // Populated only by the vs branch (F1). Flat / % of gross leave it
      // undefined so those paths remain byte-identical to their pre-F1 output.
      calculationRecord?: CalculationRecord;
    }
  | {
      supported: false;
      reason: string;
      dealType: Deal["dealType"];
      blocker: SettlementBlocker;
    };

interface CalcInput {
  deal: Deal;
  ticketSales: TicketSale[];
  expenses: Expense[];
  // Capacity is needed to evaluate sellout bonuses. Optional — if omitted,
  // sellout bonuses are reported as "can't determine".
  venueCapacity?: number;
  ticketsSold?: number;
  // F1: confirmed structured deal terms (F0 output, v1 schema). Required to
  // run the vs branch — if absent, vs deals return supported:false with a
  // "confirm terms first" reason. Existing flat / % of gross callers don't
  // pass this and are unaffected.
  confirmedTerms?: DealTermsV1;
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
  const { deal, ticketSales, expenses, venueCapacity, ticketsSold, confirmedTerms } = input;

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
        blocker: "missing_deal_field",
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
        blocker: "missing_deal_field",
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

  // ---------- vs deal (F1) ----------
  if (deal.dealType === "vs") {
    if (!confirmedTerms) {
      return {
        supported: false,
        reason: "Confirm deal terms first.",
        dealType: "vs",
        blocker: "confirm_terms",
      };
    }
    return calculateVsDeal({
      confirmedTerms,
      grossBoxOffice,
      totalFees,
      expenses,
    });
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
    blocker: "unsupported_deal_type",
    reason:
      `${friendlyName[deal.dealType]} deals aren't supported in the in-app tool yet. ` +
      `Power users at venues like The Crescent default to spreadsheets for these.`,
  };
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
      // Tier ratchets fundamentally change the percentage structure. The
      // current engine only supports flat % of gross — we can't apply a
      // ratcheting structure on top of it without knowing which deal type
      // it's modifying. Report as not-applicable.
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

/**
 * vs deal calculation (PRD F1) on Deal Terms Schema v1.
 *
 *   Gross
 *   − CC + platform fees                       (off gross)
 *   − Pre-cap deductions                       (deductions where cap_scope = outside_cap)
 *   − MIN(non-absorbed expenses + in-cap deductions, expense_cap.cap_amount)
 *   = Net                                      (in-cap deductions = cap_scope = inside_cap)
 *
 *   Artist share  = round(artist_percent × Net)
 *   Artist payout = MAX(guarantee_amount, Artist share) + triggered bonuses
 *
 * Deductions are sorted by `ordering_priority` ascending before routing to
 * pre-cap or in-cap buckets. Worksheet rows preserve that order so the
 * audit trail matches what was confirmed.
 *
 * v1 prototype constraints (any violation → supported:false, fail loud):
 *  - Every deduction must have `basis === "gross"`. Net-basis deductions are
 *    not implemented in this slice.
 *
 * Rounding: round-to-cents on multiplication results (`Math.round(x*100)/100`).
 * PRD §13 lists rounding as an open question — Mariana's spreadsheet
 * convention is TBD. Placeholder until that data pull lands.
 *
 * Expense cap: when `expense_cap.exists === false` or `cap_amount == null`,
 * raw non-absorbed expenses + in-cap deductions are deducted as-is.
 *
 * Bonuses: `terms.bonus_tiers` (gross-threshold semantics) only.
 * `deal.bonusesJson` is intentionally ignored for vs deals — bonus tiers for
 * vs deals are sourced from F0's confirmed terms. v1 only evaluates
 * `basis === "gross"` tiers; net-basis tiers are reported as not-triggered
 * with a "not yet supported" reason.
 *
 * Bonus amount: prefers `flat_amount` when set, falls back to
 * `percent_above_threshold * (gross - threshold_amount)`. Coastal uses flat.
 */
function calculateVsDeal(params: {
  confirmedTerms: DealTermsV1;
  grossBoxOffice: number;
  totalFees: number;
  expenses: Expense[];
}): SettlementCalculation {
  const { confirmedTerms: terms, grossBoxOffice, totalFees, expenses } = params;

  const round = (n: number) => Math.round(n * 100) / 100;

  // why: sort once, then route. The worksheet uses this same order so the
  // audit trail mirrors what was confirmed.
  const sortedDeductions = [...terms.deductions].sort(
    (a, b) => a.ordering_priority - b.ordering_priority,
  );

  // Fail loud on any net-basis deduction — v1 only models gross.
  const badBasis = sortedDeductions.find((d) => d.basis !== "gross");
  if (badBasis) {
    return {
      supported: false,
      dealType: "vs",
      blocker: "terms_not_supported",
      reason: `Deduction "${badBasis.label}" has basis "${badBasis.basis}" — v1 only supports gross-basis deductions.`,
    };
  }

  const preCapDeductionRows = sortedDeductions.filter(
    (d) => d.cap_scope === "outside_cap",
  );
  const inCapDeductionRows = sortedDeductions.filter(
    (d) => d.cap_scope === "inside_cap",
  );
  const preCapDeductionsSum = preCapDeductionRows.reduce(
    (s, d) => s + d.amount,
    0,
  );
  const inCapDeductionsSum = inCapDeductionRows.reduce(
    (s, d) => s + d.amount,
    0,
  );

  const nonAbsorbedExpensesSum = expenses
    .filter((e) => !e.absorbedByVenue)
    .reduce((s, e) => s + e.amount, 0);

  const inCapBucket = nonAbsorbedExpensesSum + inCapDeductionsSum;
  const capActive =
    terms.expense_cap.exists && terms.expense_cap.cap_amount != null;
  const capAmount = capActive ? (terms.expense_cap.cap_amount as number) : null;
  const cappedExpenses =
    capAmount != null ? Math.min(inCapBucket, capAmount) : inCapBucket;
  const capSavings = inCapBucket - cappedExpenses; // ≥ 0

  const netBoxOffice =
    grossBoxOffice - totalFees - preCapDeductionsSum - cappedExpenses;
  const artistShare = round(terms.artist_percent * netBoxOffice);

  const guaranteeWins = terms.guarantee_amount > artistShare;
  const winnerAmount = guaranteeWins ? terms.guarantee_amount : artistShare;

  // Bonus tiers evaluated against final gross. Mirrors applyBonuses() reason
  // formatting so the settle page renders consistently across deal types.
  const bonusesApplied: { label: string; amount: number; reason: string }[] = [];
  const bonusesNotTriggered: { label: string; amount: number; reason: string }[] = [];
  for (const tier of terms.bonus_tiers) {
    const tierLabel =
      tier.label ??
      `Bonus over $${tier.threshold_amount.toLocaleString()} ${tier.basis}`;
    if (tier.basis !== "gross") {
      // why: v1 only evaluates gross-basis bonuses. Net-basis would require
      // post-net evaluation; deferred.
      bonusesNotTriggered.push({
        label: tierLabel,
        amount: tier.flat_amount ?? 0,
        reason: `basis "${tier.basis}" not yet supported in v1`,
      });
      continue;
    }
    // why: prefer flat_amount when set; percent_above_threshold is only used
    // for tiers without a flat amount. Coastal uses flat.
    const amount =
      tier.flat_amount != null
        ? tier.flat_amount
        : round(
            tier.percent_above_threshold *
              Math.max(0, grossBoxOffice - tier.threshold_amount),
          );
    if (grossBoxOffice >= tier.threshold_amount) {
      bonusesApplied.push({
        label: tierLabel,
        amount,
        reason: `Gross ${grossBoxOffice.toLocaleString()} ≥ ${tier.threshold_amount.toLocaleString()}`,
      });
    } else {
      bonusesNotTriggered.push({
        label: tierLabel,
        amount,
        reason: `Gross ${grossBoxOffice.toLocaleString()} < ${tier.threshold_amount.toLocaleString()}`,
      });
    }
  }
  const totalBonuses = bonusesApplied.reduce((s, b) => s + b.amount, 0);
  const totalToArtist = winnerAmount + totalBonuses;

  // Build the auditable record. Every step in the formula becomes one row.
  // why: `running` tracks the live balance through the deduction phase so
  // each row can carry where the math sits after applying it. Snapshot rows
  // (Net, artist share, guarantee comparison, bonuses) leave runningBalance
  // undefined since they're values rather than deltas.
  const recordSteps: CalculationRecord["steps"] = [];
  const fmt = (n: number) => n.toFixed(2);
  let running = grossBoxOffice;
  recordSteps.push({
    label: "Gross box office",
    amount: grossBoxOffice,
    source: "computed",
    runningBalance: running,
  });
  running -= totalFees;
  recordSteps.push({
    label: "CC + platform fees",
    amount: -totalFees,
    source: "pos",
    runningBalance: running,
  });
  for (const d of preCapDeductionRows) {
    running -= d.amount;
    recordSteps.push({
      label: `${d.label} (pre-cap)`,
      amount: -d.amount,
      source: "deal-term",
      runningBalance: running,
      capStatus: "pre_cap",
    });
  }
  for (const e of expenses) {
    if (e.absorbedByVenue) {
      recordSteps.push({
        label: `Expense: ${e.category}`,
        amount: 0,
        source: "absorbed",
        note: e.description ?? "Absorbed by venue — not deducted",
        runningBalance: running,
        capStatus: "absorbed",
      });
    } else {
      running -= e.amount;
      recordSteps.push({
        label: `Expense: ${e.category}`,
        amount: -e.amount,
        source: "manual",
        note: e.description ?? undefined,
        runningBalance: running,
        capStatus: capActive ? "in_cap" : undefined,
      });
    }
  }
  for (const d of inCapDeductionRows) {
    running -= d.amount;
    recordSteps.push({
      label: `${d.label} (in-cap)`,
      amount: -d.amount,
      source: "deal-term",
      runningBalance: running,
      capStatus: capActive ? "in_cap" : undefined,
    });
  }
  // why: when a cap exists, surface the bucket value before the cap is
  // applied (transparency #10) and then ALWAYS emit a cap row — even when
  // savings == 0. This is what makes the cap operation visible at boundary
  // cases like Coastal Spell (expenses + recoup = cap), where the old
  // engine silently skipped the cap row and a reader couldn't tell whether
  // the cap had been considered.
  if (capActive && capAmount != null) {
    recordSteps.push({
      label: "In-cap bucket subtotal",
      amount: inCapBucket,
      source: "computed",
      note: `expenses ${fmt(nonAbsorbedExpensesSum)} + in-cap deductions ${fmt(inCapDeductionsSum)} = ${fmt(inCapBucket)}`,
    });
    if (capSavings > 0) {
      running += capSavings;
      recordSteps.push({
        label: "Expense cap applied",
        amount: capSavings,
        source: "deal-term",
        note: `MIN(bucket ${fmt(inCapBucket)}, cap ${fmt(capAmount)}) — cap saved ${fmt(capSavings)}`,
        runningBalance: running,
        capStatus: "cap_binding",
      });
    } else if (inCapBucket === capAmount) {
      recordSteps.push({
        label: "Expense cap (at boundary)",
        amount: 0,
        source: "deal-term",
        note: `Bucket ${fmt(inCapBucket)} equals cap ${fmt(capAmount)} — both recoup readings collapse here.`,
        runningBalance: running,
        capStatus: "cap_at",
      });
    } else {
      recordSteps.push({
        label: "Expense cap (within cap)",
        amount: 0,
        source: "deal-term",
        note: `Bucket ${fmt(inCapBucket)} < cap ${fmt(capAmount)} — cap doesn't bind.`,
        runningBalance: running,
        capStatus: "cap_within",
      });
    }
  }
  recordSteps.push({
    label: "Net box office",
    amount: netBoxOffice,
    source: "computed",
  });
  recordSteps.push({
    label: `× ${(terms.artist_percent * 100).toFixed(0)}% (artist share)`,
    amount: artistShare,
    source: "computed",
  });
  recordSteps.push({
    label: guaranteeWins ? "Guarantee (floor wins)" : "Artist share (above guarantee)",
    amount: winnerAmount,
    source: "deal-term",
    note: `MAX(guarantee ${terms.guarantee_amount.toFixed(2)}, share ${artistShare.toFixed(2)})`,
  });
  for (const b of bonusesApplied) {
    recordSteps.push({
      label: b.label,
      amount: b.amount,
      source: "deal-term",
      note: b.reason,
    });
  }

  const calculationRecord: CalculationRecord = {
    version: 1,
    calculatedAt: new Date().toISOString(),
    termsSnapshot: terms,
    inputs: {
      grossBoxOffice,
      fees: totalFees,
      expenses: expenses.map((e) => ({
        id: e.id,
        label: e.description ?? e.category,
        amount: e.amount,
        absorbedByVenue: e.absorbedByVenue,
        source: e.absorbedByVenue ? "absorbed" : "manual",
      })),
    },
    steps: recordSteps,
    netBoxOffice,
    artistShare,
    guaranteeComparison: {
      guarantee: terms.guarantee_amount,
      artistShare,
      winner: guaranteeWins ? "guarantee" : "artist_share",
    },
    bonusesApplied,
    bonusesNotTriggered,
    totalToArtist,
  };

  // Legacy `steps` array for the existing settle page (kept render-compatible).
  const legacySteps = recordSteps.map((s) => ({
    label: s.label,
    value: s.amount,
    note: s.note,
  }));

  return {
    supported: true,
    grossBoxOffice,
    netBoxOffice,
    totalExpenses: nonAbsorbedExpensesSum,
    totalToArtist,
    steps: legacySteps,
    finalFormula: bonusesApplied.length
      ? `MAX(guarantee ${terms.guarantee_amount}, ${(terms.artist_percent * 100).toFixed(0)}% × net ${netBoxOffice.toFixed(2)}) + bonuses ${totalBonuses} = ${totalToArtist.toFixed(2)}`
      : `MAX(guarantee ${terms.guarantee_amount}, ${(terms.artist_percent * 100).toFixed(0)}% × net ${netBoxOffice.toFixed(2)}) = ${winnerAmount.toFixed(2)}`,
    bonusesApplied,
    bonusesNotTriggered,
    calculationRecord,
  };
}

