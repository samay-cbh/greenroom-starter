/**
 * Tests for the deterministic deal-email parser stub.
 *
 * Covers the Phase A contract: ambiguities are emitted with a generic
 * `field` path so the confirm form can loop over them without knowing
 * which deduction is involved.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { parseDealEmail } from "../dealParser";

const COASTAL_EMAIL = `Coastal Spell — 2025-03-14
$5,000 vs 80% net.
Expenses capped at $2,500.
Marketing recoup of $900 against gross.
+$1,000 bonus over $20k gross.`;

const UNSPECIFIED_RECOUP_EMAIL = `Generic Show
$4,000 vs 75% net.
Marketing recoup of $400.`;

const NO_RECOUP_EMAIL = `Simple Show
$2,500 vs 80% net.
Expenses capped at $1,000.`;

test("Coastal-style email emits a forced-choice cap_scope ambiguity", () => {
  const parsed = parseDealEmail(COASTAL_EMAIL);
  assert.equal(parsed.extracted.guarantee_amount, 5000);
  assert.equal(parsed.extracted.artist_percent, 0.8);
  assert.equal(parsed.extracted.expense_cap?.exists, true);
  assert.equal(parsed.extracted.expense_cap?.cap_amount, 2500);

  const recoup = parsed.extracted.deductions?.find(
    (d) => d.id === "marketing_recoup",
  );
  assert.ok(recoup, "expected marketing_recoup deduction");
  assert.equal(recoup?.amount, 900);
  // cap_scope not pre-resolved — must be forced.
  assert.equal(recoup?.cap_scope, undefined);

  const amb = parsed.ambiguities.find(
    (a) => a.field === "deductions.marketing_recoup.cap_scope",
  );
  assert.ok(amb, "expected cap_scope ambiguity");
  // Generic Ambiguity shape: options carry string values + labels + rationale.
  assert.equal(amb?.options.length, 2);
  const values = amb?.options.map((o) => o.value).sort() ?? [];
  assert.deepEqual(values, ["inside_cap", "outside_cap"]);
});

test("Unspecified recoup phrase still forces a choice", () => {
  const parsed = parseDealEmail(UNSPECIFIED_RECOUP_EMAIL);
  assert.ok(
    parsed.ambiguities.some(
      (a) => a.field === "deductions.marketing_recoup.cap_scope",
    ),
    "unspecified recoup should emit an ambiguity",
  );
});

test("Email with no recoup emits zero ambiguities", () => {
  const parsed = parseDealEmail(NO_RECOUP_EMAIL);
  assert.equal(parsed.ambiguities.length, 0);
  assert.equal(parsed.extracted.deductions ?? undefined, undefined);
});

test("Guarantee without $ prefix is captured via 'g'tee' keyword", () => {
  // Real shorthand from a booker's draft: number first, no $, then "g'tee",
  // followed by an unrelated hospitality dollar amount that the old
  // first-$-in-text heuristic would have wrongly grabbed as the guarantee.
  const parsed = parseDealEmail(
    "4,988 g'tee vs 90% gross — no expenses come out. Simpler math, riskier for venue. Hosp $400.",
  );
  assert.equal(parsed.extracted.guarantee_amount, 4988);
  assert.equal(parsed.extracted.artist_percent, 0.9);
});

test("Guarantee captured via 'vs <pct>%' when no $ or keyword present", () => {
  const parsed = parseDealEmail("3500 vs 85% gross.");
  assert.equal(parsed.extracted.guarantee_amount, 3500);
  assert.equal(parsed.extracted.artist_percent, 0.85);
});

test("Bonus tier is parsed onto extracted.bonus_tiers", () => {
  const parsed = parseDealEmail(COASTAL_EMAIL);
  assert.equal(parsed.extracted.bonus_tiers?.length, 1);
  const tier = parsed.extracted.bonus_tiers![0];
  assert.equal(tier.threshold_amount, 20000);
  assert.equal(tier.flat_amount, 1000);
  assert.equal(tier.basis, "gross");
});
