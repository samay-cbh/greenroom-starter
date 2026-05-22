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
  dealBriefs,
  type Recoup,
  type DealBriefRow,
} from "@/db/schema";
import { desc, asc, eq, sql, lte, and } from "drizzle-orm";

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

  return {
    ...row,
    ticketSales: showTicketSales,
    expenses: showExpenses,
    comps: showComps,
    recoups,
  };
}

export type ShowWithRelations = NonNullable<
  Awaited<ReturnType<typeof getShowById>>
>;

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

// -------- Deal Briefs --------

/**
 * Returns the latest brief for a given show (by `dealId`), regardless of
 * status. If a confirmed brief exists, callers should prefer it; otherwise
 * the latest draft is the working copy.
 */
export async function getLatestBriefForShow(
  showId: string,
): Promise<DealBriefRow | null> {
  const dealRow = await db
    .select({ id: deals.id })
    .from(deals)
    .where(eq(deals.showId, showId))
    .limit(1);
  if (dealRow.length === 0) return null;
  const dealId = dealRow[0].id;

  const briefs = await db
    .select()
    .from(dealBriefs)
    .where(eq(dealBriefs.dealId, dealId))
    .orderBy(desc(dealBriefs.version), desc(dealBriefs.createdAt))
    .limit(1);
  return briefs[0] ?? null;
}

/**
 * Returns the latest CONFIRMED brief for a show, or null. The settlement
 * engine uses this to decide whether to trust the brief or fall back to
 * the legacy `deals` row.
 */
export async function getConfirmedBriefForShow(
  showId: string,
): Promise<DealBriefRow | null> {
  const dealRow = await db
    .select({ id: deals.id })
    .from(deals)
    .where(eq(deals.showId, showId))
    .limit(1);
  if (dealRow.length === 0) return null;
  const dealId = dealRow[0].id;

  const briefs = await db
    .select()
    .from(dealBriefs)
    .where(and(eq(dealBriefs.dealId, dealId), eq(dealBriefs.status, "confirmed")))
    .orderBy(desc(dealBriefs.version))
    .limit(1);
  return briefs[0] ?? null;
}
