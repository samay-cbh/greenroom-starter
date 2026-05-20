/**
 * Server-side query helpers.
 */

import { db } from "@/db";
import {
  shows,
  artists,
  agents,
  agencies,
  deals,
  ticketSales,
  comps,
  expenses,
  settlements,
  venues,
  type Recoup,
  type Deal,
} from "@/db/schema";
import { desc, asc, eq, sql, lte } from "drizzle-orm";
import { computeArtistHealth } from "./artistHealth";
import type { ArtistBookingProfile, ArtistDealMix, ShowTriageItem, DealVersion } from "./types";
import {
  formatShowDate,
  formatMoney,
  formatMoneyCompact,
  relativeShowDate,
} from "./format";

function todayDateString(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

export async function getAllShows() {
  return db
    .select({
      show: shows,
      artist: artists,
      agent: agents,
      deal: deals,
      settlement: settlements,
    })
    .from(shows)
    .leftJoin(artists, eq(shows.artistId, artists.id))
    .leftJoin(agents, eq(artists.agentId, agents.id))
    .leftJoin(deals, eq(deals.showId, shows.id))
    .leftJoin(settlements, eq(settlements.showId, shows.id))
    .where(lte(shows.date, todayDateString()))
    .orderBy(asc(shows.date));
}

export async function getShowById(id: string) {
  const rows = await db
    .select({
      show: shows,
      artist: artists,
      agent: agents,
      agency: agencies,
      deal: deals,
      settlement: settlements,
      venue: venues,
    })
    .from(shows)
    .leftJoin(artists, eq(shows.artistId, artists.id))
    .leftJoin(agents, eq(artists.agentId, agents.id))
    .leftJoin(agencies, eq(agents.agencyId, agencies.id))
    .leftJoin(deals, eq(deals.showId, shows.id))
    .leftJoin(settlements, eq(settlements.showId, shows.id))
    .leftJoin(venues, eq(shows.venueId, venues.id))
    .where(eq(shows.id, id));

  if (rows.length === 0) return null;
  const row = rows[0];

  const [showTicketSales, showExpenses, showComps] = await Promise.all([
    db
      .select()
      .from(ticketSales)
      .where(eq(ticketSales.showId, id))
      .orderBy(desc(ticketSales.capturedAt)),
    db
      .select()
      .from(expenses)
      .where(eq(expenses.showId, id))
      .orderBy(asc(expenses.enteredAt)),
    db.select().from(comps).where(eq(comps.showId, id)),
  ]);

  let recoups: Recoup[] = [];
  if (row.settlement?.recoupsJson) {
    try {
      const parsed = JSON.parse(row.settlement.recoupsJson);
      if (Array.isArray(parsed)) recoups = parsed;
    } catch {
      // Malformed JSON — ignore
    }
  }

  // Generate deal version history from settlement lifecycle timestamps
  const dealVersions = generateDealVersions(row, showExpenses);

  return {
    ...row,
    ticketSales: showTicketSales,
    expenses: showExpenses,
    comps: showComps,
    recoups,
    dealVersions,
  };
}

export type ShowWithRelations = NonNullable<
  Awaited<ReturnType<typeof getShowById>>
>;

/**
 * Generate a synthetic deal version timeline from settlement timestamps
 * and available data. In production this would come from an audit log table.
 */
function generateDealVersions(
  row: {
    show: typeof shows.$inferSelect;
    deal: typeof deals.$inferSelect | null;
    settlement: typeof settlements.$inferSelect | null;
    artist: typeof artists.$inferSelect | null;
  },
  showExpenses: (typeof expenses.$inferSelect)[],
): DealVersion[] {
  const versions: DealVersion[] = [];
  let v = 1;

  // Deal creation
  if (row.deal) {
    versions.push({
      id: `dv_${row.show.id}_${v}`,
      showId: row.show.id,
      version: v++,
      changeType: "deal_terms_updated",
      summary: "Deal terms entered",
      detail: `${row.deal.dealType} deal created${row.deal.guaranteeAmount ? ` — ${formatMoney(row.deal.guaranteeAmount)} guarantee` : ""}`,
      changedBy: "Mariana Reyes",
      changedAt: row.deal.createdAt,
      comment: null,
    });
  }

  // Expenses added (group by date)
  if (showExpenses.length > 0) {
    const totalExp = showExpenses
      .filter((e) => !e.absorbedByVenue)
      .reduce((s, e) => s + e.amount, 0);
    versions.push({
      id: `dv_${row.show.id}_${v}`,
      showId: row.show.id,
      version: v++,
      changeType: "expense_added",
      summary: `${showExpenses.length} expenses entered`,
      detail: `Total: ${formatMoney(totalExp)} across ${showExpenses.length} line items`,
      changedBy: "Mariana Reyes",
      changedAt: showExpenses[0].enteredAt,
      comment: null,
    });
  }

  // Settlement lifecycle events
  const s = row.settlement;
  if (s) {
    if (s.draftedAt) {
      versions.push({
        id: `dv_${row.show.id}_${v}`,
        showId: row.show.id,
        version: v++,
        changeType: "settlement_submitted",
        summary: "Settlement draft created",
        detail: s.totalToArtist
          ? `Total to artist: ${formatMoney(s.totalToArtist)}`
          : null,
        changedBy: "Mariana Reyes",
        changedAt: s.draftedAt,
        comment: null,
      });
    }
    if (s.submittedAt) {
      versions.push({
        id: `dv_${row.show.id}_${v}`,
        showId: row.show.id,
        version: v++,
        changeType: "settlement_submitted",
        summary: "Settlement submitted to artist team",
        detail: null,
        changedBy: "Mariana Reyes",
        changedAt: s.submittedAt,
        comment: null,
      });
    }
    if (s.disputedAt) {
      versions.push({
        id: `dv_${row.show.id}_${v}`,
        showId: row.show.id,
        version: v++,
        changeType: "settlement_disputed",
        summary: "Settlement disputed",
        detail: "Artist team flagged line items for review",
        changedBy: "Agent",
        changedAt: s.disputedAt,
        comment: s.notes ?? null,
      });
    }
    if (s.revisedAt) {
      versions.push({
        id: `dv_${row.show.id}_${v}`,
        showId: row.show.id,
        version: v++,
        changeType: "settlement_revised",
        summary: "Revised settlement sent",
        detail: null,
        changedBy: "Mariana Reyes",
        changedAt: s.revisedAt,
        comment: null,
      });
    }
    if (s.signedAt) {
      versions.push({
        id: `dv_${row.show.id}_${v}`,
        showId: row.show.id,
        version: v++,
        changeType: "settlement_signed",
        summary: "Settlement signed",
        detail: s.signoffText ?? null,
        changedBy: "Artist team",
        changedAt: s.signedAt,
        comment: s.signoffText ?? null,
      });
    }
    if (s.finalizedAt) {
      versions.push({
        id: `dv_${row.show.id}_${v}`,
        showId: row.show.id,
        version: v++,
        changeType: "settlement_signed",
        summary: "Settlement finalized",
        detail: "Both parties agree on final amount",
        changedBy: "Mariana Reyes",
        changedAt: s.finalizedAt,
        comment: null,
      });
    }
    if (s.paidAt) {
      versions.push({
        id: `dv_${row.show.id}_${v}`,
        showId: row.show.id,
        version: v++,
        changeType: "settlement_paid",
        summary: "Payment sent",
        detail: s.totalToArtist
          ? `${formatMoney(s.totalToArtist)} paid to artist`
          : null,
        changedBy: "Mariana Reyes",
        changedAt: s.paidAt,
        comment: null,
      });
    }
  }

  return versions.sort(
    (a, b) => a.changedAt.getTime() - b.changedAt.getTime(),
  );
}

/** All artists with show counts. */
export async function getAllArtists() {
  return db
    .select({
      artist: artists,
      agent: agents,
      agency: agencies,
      showCount: sql<number>`count(${shows.id})`.as("show_count"),
      lastShowDate: sql<string | null>`max(${shows.date})`.as("last_show_date"),
    })
    .from(artists)
    .leftJoin(agents, eq(artists.agentId, agents.id))
    .leftJoin(agencies, eq(agents.agencyId, agencies.id))
    .leftJoin(shows, eq(shows.artistId, artists.id))
    .groupBy(artists.id, agents.id, agencies.id)
    .orderBy(desc(sql`count(${shows.id})`), asc(artists.name));
}

/** Rich artist profiles with health scores, deal mix, and booking intelligence. */
export async function getArtistProfiles(): Promise<ArtistBookingProfile[]> {
  const today = todayDateString();

  // Get all past shows with related data
  const allShowsData = await db
    .select({
      show: shows,
      artist: artists,
      agent: agents,
      agency: agencies,
      deal: deals,
      settlement: settlements,
    })
    .from(shows)
    .leftJoin(artists, eq(shows.artistId, artists.id))
    .leftJoin(agents, eq(artists.agentId, agents.id))
    .leftJoin(agencies, eq(agents.agencyId, agencies.id))
    .leftJoin(deals, eq(deals.showId, shows.id))
    .leftJoin(settlements, eq(settlements.showId, shows.id))
    .where(lte(shows.date, today))
    .orderBy(desc(shows.date));

  // Get all expenses for cap compliance
  const allExpenses = await db.select().from(expenses);
  const expensesByShow = new Map<string, (typeof allExpenses)[number][]>();
  for (const e of allExpenses) {
    if (!expensesByShow.has(e.showId)) expensesByShow.set(e.showId, []);
    expensesByShow.get(e.showId)!.push(e);
  }

  // Group shows by artist
  const artistShows = new Map<
    string,
    (typeof allShowsData)[number][]
  >();
  for (const row of allShowsData) {
    if (!row.artist) continue;
    const id = row.artist.id;
    if (!artistShows.has(id)) artistShows.set(id, []);
    artistShows.get(id)!.push(row);
  }

  const profiles: ArtistBookingProfile[] = [];

  for (const [artistId, rows] of artistShows) {
    const first = rows[0];
    if (!first.artist) continue;

    // Deal type distribution
    const dealTypeCounts: Record<string, number> = {};
    const dealTypes: string[] = [];
    let totalPayout = 0;
    let payoutCount = 0;
    let disputeCount = 0;
    let disputedAmount = 0;
    let settledCleanly = 0;
    let expenseOverCapCount = 0;
    let totalExpenseShows = 0;

    for (const row of rows) {
      if (row.deal) {
        dealTypeCounts[row.deal.dealType] =
          (dealTypeCounts[row.deal.dealType] ?? 0) + 1;
        dealTypes.push(row.deal.dealType);

        // Check expense cap compliance
        if (row.deal.expenseCap != null) {
          totalExpenseShows++;
          const showExp = expensesByShow.get(row.show.id) ?? [];
          const totalExp = showExp
            .filter((e) => !e.absorbedByVenue)
            .reduce((s, e) => s + e.amount, 0);
          if (totalExp > row.deal.expenseCap) {
            expenseOverCapCount++;
          }
        }
      }
      if (row.settlement) {
        if (row.settlement.totalToArtist != null) {
          totalPayout += row.settlement.totalToArtist;
          payoutCount++;
        }
        if (
          row.settlement.status === "disputed" ||
          row.settlement.disputedAt
        ) {
          disputeCount++;
          if (row.settlement.totalToArtist) {
            disputedAmount += row.settlement.totalToArtist;
          }
        }
        if (
          row.settlement.status === "paid" &&
          !row.settlement.disputedAt
        ) {
          settledCleanly++;
        }
      }
    }

    const totalDeals = dealTypes.length || 1;
    const dealMix: ArtistDealMix[] = Object.entries(dealTypeCounts).map(
      ([dt, count]) => ({
        dealType: dt as ArtistDealMix["dealType"],
        count,
        percentage: count / totalDeals,
      }),
    );
    dealMix.sort((a, b) => b.count - a.count);

    const avgPayout = payoutCount > 0 ? totalPayout / payoutCount : null;

    const lastRow = rows[0]; // sorted desc by date
    const firstRow = rows[rows.length - 1];

    const health = computeArtistHealth({
      showCount: rows.length,
      lastShowDate: lastRow.show.date,
      disputeCount,
      totalShows: rows.length,
      settledCleanly,
      expenseOverCapCount,
      totalExpenseShows,
      avgPayout,
      dealTypes: dealTypes as Deal["dealType"][],
    });

    const lastDeal = lastRow.deal
      ? {
          dealType: lastRow.deal.dealType,
          guaranteeAmount: lastRow.deal.guaranteeAmount,
          percentage: lastRow.deal.percentage,
          expenseCap: lastRow.deal.expenseCap,
          hospitalityCap: lastRow.deal.hospitalityCap,
        }
      : null;

    profiles.push({
      artistId,
      artistName: first.artist.name,
      genre: first.artist.genre,
      agentName: first.agent?.name ?? null,
      agencyName: first.agency?.name ?? null,
      showCount: rows.length,
      lastShowDate: lastRow.show.date,
      firstShowDate: firstRow.show.date,
      avgPayout,
      totalRevenue: totalPayout,
      dealMix,
      expenseComplianceRate:
        totalExpenseShows > 0
          ? (totalExpenseShows - expenseOverCapCount) / totalExpenseShows
          : 1,
      disputeCount,
      disputedAmount,
      health,
      agent: first.agent
        ? {
            agentId: first.agent.id,
            agentName: first.agent.name,
            agencyName: first.agency?.name ?? null,
            disputeCount,
            lastDisputedAmount:
              disputedAmount > 0 ? disputedAmount : null,
            notes: first.agent.preferencesNotes ?? null,
          }
        : null,
      lastDeal,
    });
  }

  return profiles;
}

/** Build triage items for the shows page. */
export async function getShowTriageItems(): Promise<{
  thisWeekend: ShowTriageItem[];
  needsAttention: ShowTriageItem[];
  unresolved: ShowTriageItem[];
}> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = todayDateString();

  const allShowsData = await db
    .select({
      show: shows,
      artist: artists,
      deal: deals,
      settlement: settlements,
    })
    .from(shows)
    .leftJoin(artists, eq(shows.artistId, artists.id))
    .leftJoin(deals, eq(deals.showId, shows.id))
    .leftJoin(settlements, eq(settlements.showId, shows.id))
    .where(lte(shows.date, todayStr))
    .orderBy(desc(shows.date));

  const thisWeekend: ShowTriageItem[] = [];
  const needsAttention: ShowTriageItem[] = [];
  const unresolved: ShowTriageItem[] = [];

  for (const row of allShowsData) {
    const showDate = new Date(row.show.date);
    showDate.setHours(0, 0, 0, 0);
    const daysAgo = Math.floor(
      (today.getTime() - showDate.getTime()) / (1000 * 60 * 60 * 24),
    );

    const base: Omit<ShowTriageItem, "triageReason" | "triageLabel"> = {
      showId: row.show.id,
      artistName: row.artist?.name ?? "Unknown",
      showDate: row.show.date,
      dateFormatted: formatShowDate(row.show.date),
      dateRelative: relativeShowDate(row.show.date),
      dealType: row.deal?.dealType ?? null,
      dealAmount: row.deal?.guaranteeAmount
        ? formatMoneyCompact(row.deal.guaranteeAmount)
        : null,
      settlementStatus: row.settlement?.status ?? null,
      settlementTotal: row.settlement?.totalToArtist
        ? formatMoneyCompact(row.settlement.totalToArtist)
        : null,
      daysOld: daysAgo,
      dealNote: row.deal?.dealNotesFreetext?.slice(0, 80) ?? null,
    };

    // This weekend (0–3 days ago)
    if (daysAgo <= 3) {
      thisWeekend.push({
        ...base,
        triageReason: "this_weekend",
        triageLabel: daysAgo === 0 ? "Today" : `${daysAgo}d ago`,
      });
      continue;
    }

    // Check for attention-worthy items
    const status = row.settlement?.status;

    if (status === "disputed") {
      const target = daysAgo > 14 ? unresolved : needsAttention;
      target.push({
        ...base,
        triageReason: daysAgo > 14 ? "open_dispute" : "dispute_action",
        triageLabel:
          daysAgo > 14
            ? `Disputed ${daysAgo}d — unresolved`
            : `Disputed — needs action`,
      });
    } else if (status === "revised") {
      needsAttention.push({
        ...base,
        triageReason: "revised_offer",
        triageLabel: "Revised — awaiting acceptance",
      });
    } else if (status === "submitted") {
      if (daysAgo > 7) {
        needsAttention.push({
          ...base,
          triageReason: "stale_followup",
          triageLabel: `Submitted ${daysAgo}d ago — follow up`,
        });
      }
    } else if (status === "in_review" && daysAgo > 5) {
      needsAttention.push({
        ...base,
        triageReason: "pending_confirmation",
        triageLabel: `In review ${daysAgo}d — check status`,
      });
    } else if (status === "draft" && daysAgo > 3) {
      needsAttention.push({
        ...base,
        triageReason: "unsigned_settlement",
        triageLabel: `Draft for ${daysAgo}d — submit`,
      });
    } else if (status === "signed" && daysAgo > 10) {
      needsAttention.push({
        ...base,
        triageReason: "blocked_payout",
        triageLabel: `Signed ${daysAgo}d ago — process payment`,
      });
    } else if (status === "finalized" && daysAgo > 7) {
      needsAttention.push({
        ...base,
        triageReason: "blocked_payout",
        triageLabel: `Finalized — pay artist`,
      });
    } else if (!row.settlement && daysAgo > 5) {
      needsAttention.push({
        ...base,
        triageReason: "unsigned_settlement",
        triageLabel: `No settlement started — ${daysAgo}d overdue`,
      });
    }
  }

  return {
    thisWeekend: thisWeekend.slice(0, 8),
    needsAttention: needsAttention.slice(0, 10),
    unresolved: unresolved.slice(0, 10),
  };
}

/** Aggregates for the reports page. */
export async function getReports() {
  const today = todayDateString();

  const allShowsRows = await db.select().from(shows);
  const pastShowIds = new Set(
    allShowsRows.filter((s) => s.date <= today).map((s) => s.id),
  );

  const allDealsRows = await db.select().from(deals);
  const pastDeals = allDealsRows.filter((d) => pastShowIds.has(d.showId));

  const allSettlementsRows = await db.select().from(settlements);
  const pastSettlements = allSettlementsRows.filter((s) =>
    pastShowIds.has(s.showId),
  );

  const allCompsRows = await db.select().from(comps);
  const pastComps = allCompsRows.filter((c) => pastShowIds.has(c.showId));

  const dealTypeCounts: Record<string, number> = {};
  for (const d of pastDeals) {
    dealTypeCounts[d.dealType] = (dealTypeCounts[d.dealType] ?? 0) + 1;
  }

  const totalDeals = pastDeals.length;
  const supportedTypes = ["flat", "percentage_of_gross"];
  const supportedCount = pastDeals.filter((d) =>
    supportedTypes.includes(d.dealType),
  ).length;
  const inAppToolUsageRate = totalDeals > 0 ? supportedCount / totalDeals : 0;

  const settlementStatus: Record<string, number> = {};
  for (const s of pastSettlements) {
    settlementStatus[s.status] = (settlementStatus[s.status] ?? 0) + 1;
  }

  const totalSettlements = pastSettlements.length;
  const disputedRate =
    totalSettlements > 0
      ? (settlementStatus.disputed ?? 0) / totalSettlements
      : 0;

  const totalGross = pastSettlements.reduce(
    (sum, s) => sum + (s.grossBoxOffice ?? 0),
    0,
  );
  const totalToArtists = pastSettlements.reduce(
    (sum, s) => sum + (s.totalToArtist ?? 0),
    0,
  );

  const showCount = pastShowIds.size;
  const settledCount = pastShowIds.size;

  // Bonuses
  const dealsWithBonuses = pastDeals.filter((d) => d.bonusesJson).length;

  // Recoups
  let totalRecoupValue = 0;
  let disputedRecoupValue = 0;
  let settlementsWithRecoups = 0;
  for (const s of pastSettlements) {
    if (!s.recoupsJson) continue;
    try {
      const recoups = JSON.parse(s.recoupsJson) as Recoup[];
      if (!Array.isArray(recoups) || recoups.length === 0) continue;
      settlementsWithRecoups++;
      for (const r of recoups) {
        totalRecoupValue += r.amount;
        if (r.status === "disputed") disputedRecoupValue += r.amount;
      }
    } catch {
      // skip
    }
  }

  // Comps
  const totalCompTickets = pastComps.reduce((s, c) => s + c.count, 0);
  const totalCompFaceValue = pastComps.reduce(
    (s, c) => s + c.count * c.faceValue,
    0,
  );
  const compsByCategory: Record<string, number> = {};
  for (const c of pastComps) {
    compsByCategory[c.category] = (compsByCategory[c.category] ?? 0) + c.count;
  }

  return {
    dealTypeCounts,
    totalDeals,
    inAppToolUsageRate,
    settlementStatus,
    totalSettlements,
    disputedRate,
    totalGross,
    totalToArtists,
    showCount,
    settledCount,
    dealsWithBonuses,
    totalRecoupValue,
    disputedRecoupValue,
    settlementsWithRecoups,
    totalCompTickets,
    totalCompFaceValue,
    compsByCategory,
  };
}

export type Reports = Awaited<ReturnType<typeof getReports>>;
