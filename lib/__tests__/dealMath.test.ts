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

// -------- Phase A + Transparency fixtures --------
//
// A second vs show that isn't Coastal Spell-shaped: no cap, two pre-cap
// deductions, no bonuses. Locks in "any vs show settles" without an
// expense cap or recoup ambiguity in play.

function uncappedMultiDeductionDeal(): Deal {
  return {
    id: "deal-amber-glow",
    showId: "show-amber-glow",
    dealType: "vs",
    guaranteeAmount: 3000,
    percentage: null,
    percentageBasis: null,
    expenseCap: null,
    hospitalityCap: null,
    bonusesJson: null,
    dealNotesFreetext: null,
    dealTermsJson: null,
    createdAt: new Date("2025-01-15T00:00:00Z"),
  };
}

function uncappedTicketSales(): TicketSale[] {
  return [
    {
      id: "ts-amber-1",
      showId: "show-amber-glow",
      qty: 120,
      gross: 10000,
      fees: 1000,
      capturedAt: new Date("2025-04-20T23:00:00Z"),
    },
  ];
}

function uncappedExpenses(): Expense[] {
  return [
    {
      id: "ex-amber-1",
      showId: "show-amber-glow",
      category: "production",
      amount: 800,
      description: "Production line",
      approved: true,
      absorbedByVenue: false,
      enteredByUserId: null,
      enteredAt: new Date("2025-04-20T23:30:00Z"),
    },
  ];
}

function uncappedTerms(): DealTermsV1 {
  return {
    deal_terms_version: DEAL_TERMS_VERSION,
    deal_type: "vs_deal",
    guarantee_amount: 3000,
    artist_percent: 0.8,
    expense_cap: { exists: false, cap_amount: null },
    deductions: [
      {
        id: "marketing_recoup",
        label: "Marketing Recoup",
        amount: 500,
        basis: "gross",
        cap_scope: "outside_cap",
        ordering_priority: 10,
      },
      {
        id: "hospitality_overage",
        label: "Hospitality Overage",
        amount: 300,
        basis: "gross",
        cap_scope: "outside_cap",
        ordering_priority: 20,
      },
    ],
    bonus_tiers: [],
    source_text: "fixture: uncapped multi-deduction vs",
    confirmed_at: "2025-04-19T18:00:00Z",
  };
}

test("Test 4 — uncapped vs with two pre-cap deductions", () => {
  const result = calculateSettlement({
    deal: uncappedMultiDeductionDeal(),
    ticketSales: uncappedTicketSales(),
    expenses: uncappedExpenses(),
    confirmedTerms: uncappedTerms(),
  });

  assert.equal(result.supported, true);
  if (!result.supported) return;

  // 10000 − 1000 (fees) − 500 (recoup) − 300 (hospitality) − 800 (expenses) = 7400
  // 80% × 7400 = 5920; guarantee 3000 < 5920 → share wins
  assert.equal(result.netBoxOffice, 7400);
  assert.equal(result.totalToArtist, 5920);
  assert.ok(result.calculationRecord);
  assert.equal(
    result.calculationRecord.guaranteeComparison.winner,
    "artist_share",
  );
});

// A third fixture where the cap actually binds (savings > 0) and there is
// an in-cap deduction. Exercises both the in_cap and cap_binding capStatus
// branches that Phase A transparency adds to the worksheet.

function capBindsDeal(): Deal {
  return {
    id: "deal-river-tide",
    showId: "show-river-tide",
    dealType: "vs",
    guaranteeAmount: 5000,
    percentage: null,
    percentageBasis: null,
    expenseCap: 2000,
    hospitalityCap: null,
    bonusesJson: null,
    dealNotesFreetext: null,
    dealTermsJson: null,
    createdAt: new Date("2025-02-01T00:00:00Z"),
  };
}

function capBindsTicketSales(): TicketSale[] {
  return [
    {
      id: "ts-river-1",
      showId: "show-river-tide",
      qty: 200,
      gross: 20000,
      fees: 2000,
      capturedAt: new Date("2025-05-10T23:00:00Z"),
    },
  ];
}

function capBindsExpenses(): Expense[] {
  return [
    {
      id: "ex-river-1",
      showId: "show-river-tide",
      category: "production",
      amount: 3000,
      description: "Production line",
      approved: true,
      absorbedByVenue: false,
      enteredByUserId: null,
      enteredAt: new Date("2025-05-10T23:30:00Z"),
    },
  ];
}

function capBindsTerms(): DealTermsV1 {
  return {
    deal_terms_version: DEAL_TERMS_VERSION,
    deal_type: "vs_deal",
    guarantee_amount: 5000,
    artist_percent: 0.8,
    expense_cap: { exists: true, cap_amount: 2000 },
    deductions: [
      {
        id: "marketing_recoup",
        label: "Marketing Recoup",
        amount: 500,
        basis: "gross",
        cap_scope: "inside_cap",
        ordering_priority: 10,
      },
    ],
    bonus_tiers: [],
    source_text: "fixture: cap binds, in-cap recoup",
    confirmed_at: "2025-05-09T18:00:00Z",
  };
}

test("Test 5 — cap binds, in-cap recoup → capSavings > 0", () => {
  const result = calculateSettlement({
    deal: capBindsDeal(),
    ticketSales: capBindsTicketSales(),
    expenses: capBindsExpenses(),
    confirmedTerms: capBindsTerms(),
  });

  assert.equal(result.supported, true);
  if (!result.supported) return;

  // bucket = expenses 3000 + in-cap recoup 500 = 3500; cap 2000 → capped 2000
  // 20000 − 2000 (fees) − 0 (pre-cap) − 2000 (capped) = 16000
  // 80% × 16000 = 12800; guarantee 5000 < 12800 → share wins
  assert.equal(result.netBoxOffice, 16000);
  assert.equal(result.totalToArtist, 12800);
});

// -------- Transparency: running balance + cap status --------

test("running balance is set on every deduction-phase step", () => {
  const result = calculateSettlement({
    deal: vsDeal(),
    ticketSales: coastalTicketSales(),
    expenses: coastalExpenses(),
    confirmedTerms: baseTerms(),
  });
  assert.equal(result.supported, true);
  if (!result.supported || !result.calculationRecord) return;

  const steps = result.calculationRecord.steps;
  const gross = steps.find((s) => s.label === "Gross box office");
  assert.equal(gross?.runningBalance, 19840);

  // Final running balance through the deduction phase equals netBoxOffice.
  const stepsWithBalance = steps.filter((s) => s.runningBalance != null);
  const last = stepsWithBalance[stepsWithBalance.length - 1];
  assert.equal(last.runningBalance, result.netBoxOffice);
});

test("Coastal Spell worksheet emits cap rows even when savings = 0", () => {
  const result = calculateSettlement({
    deal: vsDeal(),
    ticketSales: coastalTicketSales(),
    expenses: coastalExpenses(),
    confirmedTerms: baseTerms(),
  });
  assert.equal(result.supported, true);
  if (!result.supported || !result.calculationRecord) return;

  const steps = result.calculationRecord.steps;
  // Bucket subtotal row (informational) and cap row (no savings) should both
  // appear. The Coastal Spell case sits exactly on the boundary
  // (expenses 2500 + in-cap 0 = cap 2500), so the cap row carries
  // capStatus "cap_at".
  const bucket = steps.find((s) =>
    /in-cap bucket subtotal/i.test(s.label),
  );
  const capRow = steps.find((s) => s.capStatus?.startsWith("cap_"));
  assert.ok(bucket, "expected in-cap bucket subtotal row");
  assert.ok(capRow, "expected cap row with capStatus");
  assert.equal(capRow.capStatus, "cap_at");
});

test("cap_binding capStatus surfaces when bucket > cap", () => {
  const result = calculateSettlement({
    deal: capBindsDeal(),
    ticketSales: capBindsTicketSales(),
    expenses: capBindsExpenses(),
    confirmedTerms: capBindsTerms(),
  });
  assert.equal(result.supported, true);
  if (!result.supported || !result.calculationRecord) return;

  const capRow = result.calculationRecord.steps.find((s) =>
    s.capStatus?.startsWith("cap_"),
  );
  assert.equal(capRow?.capStatus, "cap_binding");
  // Cap savings = bucket 3500 − cap 2000 = 1500; emitted as a positive amount.
  assert.equal(capRow?.amount, 1500);
});

test("pre_cap and in_cap capStatuses are tagged on deduction rows", () => {
  const result = calculateSettlement({
    deal: vsDeal(),
    ticketSales: coastalTicketSales(),
    expenses: coastalExpenses(),
    confirmedTerms: baseTerms(),
  });
  assert.equal(result.supported, true);
  if (!result.supported || !result.calculationRecord) return;

  const steps = result.calculationRecord.steps;
  const recoupRow = steps.find((s) => /Marketing Recoup/i.test(s.label));
  assert.equal(recoupRow?.capStatus, "pre_cap");
  // Non-absorbed expense lives in the cap bucket; should be tagged in_cap.
  const expenseRow = steps.find((s) => s.label.startsWith("Expense:"));
  assert.equal(expenseRow?.capStatus, "in_cap");
});

test("uncapped vs deductions stay pre_cap and skip the bucket/cap rows", () => {
  const result = calculateSettlement({
    deal: uncappedMultiDeductionDeal(),
    ticketSales: uncappedTicketSales(),
    expenses: uncappedExpenses(),
    confirmedTerms: uncappedTerms(),
  });
  assert.equal(result.supported, true);
  if (!result.supported || !result.calculationRecord) return;

  const steps = result.calculationRecord.steps;
  const bucket = steps.find((s) =>
    /in-cap bucket subtotal/i.test(s.label),
  );
  const capRow = steps.find((s) => s.capStatus?.startsWith("cap_"));
  assert.equal(bucket, undefined, "no bucket row when uncapped");
  assert.equal(capRow, undefined, "no cap row when uncapped");
  // Both deductions are outside_cap → pre_cap status.
  const deductionRows = steps.filter((s) => /(Recoup|Overage)/i.test(s.label));
  assert.equal(deductionRows.length, 2);
  for (const row of deductionRows) {
    assert.equal(row.capStatus, "pre_cap");
  }
});
