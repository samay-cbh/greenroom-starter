import assert from "node:assert/strict";
import type { Deal, Expense, TicketSale } from "../db/schema";
import { calculateSettlement } from "../lib/dealMath";
import {
  compareExtractedToStructured,
  normalizeExtraction,
  SOURCE_QUOTE_PLACEHOLDER,
} from "../lib/interpretation";

const baseDeal = {
  id: "deal_test",
  showId: "show_test",
  dealType: "percentage_of_net",
  guaranteeAmount: null,
  percentage: 0.8,
  percentageBasis: "net",
  expenseCap: null,
  hospitalityCap: null,
  bonusesJson: null,
  dealNotesFreetext: null,
  createdAt: new Date("2026-01-01T00:00:00Z"),
} satisfies Deal;

const flatString = normalizeExtraction({
  dealType: "Vs deal",
  guaranteeAmount: "5000",
});

assert.equal(flatString.dealType.value, "vs");
assert.equal(flatString.dealType.confidence, 0);
assert.equal(flatString.dealType.sourceQuote, null);
assert.equal(flatString.guaranteeAmount.value, 5000);

const updatedBonus = normalizeExtraction({
  bonusThresholds: [
    {
      value: {
        id: "bonus_1",
        label: "+$400 if gross > $11,000",
        triggerType: "gross_threshold",
        amount: 400,
        threshold: 11000,
      },
      confidence: 0.7,
      sourceQuote: "+$400 if gross > $11,000",
    },
  ],
  ambiguities: [
    {
      id: "amb_updated_bonus",
      field: "bonusThresholds",
      question: "Bonus threshold updated from $11,000 to $6,000",
      sourceQuote: "bonus threshold dropped to $6,000",
      interpretations: [
        {
          id: "original",
          label: "Original threshold $11,000",
          description: "Use the original threshold.",
          recoupCapTreatment: null,
          confidence: 0.5,
        },
        {
          id: "updated",
          label: "Updated threshold $6,000",
          description: "Use the updated threshold.",
          recoupCapTreatment: null,
          confidence: 0.5,
        },
      ],
    },
  ],
});

assert.equal(updatedBonus.bonusThresholds[0].threshold, 6000);
assert.equal(updatedBonus.ambiguities.length, 0);

const fullObjectInput = {
  dealType: { value: "vs", confidence: 0.9, sourceQuote: "vs clause" },
  guaranteeAmount: { value: 5000, confidence: 0.95, sourceQuote: "$5,000" },
  percentage: { value: 0.8, confidence: 0.95, sourceQuote: "80%" },
  percentageBasis: { value: "net", confidence: 0.95, sourceQuote: "net" },
  expenseCap: { value: 2500, confidence: 0.95, sourceQuote: "$2,500 cap" },
  hospitalityCap: { value: 500, confidence: 0.95, sourceQuote: "$500 hosp" },
  bonusThresholds: [
    {
      id: "bonus_1",
      label: "+$500 over $10,000 gross",
      triggerType: "gross_threshold",
      amount: 500,
      threshold: 10000,
      sourceQuote: "+$500 over $10,000 gross",
      confidence: 0.8,
    },
  ],
  recoupLineItems: [],
  ambiguities: [],
};

assert.deepEqual(normalizeExtraction(fullObjectInput), fullObjectInput);

const missingQuoteDivergences = compareExtractedToStructured(
  normalizeExtraction({
    dealType: { value: "vs", confidence: 0.8, sourceQuote: null },
  }),
  baseDeal,
);

assert.equal(missingQuoteDivergences.length, 1);
assert.equal(missingQuoteDivergences[0].field, "dealType");
assert.equal(missingQuoteDivergences[0].sourceQuote, SOURCE_QUOTE_PLACEHOLDER);

const nullValueDivergences = compareExtractedToStructured(
  normalizeExtraction({
    dealType: { value: null, confidence: 0, sourceQuote: null },
  }),
  baseDeal,
);

assert.equal(
  nullValueDivergences.some((divergence) => divergence.field === "dealType"),
  false,
);

const vsDeal = {
  ...baseDeal,
  dealType: "vs",
  guaranteeAmount: 5000,
  percentage: 0.8,
  percentageBasis: "net",
  expenseCap: 2500,
} satisfies Deal;

const vsCalc = calculateSettlement({
  deal: vsDeal,
  ticketSales: [
    {
      id: "tickets_1",
      showId: "show_test",
      qty: 500,
      gross: 18000,
      fees: 142.5,
      capturedAt: new Date("2026-01-01T00:00:00Z"),
    },
  ] satisfies TicketSale[],
  expenses: [
    {
      id: "expense_1",
      showId: "show_test",
      category: "marketing",
      amount: 3100,
      description: "Marketing",
      approved: true,
      absorbedByVenue: false,
      enteredByUserId: null,
      enteredAt: new Date("2026-01-01T00:00:00Z"),
    },
  ] satisfies Expense[],
});

assert.equal(vsCalc.supported, true);
assert.equal(vsCalc.supported ? vsCalc.totalToArtist : null, 12286);
assert.equal(
  vsCalc.supported
    ? vsCalc.steps.some((step) =>
        step.note?.includes("capped at $2,500 from $3,100"),
      )
    : false,
  true,
);

console.log("interpretation assertions passed");
