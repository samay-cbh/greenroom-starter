/**
 * End-to-end validation: drives the three flows the Step 9 success
 * criteria require, then prints what would be visible on the settle page.
 *
 * For each show:
 *   1. Read the deal email from deal_notes_freetext.
 *   2. Run Tier 0 parser → DealBrief.
 *   3. Run contradiction checks against the live DB.
 *   4. Insert a CONFIRMED brief so the settle page picks it up.
 *   5. Compute the brief-backed settlement and print the totals.
 *
 * Run with: npx tsx scripts/validate-flows.ts
 * Re-runnable: each run supersedes prior briefs for that deal.
 */

import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { eq } from "drizzle-orm";
import { randomUUID, createHash } from "node:crypto";
import * as schema from "@/db/schema";
import { dealBriefs, deals } from "@/db/schema";
import { parseDealEmailTier0 } from "@/lib/tierZeroParser";
import { runContradictionChecks } from "@/lib/contradictionChecks";
import { calculateSettlementFromBrief } from "@/lib/dealMath";

const client = createClient({ url: "file:./data/greenroom.db" });
const db = drizzle(client, { schema });

const TARGETS = [
  { showId: "show_coastal_spell_dispute", label: "Coastal Spell — the canonical Vs deal with ambiguous recoup" },
  { showId: "show_0005", label: "show_0005 — renegotiated deal (BC6 percentage drift + BC5 + BC3)" },
  { showId: "show_0011", label: "show_0011 — Daniel Hwang walkout-pot Vs deal (BC12)" },
];

async function main() {
  for (const target of TARGETS) {
    console.log(`\n${"=".repeat(78)}`);
    console.log(`Flow: ${target.label}`);
    console.log("=".repeat(78));

    const dealRow = (
      await db
        .select()
        .from(deals)
        .where(eq(deals.showId, target.showId))
        .limit(1)
    )[0];
    if (!dealRow) {
      console.log("  (no deal — skipping)");
      continue;
    }
    const email = dealRow.dealNotesFreetext ?? "";
    console.log("\n[1] Deal email (truncated):");
    console.log("    " + email.slice(0, 140) + (email.length > 140 ? "…" : ""));

    const tier0 = parseDealEmailTier0(email);
    console.log(`\n[2] Tier 0 extraction:`);
    console.log(`    dealType=${tier0.brief.dealType} vsFlavor=${tier0.brief.vsFlavor ?? "-"} pct=${tier0.brief.percentage} basis=${tier0.brief.percentageBasis ?? "-"} guarantee=${tier0.brief.guaranteeAmount} expCap=${tier0.brief.expenseCap} hospCap=${tier0.brief.hospitalityCap}`);
    console.log(`    confidence=${tier0.overallConfidence.toFixed(2)} triggers=${tier0.triggers.join(",") || "(none)"}`);
    console.log(`    ambiguities: ${tier0.ambiguities.length}`);
    for (const a of tier0.ambiguities) {
      console.log(`      • ${a.readingA.slice(0, 50)}…`);
      console.log(`        vs ${a.readingB.slice(0, 50)}…`);
      console.log(`        $ swing: ${a.dollarImpact ?? "?"}`);
    }

    const contradictions = await runContradictionChecks(target.showId, tier0.brief);
    console.log(`\n[3] Contradictions: ${contradictions.length}`);
    for (const c of contradictions) {
      console.log(`    [${c.severity}] ${c.kind}: ${c.message.slice(0, 100)}`);
    }

    // Persist as CONFIRMED so the settle page picks it up.
    await db
      .update(dealBriefs)
      .set({ status: "superseded" })
      .where(eq(dealBriefs.dealId, dealRow.id));

    const briefId = `brief_${randomUUID()}`;
    const existingCount = (
      await db.select().from(dealBriefs).where(eq(dealBriefs.dealId, dealRow.id))
    ).length;
    await db.insert(dealBriefs).values({
      id: briefId,
      dealId: dealRow.id,
      version: existingCount + 1,
      status: "confirmed",
      sourceEmailText: email,
      sourceEmailHash: createHash("sha256").update(email).digest("hex"),
      extractedJson: JSON.stringify(tier0.brief),
      ambiguitiesJson: tier0.ambiguities.length > 0 ? JSON.stringify(tier0.ambiguities) : null,
      contradictionsJson: contradictions.length > 0 ? JSON.stringify(contradictions) : null,
      embeddingBlob: null,
      confirmedAt: new Date(),
      confirmedVia: "manual_override",
      agentReplyText: "(validation script)",
      createdAt: new Date(),
      createdByUserId: "user_mariana",
    });
    console.log(`\n[4] Confirmed brief inserted: ${briefId}`);

    // Compute settlement math against real ticket/expense data.
    const ticketSales = await client.execute({
      sql: "SELECT * FROM ticket_sales WHERE show_id = ?",
      args: [target.showId],
    });
    const expenses = await client.execute({
      sql: "SELECT * FROM expenses WHERE show_id = ?",
      args: [target.showId],
    });
    const ts = ticketSales.rows.map((r) => ({
      gross: Number(r.gross),
      fees: Number(r.fees),
      qty: Number(r.qty),
    }));
    const exp = expenses.rows.map((r) => ({
      amount: Number(r.amount),
      category: r.category,
      absorbedByVenue: Boolean(r.absorbed_by_venue),
    }));

    const calc = calculateSettlementFromBrief({
      brief: tier0.brief,
      ticketSales: ts as never,
      expenses: exp as never,
      venueCapacity: 650,
    });
    console.log(`\n[5] Brief-backed settlement:`);
    if (calc.supported) {
      console.log(`    pathTaken: ${calc.pathTaken}`);
      console.log(`    totalToArtist: $${calc.totalToArtist.toFixed(2)}`);
      console.log(`    formula: ${calc.finalFormula}`);
    } else {
      console.log(`    UNSUPPORTED: ${calc.reason}`);
    }
  }
  client.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
