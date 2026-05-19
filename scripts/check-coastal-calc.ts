import { db } from "@/db";
import { settlements } from "@/db/schema";
import { eq } from "drizzle-orm";

async function main() {
  const rows = await db
    .select({
      id: settlements.id,
      status: settlements.status,
      calc: settlements.calculationJson,
    })
    .from(settlements)
    .where(eq(settlements.showId, "show_coastal_spell_dispute"));

  if (!rows[0]) {
    console.log("no settlement row");
    process.exit(1);
  }

  const c = rows[0].calc ? JSON.parse(rows[0].calc) : null;
  console.log("settlement id:", rows[0].id);
  console.log("status:", rows[0].status);
  console.log("calc populated:", !!c);
  if (c) {
    console.log("  version:", c.version);
    console.log("  totalToArtist:", c.totalToArtist);
    console.log("  net:", c.netBoxOffice);
    const recoup = Array.isArray(c.termsSnapshot?.deductions)
      ? c.termsSnapshot.deductions.find(
          (d: { id?: string }) => d?.id === "marketing_recoup",
        )
      : undefined;
    console.log("  deal_terms_version:", c.termsSnapshot?.deal_terms_version);
    console.log("  recoup.cap_scope:", recoup?.cap_scope ?? "(no recoup row)");
    console.log("  guaranteeWinner:", c.guaranteeComparison.winner);
    console.log("  stepCount:", c.steps.length);
  }
}

main().then(() => process.exit(0));
