/**
 * Artist health score computation.
 *
 * A transparent, explainable scoring model based on available data.
 * Score is 0–5 (displayed as stars or a number).
 *
 * Factors:
 *   - Repeat history (weight: 0.25) — more shows = stronger relationship
 *   - Recency (weight: 0.20) — recent bookings are healthier
 *   - Dispute record (weight: 0.25) — fewer disputes = better
 *   - Expense compliance (weight: 0.15) — expenses within caps
 *   - Payout reliability (weight: 0.15) — settlements completed cleanly
 */

import type { ArtistHealthSummary, HealthFactor } from "./types";
import type { Deal } from "@/db/schema";

interface HealthInput {
  showCount: number;
  lastShowDate: string | null;
  disputeCount: number;
  totalShows: number;
  settledCleanly: number; // Shows that went to paid without dispute
  expenseOverCapCount: number;
  totalExpenseShows: number;
  avgPayout: number | null;
  dealTypes: Deal["dealType"][];
}

export function computeArtistHealth(input: HealthInput): ArtistHealthSummary {
  const factors: HealthFactor[] = [];
  const statements: string[] = [];

  // 1. Repeat history (0–1)
  const repeatScore = Math.min(input.showCount / 6, 1);
  factors.push({ label: "Repeat history", score: repeatScore, weight: 0.25 });
  if (input.showCount >= 6) {
    statements.push("Strong repeat relationship");
  } else if (input.showCount >= 3) {
    statements.push("Developing relationship");
  } else {
    statements.push("New or infrequent relationship");
  }

  // 2. Recency (0–1)
  let recencyScore = 0;
  if (input.lastShowDate) {
    const daysSince = Math.floor(
      (Date.now() - new Date(input.lastShowDate).getTime()) /
        (1000 * 60 * 60 * 24),
    );
    if (daysSince <= 30) recencyScore = 1;
    else if (daysSince <= 90) recencyScore = 0.8;
    else if (daysSince <= 180) recencyScore = 0.6;
    else if (daysSince <= 365) recencyScore = 0.3;
    else recencyScore = 0.1;
  }
  factors.push({ label: "Recency", score: recencyScore, weight: 0.2 });

  // 3. Dispute record (0–1, inverted — fewer disputes = higher score)
  const disputeRatio =
    input.totalShows > 0 ? input.disputeCount / input.totalShows : 0;
  const disputeScore = Math.max(0, 1 - disputeRatio * 3);
  factors.push({
    label: "Dispute record",
    score: disputeScore,
    weight: 0.25,
  });
  if (input.disputeCount === 0) {
    statements.push("No disputes on record");
  } else if (input.disputeCount === 1) {
    statements.push("1 dispute noted — monitor");
  } else {
    statements.push(`${input.disputeCount} disputes — elevated risk`);
  }

  // 4. Expense compliance (0–1)
  const complianceScore =
    input.totalExpenseShows > 0
      ? Math.max(
          0,
          1 - input.expenseOverCapCount / input.totalExpenseShows,
        )
      : 0.7; // neutral if no data
  factors.push({
    label: "Expense compliance",
    score: complianceScore,
    weight: 0.15,
  });
  if (complianceScore >= 0.9) {
    statements.push("Reliable expense compliance");
  } else if (complianceScore < 0.6) {
    statements.push("Poor expense compliance");
  }

  // 5. Payout reliability (0–1)
  const payoutScore =
    input.totalShows > 0
      ? Math.min(input.settledCleanly / input.totalShows, 1)
      : 0.5;
  factors.push({
    label: "Payout reliability",
    score: payoutScore,
    weight: 0.15,
  });

  // Weighted total → 0–5 scale
  const weighted = factors.reduce(
    (sum, f) => sum + f.score * f.weight,
    0,
  );
  const score = Math.round(weighted * 5 * 10) / 10; // 1 decimal

  // Recommended deal structure
  const recommendedDealStructure = recommendDeal(input);

  return { score, factors, statements, recommendedDealStructure };
}

function recommendDeal(input: HealthInput): string | null {
  if (input.showCount === 0) return null;

  // Count deal types
  const typeCounts: Record<string, number> = {};
  for (const dt of input.dealTypes) {
    typeCounts[dt] = (typeCounts[dt] ?? 0) + 1;
  }

  // Find most common
  const sorted = Object.entries(typeCounts).sort((a, b) => b[1] - a[1]);
  if (sorted.length === 0) return null;

  const labels: Record<string, string> = {
    flat: "Flat guarantee",
    vs: "Vs deal",
    percentage_of_net: "% of net",
    percentage_of_gross: "% of gross",
    door: "Door deal",
  };

  const most = sorted[0][0];
  const label = labels[most] ?? most;

  if (input.disputeCount > 1 && most === "vs") {
    return `Consider flat guarantee to reduce dispute risk`;
  }

  return `${label} (${sorted[0][1]} of ${input.dealTypes.length} past deals)`;
}
