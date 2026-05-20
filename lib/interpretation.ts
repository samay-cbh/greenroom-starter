import OpenAI from "openai";
import type { ReasoningEffort } from "openai/resources/shared";
import type { Deal, Expense, TicketSale } from "@/db/schema";
import { parseBonuses } from "@/lib/dealMath";
import type { ShowWithRelations } from "@/lib/queries";
import { getInterpretationFixture } from "./interpretation-fixtures";
import type {
    AmbiguityImpact,
    AmbiguityImpactOption,
    DealAmbiguity,
    Divergence,
    ExtractedBonusThreshold,
    ExtractedDealTerms,
    ExtractedField,
    InterpretationDraft,
    KnownRecoupCapTreatment,
    MissingInterpretation,
    NumericExtractionValue,
    RecoupCapTreatment,
} from "./interpretation-types";

export const SOURCE_QUOTE_PLACEHOLDER =
    "Source quote not captured by extraction.";

const DEFAULT_OPENAI_MODEL = "gpt-5.5";
const DEFAULT_OPENAI_REASONING_EFFORT: ReasoningEffort = "medium";
const ALLOWED_REASONING_EFFORTS = new Set<ReasoningEffort>([
    "none",
    "minimal",
    "low",
    "medium",
    "high",
    "xhigh",
]);

const FIELD_LABELS: Record<string, string> = {
    dealType: "Deal type",
    guaranteeAmount: "Guarantee",
    percentage: "Percentage",
    percentageBasis: "Percentage basis",
    expenseCap: "Expense cap",
    hospitalityCap: "Hospitality cap",
};

const DEAL_LABELS: Record<string, string> = {
    flat: "Flat",
    percentage_of_gross: "% of gross",
    percentage_of_net: "% of net",
    vs: "Vs deal",
    door: "Door deal",
};

const DEAL_TYPE_LOOKUP: Record<string, string> = {
    flat: "flat",
    "flat guarantee": "flat",
    guarantee: "flat",
    percentage_of_gross: "percentage_of_gross",
    "percentage of gross": "percentage_of_gross",
    "% of gross": "percentage_of_gross",
    "percent of gross": "percentage_of_gross",
    "gross percentage": "percentage_of_gross",
    percentage_of_net: "percentage_of_net",
    "percentage of net": "percentage_of_net",
    "% of net": "percentage_of_net",
    "percent of net": "percentage_of_net",
    "net percentage": "percentage_of_net",
    vs: "vs",
    "vs deal": "vs",
    versus: "vs",
    "guarantee vs percentage": "vs",
    "guarantee versus percentage": "vs",
    "guarantee vs percent": "vs",
    "guarantee versus percent": "vs",
    door: "door",
    "door deal": "door",
};

const PERCENTAGE_BASIS_LOOKUP: Record<string, string> = {
    gross: "gross",
    "gross box office": "gross",
    "gross receipts": "gross",
    net: "net",
    "net after expenses": "net",
    "net box office": "net",
};

const RECOUP_TREATMENT_LOOKUP: Record<string, RecoupCapTreatment> = {
    inside_expense_cap: "inside_expense_cap",
    "inside expense cap": "inside_expense_cap",
    "within expense cap": "inside_expense_cap",
    outside_expense_cap: "outside_expense_cap",
    "outside expense cap": "outside_expense_cap",
    "separate from expense cap": "outside_expense_cap",
    unknown: "unknown",
};

const DEAL_TERM_SCHEMA = {
    type: "object",
    additionalProperties: false,
    required: [
        "dealType",
        "guaranteeAmount",
        "percentage",
        "percentageBasis",
        "expenseCap",
        "hospitalityCap",
        "bonusThresholds",
        "recoupLineItems",
        "ambiguities",
    ],
    properties: {
        dealType: extractedFieldSchema({
            type: ["string", "null"],
            enum: [
                "flat",
                "percentage_of_gross",
                "percentage_of_net",
                "vs",
                "door",
                null,
            ],
        }),
        guaranteeAmount: extractedFieldSchema({ type: ["number", "null"] }),
        percentage: extractedFieldSchema({
            type: ["number", "null"],
            description: "Decimal percentage, e.g. 0.8 for 80%.",
        }),
        percentageBasis: extractedFieldSchema({
            type: ["string", "null"],
            enum: ["gross", "net", null],
        }),
        expenseCap: extractedFieldSchema({ type: ["number", "null"] }),
        hospitalityCap: extractedFieldSchema({ type: ["number", "null"] }),
        bonusThresholds: {
            type: "array",
            items: {
                type: "object",
                additionalProperties: false,
                required: ["value", "confidence", "sourceQuote"],
                properties: {
                    value: {
                        type: "object",
                        additionalProperties: false,
                        required: [
                            "id",
                            "label",
                            "triggerType",
                            "amount",
                            "threshold",
                        ],
                        properties: {
                            id: { type: "string" },
                            label: { type: "string" },
                            triggerType: {
                                type: "string",
                                enum: [
                                    "gross_threshold",
                                    "sellout",
                                    "attendance_threshold",
                                    "tier_ratchet",
                                    "other",
                                ],
                                description:
                                    "Use gross_threshold only for fixed bonus amounts triggered by gross. Use other for walkout pots, breakeven, and incremental-gross clauses.",
                            },
                            amount: { type: ["number", "null"] },
                            threshold: { type: ["number", "null"] },
                        },
                    },
                    confidence: confidenceSchema(),
                    sourceQuote: { type: ["string", "null"] },
                },
            },
        },
        recoupLineItems: {
            type: "array",
            items: {
                type: "object",
                additionalProperties: false,
                required: ["value", "confidence", "sourceQuote"],
                properties: {
                    value: {
                        type: "object",
                        additionalProperties: false,
                        required: [
                            "id",
                            "description",
                            "amount",
                            "capTreatment",
                        ],
                        properties: {
                            id: { type: "string" },
                            description: { type: "string" },
                            amount: { type: ["number", "null"] },
                            capTreatment: {
                                type: "string",
                                enum: [
                                    "inside_expense_cap",
                                    "outside_expense_cap",
                                    "unknown",
                                ],
                            },
                        },
                    },
                    confidence: confidenceSchema(),
                    sourceQuote: { type: ["string", "null"] },
                },
            },
        },
        ambiguities: {
            type: "array",
            items: {
                type: "object",
                additionalProperties: false,
                required: [
                    "id",
                    "field",
                    "question",
                    "sourceQuote",
                    "interpretations",
                ],
                properties: {
                    id: { type: "string" },
                    field: { type: "string" },
                    question: { type: "string" },
                    sourceQuote: { type: ["string", "null"] },
                    interpretations: {
                        type: "array",
                        minItems: 2,
                        items: {
                            type: "object",
                            additionalProperties: false,
                            required: [
                                "id",
                                "label",
                                "description",
                                "recoupCapTreatment",
                                "confidence",
                            ],
                            properties: {
                                id: { type: "string" },
                                label: { type: "string" },
                                description: { type: "string" },
                                recoupCapTreatment: {
                                    type: ["string", "null"],
                                    enum: [
                                        "inside_expense_cap",
                                        "outside_expense_cap",
                                        "unknown",
                                        null,
                                    ],
                                },
                                confidence: confidenceSchema(),
                            },
                        },
                    },
                },
            },
        },
    },
} as const;

type DraftOptions = {
    forceMock?: boolean;
};

function extractedFieldSchema(valueSchema: Record<string, unknown>) {
    return {
        type: "object",
        additionalProperties: false,
        required: ["value", "confidence", "sourceQuote"],
        properties: {
            value: valueSchema,
            confidence: confidenceSchema(),
            sourceQuote: { type: ["string", "null"] },
        },
    };
}

function confidenceSchema() {
    return {
        type: "number",
        minimum: 0,
        maximum: 1,
    };
}

export async function getInterpretationDraft(
    showId: string,
    notes: string,
    options: DraftOptions = {}
): Promise<InterpretationDraft | MissingInterpretation> {
    const fixture = getInterpretationFixture(showId);
    if (options.forceMock) {
        if (fixture) return normalizeDraft(fixture);
        return {
            mode: "missing_api_key",
            message:
                "No deterministic mock extraction exists for this show. Mock extraction is available for show_0001, show_0007, and show_coastal_spell_dispute.",
        };
    }

    if (fixture && !process.env.OPENAI_API_KEY) {
        return normalizeDraft(fixture);
    }

    if (!process.env.OPENAI_API_KEY) {
        return {
            mode: "missing_api_key",
            message:
                "AI extraction is not configured for this show. Mock extraction is available for show_0001, show_0007, and show_coastal_spell_dispute.",
        };
    }

    return extractDealTermsWithOpenAI(notes);
}

function normalizeDraft(draft: InterpretationDraft): InterpretationDraft {
    return {
        ...draft,
        extraction: normalizeExtraction(draft.extraction),
    };
}

export function compareExtractedToStructured(
    extraction: ExtractedDealTerms,
    deal: Deal
): Divergence[] {
    const divergences: Divergence[] = [];

    addFieldDivergence(
        divergences,
        "dealType",
        extraction.dealType,
        deal.dealType
    );
    addFieldDivergence(
        divergences,
        "guaranteeAmount",
        extraction.guaranteeAmount,
        deal.guaranteeAmount
    );
    addFieldDivergence(
        divergences,
        "percentage",
        extraction.percentage,
        deal.percentage
    );
    addFieldDivergence(
        divergences,
        "percentageBasis",
        extraction.percentageBasis,
        deal.percentageBasis
    );
    addFieldDivergence(
        divergences,
        "expenseCap",
        extraction.expenseCap,
        deal.expenseCap
    );
    addFieldDivergence(
        divergences,
        "hospitalityCap",
        extraction.hospitalityCap,
        deal.hospitalityCap
    );

    divergences.push(
        ...compareBonusThresholds(extraction.bonusThresholds, deal)
    );

    for (const recoup of extraction.recoupLineItems) {
        divergences.push({
            id: `recoup_${recoup.id}`,
            field: "recoupLineItems",
            label: "Recoup term",
            proseValue: `${recoup.description}${
                recoup.amount != null
                    ? ` (${formatFieldValue("guaranteeAmount", recoup.amount)})`
                    : ""
            }`,
            structuredValue: "No comparable structured deal clause captured.",
            sourceQuote: recoup.sourceQuote ?? SOURCE_QUOTE_PLACEHOLDER,
            severity:
                recoup.capTreatment === "unknown" ? "critical" : "warning",
        });
    }

    return divergences;
}

export function computeAmbiguityImpacts(
    ambiguities: DealAmbiguity[],
    extraction: ExtractedDealTerms,
    data: ShowWithRelations
): AmbiguityImpact[] {
    return ambiguities.map((ambiguity) => {
        const options = ambiguity.interpretations.map((interpretation) =>
            computeImpactOption(ambiguity, interpretation.id, extraction, data)
        );

        const numeric = options
            .map((option) => option.payout)
            .filter((payout): payout is number => payout != null);

        return {
            ambiguityId: ambiguity.id,
            sourceQuote: ambiguity.sourceQuote,
            options,
            delta:
                numeric.length >= 2
                    ? Math.max(...numeric) - Math.min(...numeric)
                    : null,
            supportState:
                numeric.length >= 2
                    ? "computed"
                    : extraction.dealType.value === "vs"
                    ? "unsupported_deal_type"
                    : "insufficient_data",
        };
    });
}

export function summarizeStructuredDeal(deal: Deal) {
    return {
        dealType: deal.dealType,
        guaranteeAmount: deal.guaranteeAmount,
        percentage: deal.percentage,
        percentageBasis: deal.percentageBasis,
        expenseCap: deal.expenseCap,
        hospitalityCap: deal.hospitalityCap,
        bonusesJson: deal.bonusesJson,
    };
}

function addFieldDivergence<T>(
    divergences: Divergence[],
    field: keyof Pick<
        ExtractedDealTerms,
        | "dealType"
        | "guaranteeAmount"
        | "percentage"
        | "percentageBasis"
        | "expenseCap"
        | "hospitalityCap"
    >,
    extracted: {
        value: T | null;
        sourceQuote: string | null;
        confidence: number;
    },
    structured: T | null
) {
    if (extracted.value == null) return;
    if (valuesEqual(field, extracted.value, structured)) return;

    divergences.push({
        id: field,
        field,
        label: FIELD_LABELS[field],
        proseValue: formatFieldValue(field, extracted.value),
        structuredValue: formatFieldValue(field, structured),
        sourceQuote: extracted.sourceQuote ?? SOURCE_QUOTE_PLACEHOLDER,
        severity:
            field === "dealType" || field === "percentage"
                ? "critical"
                : "warning",
    });
}

function compareBonusThresholds(
    extractedBonuses: ExtractedBonusThreshold[],
    deal: Deal
): Divergence[] {
    const structured = parseBonuses(deal);
    const divergences: Divergence[] = [];

    for (const extracted of extractedBonuses) {
        if (
            extracted.triggerType !== "gross_threshold" ||
            typeof extracted.threshold !== "number"
        ) {
            continue;
        }

        const match = structured.find((bonus) => {
            if (bonus.type !== "gross_threshold") return false;
            if (
                typeof extracted.amount === "number" &&
                bonus.amount === extracted.amount
            ) {
                return true;
            }
            return extracted.label
                .toLowerCase()
                .includes(String(bonus.amount).toLowerCase());
        });

        if (!match) {
            divergences.push({
                id: `bonus_${extracted.id}`,
                field: "bonusThresholds",
                label: "Bonus threshold",
                proseValue: extracted.label,
                structuredValue: "Missing from bonuses_json",
                sourceQuote: extracted.sourceQuote ?? SOURCE_QUOTE_PLACEHOLDER,
                severity: "warning",
            });
            continue;
        }

        if (
            match.type === "gross_threshold" &&
            match.threshold !== extracted.threshold
        ) {
            divergences.push({
                id: `bonus_${extracted.id}`,
                field: "bonusThresholds",
                label: "Bonus threshold",
                proseValue: `${extracted.label} (threshold ${formatMoney(
                    extracted.threshold
                )})`,
                structuredValue: `${match.label} (threshold ${formatMoney(
                    match.threshold
                )})`,
                sourceQuote: extracted.sourceQuote ?? SOURCE_QUOTE_PLACEHOLDER,
                severity: "critical",
            });
        }
    }

    return divergences;
}

function computeImpactOption(
    ambiguity: DealAmbiguity,
    interpretationId: string,
    extraction: ExtractedDealTerms,
    data: ShowWithRelations
): AmbiguityImpactOption {
    const interpretation = ambiguity.interpretations.find(
        (item) => item.id === interpretationId
    );
    const ambiguityQuote = ambiguity.sourceQuote ?? "";

    const recoup = extraction.recoupLineItems.find((item) => {
        const itemQuote = item.sourceQuote ?? "";
        return (
            (ambiguityQuote.length > 0 &&
                itemQuote.length > 0 &&
                (ambiguityQuote.includes(itemQuote) ||
                    itemQuote.includes(ambiguityQuote))) ||
            item.capTreatment === "unknown"
        );
    });

    const guarantee = numericValue(extraction.guaranteeAmount.value);
    const percentage = numericValue(extraction.percentage.value);
    const expenseCap = numericValue(extraction.expenseCap.value);
    const recoupAmount = numericValue(recoup?.amount ?? null);

    if (
        !isComputableRecoupTreatment(interpretation?.recoupCapTreatment) ||
        recoupAmount == null ||
        extraction.dealType.value !== "vs" ||
        guarantee == null ||
        percentage == null ||
        expenseCap == null
    ) {
        return {
            interpretationId,
            label: interpretation?.label ?? interpretationId,
            description: interpretation?.description ?? "",
            payout: null,
            formula: null,
        };
    }

    const impact = computeStandardVsRecoupPlacement({
        treatment: interpretation.recoupCapTreatment,
        gross: sumTickets(data.ticketSales, "gross"),
        fees: sumTickets(data.ticketSales, "fees"),
        passThroughExpenses: sumExpenses(data.expenses),
        guarantee,
        percentage,
        expenseCap,
        recoupAmount,
    });

    return {
        interpretationId,
        label: interpretation.label,
        description: interpretation.description,
        payout: impact.payout,
        formula: impact.formula,
    };
}

function computeStandardVsRecoupPlacement(input: {
    treatment: KnownRecoupCapTreatment;
    gross: number;
    fees: number;
    passThroughExpenses: number;
    guarantee: number;
    percentage: number;
    expenseCap: number;
    recoupAmount: number;
}) {
    const expenseDeduction = input.expenseCap;
    const recoupDeduction =
        input.treatment === "outside_expense_cap" ? input.recoupAmount : 0;
    const netBasis =
        input.gross - input.fees - recoupDeduction - expenseDeduction;
    const percentagePayout = netBasis * input.percentage;
    const payout = Math.max(input.guarantee, percentagePayout);
    const formula =
        input.treatment === "outside_expense_cap"
            ? `${formatMoney(input.gross)} gross - ${formatMoney(
                  input.fees
              )} fees - ${formatMoney(
                  input.recoupAmount
              )} recoup - ${formatMoney(
                  expenseDeduction
              )} expense cap, then × ${(input.percentage * 100).toFixed(0)}%`
            : `${formatMoney(input.gross)} gross - ${formatMoney(
                  input.fees
              )} fees - ${formatMoney(expenseDeduction)} expense cap, then × ${(
                  input.percentage * 100
              ).toFixed(0)}%`;

    return { payout: roundMoney(payout), formula };
}

async function extractDealTermsWithOpenAI(
    notes: string
): Promise<InterpretationDraft> {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const response = await client.responses.create({
        model: process.env.OPENAI_MODEL ?? DEFAULT_OPENAI_MODEL,
        reasoning: { effort: getOpenAIReasoningEffort() },
        instructions:
            "Extract structured live-music venue deal terms from prose. Do not calculate settlement payouts or dollar impact. If a clause has multiple plausible interpretations, put it in ambiguities and do not choose one.",
        text: {
            format: {
                type: "json_schema",
                name: "greenroom_deal_terms",
                strict: true,
                schema: DEAL_TERM_SCHEMA,
            },
        },
        input: JSON.stringify({
            notes,
            extractionRules:
                "Use gross_threshold only for fixed bonus dollar amounts triggered by gross. Classify walkout pots, breakeven pools, and open-ended incremental gross clauses as other unless they are genuinely ambiguous, in which case include an ambiguity. Do not put walkout pots, breakeven pools, or incremental-gross pot clauses in recoupLineItems. If the notes say a term was updated, renegotiated, or that an original/structured value is stale, extract the updated prose value as the field value; do not place it only in ambiguities unless the updated value itself is unresolved. If a recoup is described as against gross and an expense cap exists, set the recoup capTreatment to unknown and add an ambiguity with one interpretation for outside_expense_cap and one for inside_expense_cap. Treat post-dispute concessions as dispute history, not as revised deal terms, unless the prose says the clause itself was amended.",
        }),
    });

    const content = response.output_text || "{}";
    return {
        mode: "openai",
        extraction: normalizeExtraction(JSON.parse(content)),
    };
}

function getOpenAIReasoningEffort(): ReasoningEffort {
    const configured = process.env.OPENAI_REASONING_EFFORT as
        | ReasoningEffort
        | undefined;
    return configured && ALLOWED_REASONING_EFFORTS.has(configured)
        ? configured
        : DEFAULT_OPENAI_REASONING_EFFORT;
}

export function normalizeExtraction(raw: unknown): ExtractedDealTerms {
    const obj = asRecord(raw);
    const extraction = {
        dealType: normalizeField(obj.dealType, normalizeDealType),
        guaranteeAmount: normalizeField(obj.guaranteeAmount, coerceNumber),
        percentage: normalizeField(obj.percentage, coercePercentage),
        percentageBasis: normalizeField(
            obj.percentageBasis,
            normalizePercentageBasis
        ),
        expenseCap: normalizeField(obj.expenseCap, coerceNumber),
        hospitalityCap: normalizeField(obj.hospitalityCap, coerceNumber),
        bonusThresholds: Array.isArray(obj.bonusThresholds)
            ? obj.bonusThresholds.map(normalizeBonusThreshold)
            : [],
        recoupLineItems: Array.isArray(obj.recoupLineItems)
            ? obj.recoupLineItems.map(normalizeRecoupLineItem)
            : [],
        ambiguities: Array.isArray(obj.ambiguities)
            ? obj.ambiguities.map(normalizeAmbiguity)
            : [],
    };

    return normalizeDerivedExtraction(extraction);
}

function normalizeDerivedExtraction(
    extraction: ExtractedDealTerms
): ExtractedDealTerms {
    let bonusThresholds = extraction.bonusThresholds;
    let ambiguities = extraction.ambiguities.filter(
        (ambiguity) =>
            !isSchemaClassificationAmbiguity(ambiguity) &&
            !isWalkoutRecoupPlacementAmbiguity(ambiguity)
    );
    const recoupLineItems = extraction.recoupLineItems.filter(
        (recoup) =>
            !isWalkoutPotText(
                `${recoup.description} ${recoup.sourceQuote ?? ""}`
            )
    );

    for (const ambiguity of ambiguities) {
        const updatedThreshold = extractUpdatedBonusThreshold(ambiguity);
        if (updatedThreshold == null) continue;

        let applied = false;
        bonusThresholds = bonusThresholds.map((bonus) => {
            if (
                bonus.triggerType === "gross_threshold" &&
                bonus.threshold === updatedThreshold
            ) {
                applied = true;
                return {
                    ...bonus,
                    label: replaceLastMoneyValue(bonus.label, updatedThreshold),
                    sourceQuote: ambiguity.sourceQuote ?? bonus.sourceQuote,
                };
            }

            if (
                applied ||
                bonus.triggerType !== "gross_threshold" ||
                typeof bonus.threshold !== "number" ||
                bonus.threshold === updatedThreshold
            ) {
                return bonus;
            }

            applied = true;
            return {
                ...bonus,
                label: replaceLastMoneyValue(bonus.label, updatedThreshold),
                threshold: updatedThreshold,
                sourceQuote: ambiguity.sourceQuote ?? bonus.sourceQuote,
            };
        });

        if (applied) {
            ambiguities = ambiguities.filter(
                (candidate) => candidate.id !== ambiguity.id
            );
        }
    }

    return {
        ...extraction,
        bonusThresholds: dedupeBonusThresholds(bonusThresholds),
        recoupLineItems,
        ambiguities,
    };
}

function dedupeBonusThresholds(bonuses: ExtractedBonusThreshold[]) {
    const seen = new Map<string, ExtractedBonusThreshold>();

    for (const bonus of bonuses) {
        const key = [
            bonus.triggerType,
            bonus.amount ?? "none",
            bonus.threshold ?? "none",
            bonus.label.toLowerCase(),
        ].join("|");
        const existing = seen.get(key);
        if (!existing || bonus.confidence > existing.confidence) {
            seen.set(key, bonus);
        }
    }

    return [...seen.values()];
}

function extractUpdatedBonusThreshold(ambiguity: DealAmbiguity) {
    const text = [
        ambiguity.field,
        ambiguity.question,
        ambiguity.sourceQuote,
        ...ambiguity.interpretations.flatMap((item) => [
            item.label,
            item.description,
        ]),
    ]
        .filter(Boolean)
        .join(" ");

    if (!/bonus/i.test(text) || !/threshold/i.test(text)) return null;
    if (
        !/(updated|renegotiated|changed|dropped|lowered|raised|revised)/i.test(
            text
        )
    ) {
        return null;
    }

    const toMatches = [...text.matchAll(/\bto\s+\$([0-9][0-9,]*(?:\.\d+)?)/gi)];
    const toMatch =
        toMatches.at(-1) ??
        text.match(
            /(?:updated|renegotiated|changed|dropped|lowered|raised|revised)[^$]{0,160}\$([0-9][0-9,]*(?:\.\d+)?)/i
        );
    if (!toMatch) return null;

    const parsed = Number(toMatch[1].replace(/,/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
}

function isSchemaClassificationAmbiguity(ambiguity: DealAmbiguity) {
    const text = [
        ambiguity.field,
        ambiguity.question,
        ambiguity.sourceQuote,
        ...ambiguity.interpretations.flatMap((item) => [
            item.label,
            item.description,
        ]),
    ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

    return (
        text.includes("classify") &&
        text.includes("walkout") &&
        text.includes("gross_threshold") &&
        text.includes("other")
    );
}

function isWalkoutRecoupPlacementAmbiguity(ambiguity: DealAmbiguity) {
    const text = [
        ambiguity.field,
        ambiguity.question,
        ambiguity.sourceQuote,
        ...ambiguity.interpretations.flatMap((item) => [
            item.label,
            item.description,
        ]),
    ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

    return isWalkoutPotText(text) && text.includes("recoup");
}

function isWalkoutPotText(text: string) {
    const lower = text.toLowerCase();
    return (
        lower.includes("walkout pot") ||
        (lower.includes("incremental gross") &&
            lower.includes("goes to artist"))
    );
}

function replaceLastMoneyValue(text: string, amount: number) {
    const matches = [...text.matchAll(/\$[0-9][0-9,]*(?:\.\d+)?/g)];
    const last = matches.at(-1);
    if (!last || last.index == null) return text;
    return `${text.slice(0, last.index)}${formatMoney(amount)}${text.slice(
        last.index + last[0].length
    )}`;
}

function normalizeField<T>(
    raw: unknown,
    normalizeValue: (value: unknown) => T | null
): ExtractedField<T> {
    if (raw && typeof raw === "object" && "value" in raw) {
        const field = raw as Record<string, unknown>;
        return {
            value: normalizeValue(field.value),
            confidence: confidenceValue(field.confidence),
            sourceQuote: stringOrNull(field.sourceQuote),
        };
    }
    return {
        value: normalizeValue(raw),
        confidence: 0,
        sourceQuote: null,
    };
}

function normalizeBonusThreshold(
    raw: unknown,
    index: number
): ExtractedBonusThreshold {
    const item = asRecord(raw);
    const value = asRecord("value" in item ? item.value : item);
    return {
        id: stringValue(value.id, `bonus_${index + 1}`),
        label: stringValue(value.label, `Bonus ${index + 1}`),
        triggerType: stringValue(value.triggerType, "other"),
        amount: coerceNumber(value.amount),
        threshold: coerceNumber(value.threshold),
        sourceQuote: stringOrNull(item.sourceQuote ?? value.sourceQuote),
        confidence: confidenceValue(item.confidence ?? value.confidence),
    };
}

function normalizeRecoupLineItem(raw: unknown, index: number) {
    const item = asRecord(raw);
    const value = asRecord("value" in item ? item.value : item);
    return {
        id: stringValue(value.id, `recoup_${index + 1}`),
        description: stringValue(value.description, `Recoup ${index + 1}`),
        amount: coerceNumber(value.amount),
        capTreatment: normalizeRecoupTreatment(value.capTreatment),
        sourceQuote: stringOrNull(item.sourceQuote ?? value.sourceQuote),
        confidence: confidenceValue(item.confidence ?? value.confidence),
    };
}

function normalizeAmbiguity(raw: unknown, index: number): DealAmbiguity {
    const item = asRecord(raw);
    const interpretations = Array.isArray(item.interpretations)
        ? item.interpretations.map(normalizeAmbiguityInterpretation)
        : [];

    return {
        id: stringValue(item.id, `ambiguity_${index + 1}`),
        field: stringValue(item.field, "unknown"),
        question: stringValue(item.question, "Ambiguous deal clause"),
        sourceQuote: stringOrNull(item.sourceQuote),
        interpretations,
    };
}

function normalizeAmbiguityInterpretation(raw: unknown, index: number) {
    const item = asRecord(raw);
    return {
        id: stringValue(item.id, `interpretation_${index + 1}`),
        label: stringValue(item.label, `Interpretation ${index + 1}`),
        description: stringValue(item.description, ""),
        recoupCapTreatment:
            item.recoupCapTreatment == null
                ? null
                : normalizeRecoupTreatment(item.recoupCapTreatment),
        confidence: confidenceValue(item.confidence),
    };
}

function normalizeDealType(value: unknown) {
    if (value == null) return null;
    if (typeof value !== "string") return value as string;
    return lookupCanonical(value, DEAL_TYPE_LOOKUP);
}

function normalizePercentageBasis(value: unknown) {
    if (value == null) return null;
    if (typeof value !== "string") return value as string;
    return lookupCanonical(value, PERCENTAGE_BASIS_LOOKUP);
}

function normalizeRecoupTreatment(value: unknown): RecoupCapTreatment {
    if (value == null) return "unknown";
    if (typeof value !== "string") return "unknown";
    return lookupCanonical(value, RECOUP_TREATMENT_LOOKUP);
}

function lookupCanonical<T extends string>(
    value: string,
    lookup: Record<string, T>
) {
    const key = value.trim().toLowerCase();
    return lookup[key] ?? value;
}

function coerceNumber(value: unknown): NumericExtractionValue | null {
    if (value == null || value === "") return null;
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    if (typeof value !== "string") return value as string;
    const cleaned = value.trim().replace(/[$,]/g, "");
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : value;
}

function coercePercentage(value: unknown): NumericExtractionValue | null {
    if (value == null || value === "") return null;
    if (typeof value === "number") {
        if (!Number.isFinite(value)) return null;
        return value > 1 && value <= 100 ? value / 100 : value;
    }
    if (typeof value !== "string") return value as string;
    const cleaned = value.trim().replace("%", "");
    const parsed = Number(cleaned);
    if (!Number.isFinite(parsed)) return value;
    return value.includes("%") || parsed > 1 ? parsed / 100 : parsed;
}

function confidenceValue(value: unknown) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) return parsed;
    }
    return 0;
}

function stringValue(value: unknown, fallback: string) {
    return typeof value === "string" && value.length > 0 ? value : fallback;
}

function stringOrNull(value: unknown) {
    return typeof value === "string" && value.length > 0 ? value : null;
}

function asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === "object"
        ? (value as Record<string, unknown>)
        : {};
}

function valuesEqual(field: string, left: unknown, right: unknown) {
    if (left == null && right == null) return true;
    if (left == null || right == null) return false;
    if (field === "percentage")
        return Math.abs(Number(left) - Number(right)) < 0.001;
    if (typeof left === "number" || typeof right === "number") {
        return Math.abs(Number(left) - Number(right)) < 0.01;
    }
    return String(left) === String(right);
}

function formatFieldValue(field: string, value: unknown) {
    if (value == null) return "—";
    if (field === "dealType")
        return DEAL_LABELS[String(value)] ?? String(value);
    if (field === "percentage") {
        const numeric = Number(value);
        return Number.isFinite(numeric)
            ? `${(numeric * 100).toFixed(0)}%`
            : String(value);
    }
    if (
        field === "guaranteeAmount" ||
        field === "expenseCap" ||
        field === "hospitalityCap"
    ) {
        const numeric = Number(value);
        return Number.isFinite(numeric) ? formatMoney(numeric) : String(value);
    }
    return String(value);
}

function sumTickets(rows: TicketSale[], field: "gross" | "fees") {
    return rows.reduce((sum, row) => sum + row[field], 0);
}

function sumExpenses(rows: Expense[]) {
    return rows
        .filter((row) => !row.absorbedByVenue)
        .reduce((sum, row) => sum + row.amount, 0);
}

function formatMoney(amount: number) {
    return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0,
    }).format(amount);
}

function roundMoney(amount: number) {
    return Math.round(amount);
}

function numericValue(value: NumericExtractionValue | null) {
    return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isComputableRecoupTreatment(
    treatment: string | null | undefined
): treatment is KnownRecoupCapTreatment {
    return (
        treatment === "inside_expense_cap" ||
        treatment === "outside_expense_cap"
    );
}
