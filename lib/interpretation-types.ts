import type { Deal } from "@/db/schema";

export type ExtractedDealType = Deal["dealType"] | string;
export type PercentageBasis = "gross" | "net" | string;
export type NumericExtractionValue = number | string;
export type KnownRecoupCapTreatment =
  | "inside_expense_cap"
  | "outside_expense_cap";
export type RecoupCapTreatment = KnownRecoupCapTreatment | "unknown" | string;

export type ExtractedField<T> = {
  value: T | null;
  confidence: number;
  sourceQuote: string | null;
};

export type ExtractedBonusThreshold = {
  id: string;
  label: string;
  triggerType:
    | "gross_threshold"
    | "sellout"
    | "attendance_threshold"
    | "tier_ratchet"
    | "other"
    | string;
  amount: NumericExtractionValue | null;
  threshold: NumericExtractionValue | null;
  sourceQuote: string | null;
  confidence: number;
};

export type ExtractedRecoup = {
  id: string;
  description: string;
  amount: NumericExtractionValue | null;
  capTreatment: RecoupCapTreatment;
  sourceQuote: string | null;
  confidence: number;
};

export type AmbiguityInterpretation = {
  id: string;
  label: string;
  description: string;
  recoupCapTreatment?: KnownRecoupCapTreatment | string | null;
  confidence: number;
};

export type DealAmbiguity = {
  id: string;
  field: string;
  question: string;
  sourceQuote: string | null;
  interpretations: AmbiguityInterpretation[];
};

export type ExtractedDealTerms = {
  dealType: ExtractedField<ExtractedDealType>;
  guaranteeAmount: ExtractedField<NumericExtractionValue>;
  percentage: ExtractedField<NumericExtractionValue>;
  percentageBasis: ExtractedField<PercentageBasis>;
  expenseCap: ExtractedField<NumericExtractionValue>;
  hospitalityCap: ExtractedField<NumericExtractionValue>;
  bonusThresholds: ExtractedBonusThreshold[];
  recoupLineItems: ExtractedRecoup[];
  ambiguities: DealAmbiguity[];
};

export type InterpretationMode = "fixture" | "openai";

export type InterpretationDraft = {
  mode: InterpretationMode;
  extraction: ExtractedDealTerms;
};

export type MissingInterpretation = {
  mode: "missing_api_key";
  message: string;
};

export type Divergence = {
  id: string;
  field: string;
  label: string;
  proseValue: string;
  structuredValue: string;
  sourceQuote: string | null;
  severity: "info" | "warning" | "critical";
};

export type AmbiguityImpactOption = {
  interpretationId: string;
  label: string;
  description: string;
  payout: number | null;
  formula: string | null;
};

export type AmbiguityImpact = {
  ambiguityId: string;
  sourceQuote: string | null;
  options: AmbiguityImpactOption[];
  delta: number | null;
  supportState:
    | "computed"
    | "unsupported_deal_type"
    | "insufficient_data";
};

export type SavedDivergenceResolution = Divergence & {
  selectedSource: "prose" | "structured";
};

export type SavedAmbiguityResolution = {
  ambiguityId: string;
  field: string;
  sourceQuote: string | null;
  chosenInterpretationId: string;
  chosenLabel: string;
  chosenDescription: string;
  chosenPayout: number | null;
  payoutDelta: number | null;
};
