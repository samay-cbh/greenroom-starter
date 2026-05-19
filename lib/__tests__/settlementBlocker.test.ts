import { test } from "node:test";
import assert from "node:assert/strict";

import { calculateSettlement } from "../dealMath";
import {
  getBlockerPresentation,
  resolveSettlementBlocker,
} from "../settlementBlocker";
import type { Deal } from "../../db/schema";

test("resolveSettlementBlocker maps stale JSON to terms_invalid", () => {
  const calc = calculateSettlement({
    deal: {
      id: "d1",
      showId: "show-1",
      dealType: "vs",
      guaranteeAmount: 5000,
      percentage: null,
      percentageBasis: null,
      expenseCap: 2500,
      hospitalityCap: null,
      bonusesJson: null,
      dealNotesFreetext: null,
      dealTermsJson: null,
      createdAt: new Date(),
    } satisfies Deal,
    ticketSales: [],
    expenses: [],
  });

  assert.equal(calc.supported, false);
  if (calc.supported) return;

  assert.equal(
    resolveSettlementBlocker(calc, { termsParseFailed: true }),
    "terms_invalid",
  );
  assert.equal(
    resolveSettlementBlocker(calc, { termsParseFailed: false }),
    "confirm_terms",
  );
});

test("getBlockerPresentation for confirm_terms includes confirm CTA", () => {
  const ui = getBlockerPresentation("confirm_terms", {
    dealType: "vs",
    showId: "show_coastal_spell_dispute",
    reason: "Confirm deal terms first.",
    hasSignedSettlement: true,
  });

  assert.match(ui.title, /Confirm deal terms/i);
  assert.equal(ui.accent, "brand");
  assert.equal(ui.primaryAction?.href, "/shows/show_coastal_spell_dispute/confirm-terms");
  assert.match(ui.description, /signed settlement/i);
});
