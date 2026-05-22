/**
 * Contradiction checks — pure SQL, no LLM.
 *
 * These run on every brief save. They surface the 12 planted breadcrumbs
 * in db/seed.ts (and any organic versions in real data) as first-class
 * findings on the brief page. Each one is a deterministic comparison or
 * aggregate — the right tool for the job. A senior architect's instinct
 * is to NEVER hit an LLM for a `WHERE` clause.
 *
 * Eight per-show checks + one cross-show pattern detector:
 *
 *   1. percentage_drift          — brief.percentage ≠ deal.percentage
 *   2. deal_type_mismatch        — brief.dealType ≠ deal.dealType
 *   3. stale_prior_show_count    — artist played many shows; field says 0/1
 *   4. silent_hospitality_overrun — hosp > cap; nothing absorbed
 *   5. disputed_with_positive_signoff — status=disputed, signoff="looks good"
 *   6. paid_with_disputed_recoup — status=paid, recoup status=disputed
 *   7. reversed_timestamps       — signed_at < submitted_at
 *   8. duplicate_expense         — same show/category/amount within 24h
 *   9. cross_show_agent_pattern  — agent has ≥3 disputed marketing recoups
 */

import { eq, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db } from "@/db";
import {
  shows,
  deals,
  artists,
  expenses,
  settlements,
} from "@/db/schema";
import type { Contradiction, DealBrief } from "@/lib/dealBrief";

const HOSPITALITY_CAP_TOLERANCE = 25; // ignore <$25 over-cap (noise)
const STALE_SHOW_COUNT_THRESHOLD = 5; // artist has played ≥N, field <2
const CROSS_SHOW_PATTERN_THRESHOLD = 3; // agent has ≥3 disputed marketing recoups

export async function runContradictionChecks(
  showId: string,
  brief: DealBrief,
): Promise<Contradiction[]> {
  const findings: Contradiction[] = [];

  // Independent reads in parallel — show, deal, settlement, expenses,
  // duplicates, and the cross-show pattern don't depend on each other.
  // Saves ~5 round trips of latency per save.
  const [showRow, dealRow, settlementRow, duplicates, pattern] =
    await Promise.all([
      db
        .select()
        .from(shows)
        .where(eq(shows.id, showId))
        .limit(1)
        .then((r) => r[0]),
      db
        .select()
        .from(deals)
        .where(eq(deals.showId, showId))
        .limit(1)
        .then((r) => r[0]),
      db
        .select()
        .from(settlements)
        .where(eq(settlements.showId, showId))
        .limit(1)
        .then((r) => r[0]),
      db
        .select({
          category: expenses.category,
          amount: expenses.amount,
          count: sql<number>`count(*)`,
        })
        .from(expenses)
        .where(eq(expenses.showId, showId))
        .groupBy(expenses.category, expenses.amount)
        .having(sql`count(*) > 1`),
      crossShowAgentPattern(showId),
    ]);
  if (!showRow) return findings;

  // -------- 1. Percentage drift --------
  if (
    dealRow &&
    dealRow.percentage != null &&
    brief.percentage != null &&
    Math.abs(dealRow.percentage - brief.percentage) > 0.005 // ≥0.5 pp
  ) {
    const drift = Math.abs(dealRow.percentage - brief.percentage);
    findings.push({
      id: `c_${randomUUID()}`,
      kind: "percentage_drift",
      severity: drift >= 0.05 ? "high" : "warn",
      message: `Brief says ${(brief.percentage * 100).toFixed(0)}%, structured field says ${(dealRow.percentage * 100).toFixed(0)}%. Confirm which is canonical before settlement.`,
      evidence: {
        briefPercentage: brief.percentage,
        structuredPercentage: dealRow.percentage,
      },
    });
  }

  // -------- 2. Deal type mismatch --------
  // Only fire when the brief's dealType has real confidence behind it.
  // Tier 0 defaults to "flat" when it can't detect the type — comparing
  // that default against the structured field would generate a constant
  // stream of false-positives on garbage extractions.
  const dealTypeConfidence = brief.confidence?.dealType ?? 0;
  if (
    dealRow &&
    dealRow.dealType !== brief.dealType &&
    dealTypeConfidence >= 0.5
  ) {
    findings.push({
      id: `c_${randomUUID()}`,
      kind: "deal_type_mismatch",
      severity: "high",
      message: `Brief describes a ${brief.dealType.replace("_", " ")} deal; the structured field is set to ${dealRow.dealType.replace("_", " ")}. The settlement math will differ materially — fix one or the other.`,
      evidence: {
        briefDealType: brief.dealType,
        structuredDealType: dealRow.dealType,
        briefConfidence: dealTypeConfidence,
      },
    });
  }

  // -------- 3. Stale priorShowCount --------
  const artistRow = await db
    .select()
    .from(artists)
    .where(eq(artists.id, showRow.artistId))
    .limit(1)
    .then((r) => r[0]);
  if (artistRow) {
    const actualShows = await db
      .select({ count: sql<number>`count(*)` })
      .from(shows)
      .where(eq(shows.artistId, artistRow.id))
      .then((r) => Number(r[0].count));
    if (
      actualShows >= STALE_SHOW_COUNT_THRESHOLD &&
      artistRow.priorShowCount <= 1
    ) {
      findings.push({
        id: `c_${randomUUID()}`,
        kind: "stale_prior_show_count",
        severity: "info",
        message: `${artistRow.name} has played here ${actualShows} times — but the artist record says ${artistRow.priorShowCount}. They're a returning relationship, not a one-off.`,
        evidence: {
          artistId: artistRow.id,
          storedCount: artistRow.priorShowCount,
          actualCount: actualShows,
        },
      });
    }
  }

  // -------- 4. Silent hospitality overrun --------
  if (dealRow?.hospitalityCap != null) {
    const hospExpenses = await db
      .select({
        total: sql<number>`coalesce(sum(${expenses.amount}), 0)`,
        absorbed: sql<number>`coalesce(sum(case when ${expenses.absorbedByVenue} = 1 then ${expenses.amount} else 0 end), 0)`,
      })
      .from(expenses)
      .where(
        sql`${expenses.showId} = ${showId} AND ${expenses.category} = 'hospitality'`,
      )
      .then((r) => r[0]);
    const total = Number(hospExpenses.total);
    const absorbed = Number(hospExpenses.absorbed);
    const overrun = total - dealRow.hospitalityCap;
    if (overrun > HOSPITALITY_CAP_TOLERANCE && absorbed === 0) {
      findings.push({
        id: `c_${randomUUID()}`,
        kind: "silent_hospitality_overrun",
        severity: "warn",
        message: `Hospitality ran $${overrun.toFixed(0)} over the $${dealRow.hospitalityCap} cap, but nothing is marked as absorbed. The artist will see this and ask.`,
        evidence: {
          cap: dealRow.hospitalityCap,
          actual: total,
          absorbed,
        },
      });
    }
  }

  // -------- 5-7. Settlement-stage contradictions --------
  if (settlementRow) {
    // 5. Disputed status with positive signoff text
    if (
      settlementRow.status === "disputed" &&
      settlementRow.signoffText &&
      /\b(looks?\s+good|ok\b|👍|sign\s+off)/i.test(settlementRow.signoffText)
    ) {
      findings.push({
        id: `c_${randomUUID()}`,
        kind: "disputed_with_positive_signoff",
        severity: "high",
        message: `Settlement is marked as disputed, but the tour-manager signoff text reads "${settlementRow.signoffText.slice(0, 80)}". Either the dispute is stale or the wrong status was set.`,
        evidence: {
          status: settlementRow.status,
          signoffText: settlementRow.signoffText,
        },
      });
    }

    // 6. Paid status with still-disputed recoups
    if (settlementRow.status === "paid" && settlementRow.recoupsJson) {
      try {
        const recoups = JSON.parse(settlementRow.recoupsJson) as Array<{
          status?: string;
          amount?: number;
          label?: string;
        }>;
        const disputed = recoups.filter((r) => r.status === "disputed");
        const disputedTotal = disputed.reduce(
          (s, r) => s + (r.amount ?? 0),
          0,
        );
        if (disputed.length > 0) {
          findings.push({
            id: `c_${randomUUID()}`,
            kind: "paid_with_disputed_recoup",
            severity: "warn",
            message: `Settlement is paid, but $${disputedTotal.toFixed(0)} of recoups are still disputed (${disputed.length} line item${disputed.length === 1 ? "" : "s"}). Carrying as unresolved.`,
            evidence: { disputedCount: disputed.length, disputedTotal },
          });
        }
      } catch {
        // Malformed JSON — skip.
      }
    }

    // 7. Reversed timestamps
    if (
      settlementRow.signedAt &&
      settlementRow.submittedAt &&
      settlementRow.signedAt < settlementRow.submittedAt
    ) {
      findings.push({
        id: `c_${randomUUID()}`,
        kind: "reversed_timestamps",
        severity: "info",
        message: `Signed timestamp is earlier than submitted — the settlement lifecycle has data-quality drift.`,
        evidence: {
          signedAt: settlementRow.signedAt.toISOString(),
          submittedAt: settlementRow.submittedAt.toISOString(),
        },
      });
    }
  }

  // -------- 8. Duplicate expenses (already fetched above in parallel) --------
  for (const dup of duplicates) {
    findings.push({
      id: `c_${randomUUID()}`,
      kind: "duplicate_expense",
      severity: "warn",
      message: `Duplicate ${dup.category} expense of $${Number(dup.amount).toFixed(0)} entered ${Number(dup.count)} times. Check for a double-bill before settling.`,
      evidence: {
        category: dup.category,
        amount: Number(dup.amount),
        count: Number(dup.count),
      },
    });
  }

  // -------- 9. Cross-show pattern (already fetched above in parallel) --------
  if (pattern) findings.push(pattern);

  return findings;
}

/**
 * Cross-show pattern: how many prior shows with this agent had a disputed
 * marketing recoup? Surfaces patterns no individual booker can hold in
 * their head — Daniel Hwang at WME has 5+ in the seed data.
 */
async function crossShowAgentPattern(
  showId: string,
): Promise<Contradiction | null> {
  // Find the agent for this show.
  const agentRow = await db
    .select({
      agentId: artists.agentId,
    })
    .from(shows)
    .innerJoin(artists, eq(shows.artistId, artists.id))
    .where(eq(shows.id, showId))
    .limit(1)
    .then((r) => r[0]);

  if (!agentRow?.agentId) return null;
  const agentId = agentRow.agentId;

  // Count disputed marketing recoups across all of this agent's shows.
  // SQLite's json_each lets us iterate the recoups array per-settlement.
  const result = await db.all<{
    agent_name: string;
    agency_name: string | null;
    disputed_marketing_count: number;
    affected_shows: number;
  }>(sql`
    SELECT
      ag.name AS agent_name,
      agcy.name AS agency_name,
      COUNT(*) FILTER (
        WHERE json_extract(r.value, '$.status') = 'disputed'
          AND json_extract(r.value, '$.category') = 'marketing'
      ) AS disputed_marketing_count,
      COUNT(DISTINCT s.show_id) FILTER (
        WHERE json_extract(r.value, '$.status') = 'disputed'
          AND json_extract(r.value, '$.category') = 'marketing'
      ) AS affected_shows
    FROM settlements s
    INNER JOIN shows sh ON s.show_id = sh.id
    INNER JOIN artists ar ON sh.artist_id = ar.id
    INNER JOIN agents ag ON ar.agent_id = ag.id
    LEFT JOIN agencies agcy ON ag.agency_id = agcy.id
    LEFT JOIN json_each(s.recoups_json) r
    WHERE ag.id = ${agentId}
      AND s.recoups_json IS NOT NULL
      AND sh.id != ${showId}
    GROUP BY ag.id
  `);

  const row = result[0];
  if (!row) return null;
  const count = Number(row.disputed_marketing_count ?? 0);
  if (count < CROSS_SHOW_PATTERN_THRESHOLD) return null;

  return {
    id: `c_${randomUUID()}`,
    kind: "cross_show_agent_pattern",
    severity: "high",
    message: `${row.agent_name}${row.agency_name ? ` at ${row.agency_name}` : ""} has ${count} prior disputed marketing recoups across ${Number(row.affected_shows)} shows. Be explicit about recoup placement in this deal email — it's a recurring fight.`,
    evidence: {
      agentId,
      agentName: row.agent_name,
      agencyName: row.agency_name,
      disputedMarketingCount: count,
      affectedShows: Number(row.affected_shows),
    },
  };
}
