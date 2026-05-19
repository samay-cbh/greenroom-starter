/**
 * One-off: write Deal Terms Schema v1 for the Coastal Spell demo show so the
 * auditable settle view renders end-to-end without hand-walking the form.
 *
 * Two flavors via argv[2]:
 *   pre  → Mariana's read (recoup OUTSIDE cap)
 *   in   → WME's read (recoup INSIDE cap)
 *
 * Optional argv[3]: override expense cap (default $2,500). Use a tighter cap
 * (e.g. 1000) to force expenses + recoup > cap, which triggers the diverge
 * case so the counterfactual block renders in the auditable view.
 *
 * Default: pre, cap=2500.
 */
import { db } from "@/db";
import { deals } from "@/db/schema";
import { eq } from "drizzle-orm";
import { DEAL_TERMS_VERSION, type DealTermsV1 } from "@/lib/dealTerms";

const SHOW_ID = "show_coastal_spell_dispute";
const DEAL_ID = `deal_${SHOW_ID}`;

const flavor = process.argv[2] === "in" ? "in" : "pre";
const capOverride = process.argv[3] ? Number(process.argv[3]) : 2500;

const terms: DealTermsV1 = {
  deal_terms_version: DEAL_TERMS_VERSION,
  deal_type: "vs_deal",
  guarantee_amount: 5000,
  artist_percent: 0.8,
  expense_cap: { exists: true, cap_amount: capOverride },
  deductions: [
    {
      id: "marketing_recoup",
      label: "Marketing Recoup",
      amount: 900,
      basis: "gross",
      cap_scope: flavor === "pre" ? "outside_cap" : "inside_cap",
      ordering_priority: 10,
    },
  ],
  bonus_tiers: [
    {
      threshold_amount: 25000,
      basis: "gross",
      percent_above_threshold: 0,
      flat_amount: 1000,
      label: "+$1,000 bonus over $25,000 gross",
    },
  ],
  source_text:
    "$5,000 vs 80% of net after expenses, whichever greater. Expenses capped $2,500. Hospitality cap $500. +$1,000 bonus over $25k gross. Marketing recoup of $900 against gross.",
  confirmed_at: new Date().toISOString(),
};

async function main() {
  await db
    .update(deals)
    .set({ dealTermsJson: JSON.stringify(terms) })
    .where(eq(deals.id, DEAL_ID));

  console.log(
    `[seed-coastal-terms] flavor=${flavor} cap=${capOverride} → recoup cap_scope = ${terms.deductions[0].cap_scope}`,
  );
}

main().then(() => process.exit(0));
