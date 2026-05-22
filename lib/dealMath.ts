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
import type { DealBrief, BriefBonus, BriefRecoup } from "@/lib/dealBrief";

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

// ========================================================================
// Brief-backed calculator. Used when a confirmed DealBrief exists for the
// show — handles vs (all four flavors), percentage_of_net, and door deals
// that the legacy calculator returns "unsupported" for. Every step carries
// a citation back to the brief clause it derives from, so the settle page
// can render hover-to-source UX.
//
// Legacy `calculateSettlement(deal)` above is untouched. The settle page
// calls `calculateSettlementFromBrief()` only when the brief is confirmed.
// ========================================================================

export type BriefCitation = {
  source:
    | "brief_field"
    | "brief_recoup"
    | "brief_bonus"
    | "expense"
    | "ticket_sales"
    | "computed";
  /** Human-readable label shown in the hover. */
  label: string;
  /** Optional supporting detail (e.g. "Source: 'vs 80% of net'"). */
  detail?: string;
};

export type BriefStep = {
  label: string;
  value: number;
  note?: string;
  citation?: BriefCitation;
};

export type BriefCalculation =
  | {
      supported: true;
      grossBoxOffice: number;
      netBoxOffice: number;
      totalExpenses: number;
      recoupsTotal: number;
      totalToArtist: number;
      steps: BriefStep[];
      finalFormula: string;
      bonusesApplied: { label: string; amount: number; reason: string }[];
      bonusesNotTriggered: { label: string; amount: number; reason: string }[];
      /** Which deal flavor was applied — drives the per-line UI labels. */
      pathTaken:
        | "flat"
        | "percentage_of_gross"
        | "percentage_of_net"
        | "vs_standard"
        | "vs_walkout"
        | "vs_ratchet"
        | "vs_gross"
        | "door";
    }
  | {
      supported: false;
      reason: string;
    };

interface BriefCalcInput {
  brief: DealBrief;
  ticketSales: TicketSale[];
  expenses: Expense[];
  venueCapacity?: number;
  ticketsSold?: number;
}

export function calculateSettlementFromBrief(
  input: BriefCalcInput,
): BriefCalculation {
  const { brief, ticketSales, expenses, venueCapacity, ticketsSold } = input;

  const gross = ticketSales.reduce((s, t) => s + t.gross, 0);
  const fees = ticketSales.reduce((s, t) => s + t.fees, 0);
  const net = gross - fees;
  const passThru = expenses
    .filter((e) => !e.absorbedByVenue)
    .reduce((s, e) => s + e.amount, 0);
  const tickets =
    ticketsSold ?? ticketSales.reduce((s, t) => s + (t.qty ?? 0), 0);

  // Recoups split by placement — the Coastal Spell field made first-class.
  const recoupsOutsideCap = brief.recoups
    .filter((r) => r.placement === "outside_cap")
    .reduce((s, r) => s + r.amount, 0);
  const recoupsInsideCap = brief.recoups
    .filter((r) => r.placement === "inside_cap")
    .reduce((s, r) => s + r.amount, 0);
  const recoupsTotal = recoupsOutsideCap + recoupsInsideCap;

  // ---------- Flat ----------
  if (brief.dealType === "flat") {
    const guarantee = brief.guaranteeAmount ?? 0;
    const bonusResult = applyBriefBonuses(brief.bonuses, {
      gross,
      tickets,
      capacity: venueCapacity,
    });
    const steps: BriefStep[] = [
      {
        label: "Flat guarantee",
        value: guarantee,
        citation: {
          source: "brief_field",
          label: "brief.guaranteeAmount",
          detail: `$${guarantee.toLocaleString()} from the confirmed brief`,
        },
      },
      ...bonusResult.applied.map((b) => ({
        label: b.label,
        value: b.amount,
        note: b.reason,
        citation: {
          source: "brief_bonus" as const,
          label: "brief.bonuses",
          detail: b.reason,
        },
      })),
    ];
    return {
      supported: true,
      grossBoxOffice: gross,
      netBoxOffice: net,
      totalExpenses: passThru,
      recoupsTotal,
      totalToArtist: guarantee + bonusResult.totalApplied,
      steps,
      finalFormula: bonusResult.applied.length
        ? `flat ${guarantee} + bonuses ${bonusResult.totalApplied}`
        : `flat ${guarantee}`,
      bonusesApplied: bonusResult.applied,
      bonusesNotTriggered: bonusResult.notTriggered,
      pathTaken: "flat",
    };
  }

  // ---------- Percentage of gross ----------
  if (brief.dealType === "percentage_of_gross") {
    const pct = brief.percentage ?? 0;
    const payout = gross * pct;
    const bonusResult = applyBriefBonuses(brief.bonuses, {
      gross,
      tickets,
      capacity: venueCapacity,
    });
    return {
      supported: true,
      grossBoxOffice: gross,
      netBoxOffice: net,
      totalExpenses: passThru,
      recoupsTotal,
      totalToArtist: payout + bonusResult.totalApplied,
      steps: [
        {
          label: "Gross box office",
          value: gross,
          citation: { source: "ticket_sales", label: "ticket_sales.gross" },
        },
        {
          label: `× ${(pct * 100).toFixed(0)}% of gross`,
          value: payout,
          note: "No expense deductions.",
          citation: {
            source: "brief_field",
            label: "brief.percentage / brief.percentageBasis",
            detail: `${(pct * 100).toFixed(0)}% × gross from the confirmed brief`,
          },
        },
        ...bonusResult.applied.map((b) => ({
          label: b.label,
          value: b.amount,
          note: b.reason,
          citation: {
            source: "brief_bonus" as const,
            label: "brief.bonuses",
            detail: b.reason,
          },
        })),
      ],
      finalFormula: `gross ${gross} × ${pct} = ${payout.toFixed(2)}`,
      bonusesApplied: bonusResult.applied,
      bonusesNotTriggered: bonusResult.notTriggered,
      pathTaken: "percentage_of_gross",
    };
  }

  // ---------- Door deal ----------
  if (brief.dealType === "door") {
    const cap = brief.expenseCap ?? Infinity;
    const cappedExpenses = Math.min(passThru, cap);
    const payout = Math.max(0, gross - cappedExpenses - recoupsTotal);
    const steps: BriefStep[] = [
      {
        label: "Gross box office",
        value: gross,
        citation: { source: "ticket_sales", label: "ticket_sales.gross" },
      },
      {
        label: `− Expenses (capped at $${brief.expenseCap?.toLocaleString() ?? "—"})`,
        value: -cappedExpenses,
        citation: {
          source: "expense",
          label: "expenses (passed through)",
          detail: `actual $${passThru.toLocaleString()}, cap $${brief.expenseCap?.toLocaleString() ?? "∞"}`,
        },
      },
      ...(recoupsTotal > 0
        ? [
            {
              label: "− Recoups",
              value: -recoupsTotal,
              citation: {
                source: "brief_recoup" as const,
                label: "brief.recoups",
              },
            },
          ]
        : []),
    ];
    return {
      supported: true,
      grossBoxOffice: gross,
      netBoxOffice: net,
      totalExpenses: passThru,
      recoupsTotal,
      totalToArtist: payout,
      steps,
      finalFormula: `gross ${gross} − expenses ${cappedExpenses} − recoups ${recoupsTotal}`,
      bonusesApplied: [],
      bonusesNotTriggered: [],
      pathTaken: "door",
    };
  }

  // ---------- Vs deal (the big one — four flavors) ----------
  // Inside-cap recoups compete with passThru expenses against the cap.
  // Outside-cap recoups come off gross before share math.
  if (brief.dealType === "vs" || brief.dealType === "percentage_of_net") {
    const pct = brief.percentage ?? 0;
    const guarantee = brief.dealType === "vs" ? (brief.guaranteeAmount ?? 0) : 0;
    const cap = brief.expenseCap ?? Infinity;
    const flavor = brief.vsFlavor ?? "standard";

    // vs_gross flavor: no expense deductions at all.
    if (brief.dealType === "vs" && flavor === "vs_gross") {
      const pctPayout = gross * pct;
      const base = Math.max(guarantee, pctPayout);
      const bonusResult = applyBriefBonuses(brief.bonuses, {
        gross,
        tickets,
        capacity: venueCapacity,
      });
      const overrideGuarantee = pctPayout >= guarantee;
      const steps: BriefStep[] = [
        {
          label: "Gross box office",
          value: gross,
          citation: { source: "ticket_sales", label: "ticket_sales.gross" },
        },
        {
          label: `${(pct * 100).toFixed(0)}% of gross`,
          value: pctPayout,
          note: "Vs flavor: vs_gross — no expense deductions.",
          citation: {
            source: "brief_field",
            label: "brief.percentage (vs gross)",
          },
        },
        {
          label: `Guarantee ($${guarantee.toLocaleString()})`,
          value: guarantee,
          citation: { source: "brief_field", label: "brief.guaranteeAmount" },
        },
        {
          label: overrideGuarantee
            ? "Greater: take the percentage"
            : "Greater: take the guarantee",
          value: base,
          citation: { source: "computed", label: "max(guarantee, pct × gross)" },
        },
        ...bonusResult.applied.map((b) => ({
          label: b.label,
          value: b.amount,
          note: b.reason,
          citation: {
            source: "brief_bonus" as const,
            label: "brief.bonuses",
            detail: b.reason,
          },
        })),
      ];
      return {
        supported: true,
        grossBoxOffice: gross,
        netBoxOffice: net,
        totalExpenses: passThru,
        recoupsTotal,
        totalToArtist: base + (overrideGuarantee ? bonusResult.totalApplied : 0),
        steps,
        finalFormula: `max(${guarantee}, ${gross}×${pct}) = ${base.toFixed(2)}`,
        bonusesApplied: bonusResult.applied,
        bonusesNotTriggered: bonusResult.notTriggered,
        pathTaken: "vs_gross",
      };
    }

    // Standard / walkout / ratchet (and percentage_of_net) all share the
    // same skeleton: net − recoups_outside − capped(expenses + recoups_inside),
    // then percentage applied, then max against guarantee.
    const insideCapBucket = passThru + recoupsInsideCap;
    const cappedDeductible = Math.min(cap, insideCapBucket);
    const netForShare = Math.max(0, net - recoupsOutsideCap - cappedDeductible);

    // Ratchet: percentage escalates over a sell-through tier.
    let effectivePct = pct;
    let ratchetNote: string | null = null;
    if (flavor === "ratchet") {
      const ratchet = brief.bonuses.find((b) => b.type === "tier_ratchet");
      if (ratchet && ratchet.type === "tier_ratchet" && venueCapacity) {
        const sellThrough = tickets / venueCapacity;
        // Find the tier that contains the current sell-through.
        const tier = ratchet.tiers.find(
          (t) => sellThrough >= t.from && (t.to == null || sellThrough < t.to),
        );
        if (tier) {
          effectivePct = tier.percentage;
          ratchetNote = `Sell-through ${(sellThrough * 100).toFixed(0)}% → tier ${(tier.percentage * 100).toFixed(0)}%`;
        }
      }
    }

    const pctPayout = netForShare * effectivePct;
    const base = Math.max(guarantee, pctPayout);
    const overrideGuarantee = pctPayout >= guarantee;

    const bonusResult = applyBriefBonuses(brief.bonuses, {
      gross,
      tickets,
      capacity: venueCapacity,
    });

    // Walkout pot — 100% of gross above the breakeven. Only triggers if
    // pctPayout already cleared the guarantee.
    let walkoutBonus = 0;
    let walkoutCitation: BriefStep | null = null;
    if (flavor === "walkout" && overrideGuarantee) {
      const walkout = brief.bonuses.find((b) => b.type === "walkout_pot");
      if (walkout && walkout.type === "walkout_pot") {
        const above = Math.max(0, gross - walkout.breakeven);
        walkoutBonus = above * walkout.sharePctAbove;
        if (walkoutBonus > 0) {
          walkoutCitation = {
            label: walkout.label,
            value: walkoutBonus,
            note: `Gross ${gross.toLocaleString()} − breakeven ${walkout.breakeven.toLocaleString()} = ${above.toLocaleString()} × ${(walkout.sharePctAbove * 100).toFixed(0)}%`,
            citation: {
              source: "brief_bonus",
              label: "brief.bonuses (walkout_pot)",
            },
          };
        }
      }
    }

    const totalToArtist =
      base +
      walkoutBonus +
      (overrideGuarantee ? bonusResult.totalApplied : 0);

    const steps: BriefStep[] = [
      {
        label: "Gross box office",
        value: gross,
        citation: { source: "ticket_sales", label: "ticket_sales.gross" },
      },
      {
        label: "− Fees",
        value: -fees,
        citation: { source: "ticket_sales", label: "ticket_sales.fees" },
      },
      ...(recoupsOutsideCap > 0
        ? [
            {
              label: `− Recoups (outside cap)`,
              value: -recoupsOutsideCap,
              note: brief.recoups
                .filter((r) => r.placement === "outside_cap")
                .map((r) => r.label)
                .join("; "),
              citation: {
                source: "brief_recoup" as const,
                label: "brief.recoups (outside_cap)",
                detail: "Comes off gross before the cap is applied.",
              },
            },
          ]
        : []),
      {
        label:
          recoupsInsideCap > 0
            ? `− Expenses + inside-cap recoups (cap $${brief.expenseCap?.toLocaleString() ?? "—"})`
            : `− Expenses (cap $${brief.expenseCap?.toLocaleString() ?? "—"})`,
        value: -cappedDeductible,
        note: `actual $${insideCapBucket.toLocaleString()}, cap $${brief.expenseCap?.toLocaleString() ?? "∞"}`,
        citation: {
          source: "expense",
          label:
            recoupsInsideCap > 0
              ? "expenses + brief.recoups (inside_cap)"
              : "expenses (passed through)",
        },
      },
      {
        label: `Net for share`,
        value: netForShare,
        citation: {
          source: "computed",
          label: "net − recoups(outside) − capped(expenses + recoups(inside))",
        },
      },
      {
        label: ratchetNote
          ? `× ${(effectivePct * 100).toFixed(0)}% of net (ratcheted)`
          : `× ${(effectivePct * 100).toFixed(0)}% of net`,
        value: pctPayout,
        note: ratchetNote ?? undefined,
        citation: {
          source: "brief_field",
          label: "brief.percentage",
        },
      },
      ...(brief.dealType === "vs"
        ? [
            {
              label: `Guarantee ($${guarantee.toLocaleString()})`,
              value: guarantee,
              citation: {
                source: "brief_field" as const,
                label: "brief.guaranteeAmount",
              },
            },
            {
              label: overrideGuarantee
                ? "Greater: take the percentage"
                : "Greater: take the guarantee (artist short of pct)",
              value: base,
              citation: {
                source: "computed" as const,
                label: "max(guarantee, pct × net_for_share)",
              },
            },
          ]
        : []),
      ...(walkoutCitation ? [walkoutCitation] : []),
      ...bonusResult.applied
        .filter(
          (b) =>
            // walkout bonus already added above; don't double-count
            !(walkoutCitation && b.label === walkoutCitation.label),
        )
        .map((b) => ({
          label: b.label,
          value: b.amount,
          note: b.reason,
          citation: {
            source: "brief_bonus" as const,
            label: "brief.bonuses",
            detail: b.reason,
          },
        })),
    ];

    const pathTaken =
      brief.dealType === "vs"
        ? flavor === "walkout"
          ? "vs_walkout"
          : flavor === "ratchet"
            ? "vs_ratchet"
            : "vs_standard"
        : "percentage_of_net";

    return {
      supported: true,
      grossBoxOffice: gross,
      netBoxOffice: net,
      totalExpenses: passThru,
      recoupsTotal,
      totalToArtist,
      steps,
      finalFormula:
        brief.dealType === "vs"
          ? `max(${guarantee}, ${netForShare.toFixed(0)}×${effectivePct.toFixed(2)}) + walkout ${walkoutBonus.toFixed(0)}`
          : `${netForShare.toFixed(0)} × ${effectivePct.toFixed(2)} = ${pctPayout.toFixed(2)}`,
      bonusesApplied: bonusResult.applied,
      bonusesNotTriggered: bonusResult.notTriggered,
      pathTaken,
    };
  }

  return {
    supported: false,
    reason: `Brief deal type "${brief.dealType}" is not recognized.`,
  };
}

/**
 * Brief-aware version of applyBonuses. Handles the new walkout_pot bonus
 * type, otherwise mirrors the legacy logic.
 */
function applyBriefBonuses(
  bonuses: BriefBonus[],
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
      // Tier ratchet is applied inline in the vs calculator, not here.
      // Listed as "not triggered" only if the caller didn't consume it.
      notTriggered.push({
        label: b.label,
        amount: 0,
        reason: "Ratchet applied inline via vsFlavor='ratchet'.",
      });
    } else if (b.type === "walkout_pot") {
      // Walkout is applied inline in the vs calculator. Skip here.
    }
  }

  return {
    applied,
    notTriggered,
    totalApplied: applied.reduce((s, b) => s + b.amount, 0),
  };
}

/** Helpers used by the settle page for displaying the recoups breakdown. */
export function summarizeRecoups(recoups: BriefRecoup[]) {
  return {
    outsideCap: recoups
      .filter((r) => r.placement === "outside_cap")
      .reduce((s, r) => s + r.amount, 0),
    insideCap: recoups
      .filter((r) => r.placement === "inside_cap")
      .reduce((s, r) => s + r.amount, 0),
    total: recoups.reduce((s, r) => s + r.amount, 0),
  };
}
