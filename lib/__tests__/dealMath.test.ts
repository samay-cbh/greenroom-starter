/**
 * Golden-file tests for the F1 vs deal engine.
 *
 * Canonical inputs come from data/dispute-thread.md (Coastal Spell, 2025-03-14).
 * The seed.ts expense set is intentionally inconsistent — do not use it here.
 *
 * Run via: `npm test`  (node's built-in test runner under tsx).
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { calculateSettlement } from "../dealMath";
import { DEAL_TERMS_VERSION, type DealTermsV1 } from "../dealTerms";
import type { Deal, Expense, TicketSale } from "../../db/schema";

// -------- Fixture builders --------

function vsDeal(): Deal {
  return {
    id: "deal-coastal-spell",
    showId: "show-coastal-spell",
    dealType: "vs",
    guaranteeAmount: 5000,
    percentage: null,
    percentageBasis: null,
    expenseCap: 2500,
    hospitalityCap: null,
    bonusesJson: null,
    dealNotesFreetext: null,
    dealTermsJson: null,
    createdAt: new Date("2024-12-01T00:00:00Z"),
  };
}

function coastalTicketSales(): TicketSale[] {
  return [
    {
      id: "ts-coastal-1",
      showId: "show-coastal-spell",
      qty: 200,
      gross: 19840,
      fees: 1984,
      capturedAt: new Date("2025-03-14T23:00:00Z"),
    },
  ];
}

function coastalExpenses(): Expense[] {
  return [
    {
      id: "ex-coastal-1",
      showId: "show-coastal-spell",
      category: "production",
      amount: 2500,
      description: "Combined production line (test fixture, not the seed split)",
      approved: true,
      absorbedByVenue: false,
      enteredByUserId: null,
      enteredAt: new Date("2025-03-14T23:30:00Z"),
    },
  ];
}

function baseTerms(): DealTermsV1 {
  return {
    deal_terms_version: DEAL_TERMS_VERSION,
    deal_type: "vs_deal",
    guarantee_amount: 5000,
    artist_percent: 0.8,
    expense_cap: { exists: true, cap_amount: 2500 },
    deductions: [
      {
        id: "marketing_recoup",
        label: "Marketing Recoup",
        amount: 900,
        basis: "gross",
        cap_scope: "outside_cap",
        ordering_priority: 10,
      },
    ],
    bonus_tiers: [],
    source_text: "test fixture",
    confirmed_at: "2025-03-13T18:00:00Z",
  };
}

// -------- Tests --------

test("Test 1 — Coastal Spell, marketing recoup OUTSIDE cap (Mariana's read)", () => {
  const result = calculateSettlement({
    deal: vsDeal(),
    ticketSales: coastalTicketSales(),
    expenses: coastalExpenses(),
    confirmedTerms: baseTerms(),
  });

  assert.equal(result.supported, true);
  if (!result.supported) return; // type narrowing

  // 19840 − 1984 (fees) − 900 (pre-cap recoup) = 16956
  //   then − MIN(2500, 2500) = 14456
  //   80% × 14456 = 11564.80
  // Engine asserts 11564.80; dispute thread quotes $11,565 — the thread
  // rounded for human readability. $0.20 delta is the rounding choice,
  // not a math error.
  assert.equal(result.netBoxOffice, 14456);
  assert.equal(result.totalToArtist, 11564.8);
  assert.ok(result.calculationRecord, "calculationRecord must be populated for vs");
  assert.equal(result.calculationRecord.guaranteeComparison.winner, "artist_share");
  // why: pin the v1 schema discriminator on the snapshot so a future engine
  // change that drops the version field breaks the test loudly.
  assert.equal(
    result.calculationRecord.termsSnapshot.deal_terms_version,
    DEAL_TERMS_VERSION,
  );
});

test("Test 2 — Coastal Spell, marketing recoup INSIDE cap (WME's read)", () => {
  const base = baseTerms();
  const insideCapTerms: DealTermsV1 = {
    ...base,
    deductions: base.deductions.map((d) =>
      d.id === "marketing_recoup" ? { ...d, cap_scope: "inside_cap" } : d,
    ),
  };

  const result = calculateSettlement({
    deal: vsDeal(),
    ticketSales: coastalTicketSales(),
    expenses: coastalExpenses(),
    confirmedTerms: insideCapTerms,
  });

  assert.equal(result.supported, true);
  if (!result.supported) return;

  // 19840 − 1984 = 17856
  //   then − MIN(2500 + 900, 2500) = 17856 − 2500 = 15356
  //   80% × 15356 = 12284.80
  assert.equal(result.netBoxOffice, 15356);
  assert.equal(result.totalToArtist, 12284.8);

  // Cross-check the delta against test 1 to lock in the dispute amount.
  const outsideCapResult = calculateSettlement({
    deal: vsDeal(),
    ticketSales: coastalTicketSales(),
    expenses: coastalExpenses(),
    confirmedTerms: baseTerms(),
  });
  assert.equal(outsideCapResult.supported, true);
  if (!outsideCapResult.supported) return;

  const delta = result.totalToArtist - outsideCapResult.totalToArtist;
  // This is the $720 Coastal Spell dispute, captured in a test.
  assert.equal(Math.round(delta * 100) / 100, 720);
});

test("Test 3 — Flat deal regression (existing API, no confirmedTerms)", () => {
  const flatDeal: Deal = {
    id: "deal-flat-1",
    showId: "show-flat-1",
    dealType: "flat",
    guaranteeAmount: 2000,
    percentage: null,
    percentageBasis: null,
    expenseCap: null,
    hospitalityCap: null,
    bonusesJson: null,
    dealNotesFreetext: null,
    dealTermsJson: null,
    createdAt: new Date("2025-01-01T00:00:00Z"),
  };

  const result = calculateSettlement({
    deal: flatDeal,
    ticketSales: [],
    expenses: [],
  });

  assert.equal(result.supported, true);
  if (!result.supported) return;

  assert.equal(result.totalToArtist, 2000);
  // The flat path must not populate calculationRecord — proves Phase 1
  // didn't reach into the existing branches.
  assert.equal(result.calculationRecord, undefined);
});

test("vs deal without confirmed terms returns confirm_terms blocker", () => {
  const result = calculateSettlement({
    deal: vsDeal(),
    ticketSales: coastalTicketSales(),
    expenses: coastalExpenses(),
  });

  assert.equal(result.supported, false);
  if (result.supported) return;
  assert.equal(result.blocker, "confirm_terms");
  assert.equal(result.reason, "Confirm deal terms first.");
});

test("net-basis deduction returns terms_not_supported blocker", () => {
  const terms = baseTerms();
  const badTerms: DealTermsV1 = {
    ...terms,
    deductions: [
      {
        ...terms.deductions[0],
        basis: "net",
      },
    ],
  };

  const result = calculateSettlement({
    deal: vsDeal(),
    ticketSales: coastalTicketSales(),
    expenses: coastalExpenses(),
    confirmedTerms: badTerms,
  });

  assert.equal(result.supported, false);
  if (result.supported) return;
  assert.equal(result.blocker, "terms_not_supported");
});
