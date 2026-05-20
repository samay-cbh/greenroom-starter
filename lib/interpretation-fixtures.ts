import type { InterpretationDraft } from "./interpretation-types";

const coastalSpell: InterpretationDraft = {
  mode: "fixture",
  extraction: {
    dealType: {
      value: "vs",
      confidence: 0.99,
      sourceQuote: "$5,000 vs 80% of net after expenses, whichever greater",
    },
    guaranteeAmount: {
      value: 5000,
      confidence: 0.99,
      sourceQuote: "$5,000 vs 80% of net after expenses",
    },
    percentage: {
      value: 0.8,
      confidence: 0.99,
      sourceQuote: "80% of net after expenses",
    },
    percentageBasis: {
      value: "net",
      confidence: 0.99,
      sourceQuote: "net after expenses",
    },
    expenseCap: {
      value: 2500,
      confidence: 0.98,
      sourceQuote: "Expenses capped $2,500",
    },
    hospitalityCap: {
      value: 500,
      confidence: 0.98,
      sourceQuote: "Hospitality cap $500",
    },
    bonusThresholds: [
      {
        id: "bonus_gross_25000",
        label: "+$1,000 if gross > $25,000",
        triggerType: "gross_threshold",
        amount: 1000,
        threshold: 25000,
        sourceQuote: "+$1,000 bonus over $25k gross",
        confidence: 0.97,
      },
    ],
    recoupLineItems: [
      {
        id: "recoup_marketing_900",
        description: "Marketing recoup",
        amount: 900,
        capTreatment: "unknown",
        sourceQuote: "Marketing recoup of $900 against gross",
        confidence: 0.76,
      },
    ],
    ambiguities: [
      {
        id: "amb_marketing_recoup_cap",
        field: "marketing recoup placement",
        question:
          "Is the $900 marketing recoup part of the $2,500 expense cap, or an additional gross deduction before the capped expense calculation?",
        sourceQuote: "Marketing recoup of $900 against gross",
        interpretations: [
          {
            id: "outside_cap",
            label: "Outside expense cap",
            description:
              "Treat the marketing recoup as a separate gross deduction before applying the capped expense deduction.",
            recoupCapTreatment: "outside_expense_cap",
            confidence: 0.54,
          },
          {
            id: "inside_cap",
            label: "Inside expense cap",
            description:
              "Treat the marketing recoup as part of the capped venue expenses, not as an extra deduction.",
            recoupCapTreatment: "inside_expense_cap",
            confidence: 0.46,
          },
        ],
      },
    ],
  },
};

const show0001: InterpretationDraft = {
  mode: "fixture",
  extraction: {
    dealType: {
      value: "vs",
      confidence: 0.99,
      sourceQuote:
        "$3,500 guarantee vs 85% of net after expenses, whichever greater",
    },
    guaranteeAmount: {
      value: 3500,
      confidence: 0.99,
      sourceQuote: "$3,500 guarantee",
    },
    percentage: {
      value: 0.85,
      confidence: 0.99,
      sourceQuote: "85% of net after expenses",
    },
    percentageBasis: {
      value: "net",
      confidence: 0.99,
      sourceQuote: "net after expenses",
    },
    expenseCap: {
      value: 550,
      confidence: 0.98,
      sourceQuote: "Expense cap $550",
    },
    hospitalityCap: {
      value: 300,
      confidence: 0.98,
      sourceQuote: "hospitality $300",
    },
    bonusThresholds: [],
    recoupLineItems: [],
    ambiguities: [],
  },
};

const show0007: InterpretationDraft = {
  mode: "fixture",
  extraction: {
    dealType: {
      value: "vs",
      confidence: 0.99,
      sourceQuote: "$2,631 vs 90% net + walkout pot",
    },
    guaranteeAmount: {
      value: 2631,
      confidence: 0.99,
      sourceQuote: "$2,631 vs 90% net",
    },
    percentage: {
      value: 0.9,
      confidence: 0.99,
      sourceQuote: "90% net",
    },
    percentageBasis: {
      value: "net",
      confidence: 0.98,
      sourceQuote: "90% net",
    },
    expenseCap: {
      value: null,
      confidence: 0.31,
      sourceQuote: null,
    },
    hospitalityCap: {
      value: 400,
      confidence: 0.98,
      sourceQuote: "Hospitality cap $400",
    },
    bonusThresholds: [
      {
        id: "bonus_gross_6000",
        label: "+$400 if gross > $6,000",
        triggerType: "gross_threshold",
        amount: 400,
        threshold: 6000,
        sourceQuote:
          "Updated 4 days before show via phone call with agent: bonus threshold dropped to $6,000",
        confidence: 0.94,
      },
      {
        id: "walkout_gross_3200",
        label: "Walkout pot: 100% of gross above $3,200",
        triggerType: "other",
        amount: null,
        threshold: 3200,
        sourceQuote: "Walkout pot: 100% of gross above $3,200",
        confidence: 0.88,
      },
    ],
    recoupLineItems: [],
    ambiguities: [],
  },
};

const fixtures: Record<string, InterpretationDraft> = {
  show_coastal_spell_dispute: coastalSpell,
  show_0001: show0001,
  show_0007: show0007,
};

export function getInterpretationFixture(showId: string) {
  return fixtures[showId] ?? null;
}
