import Link from "next/link";
import { notFound } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  Brain,
  CheckCircle2,
  GitCompareArrows,
  Quote,
  ShieldCheck,
} from "lucide-react";
import { getShowById, getSettlementInterpretationById, getLatestSettlementInterpretation } from "@/lib/queries";
import {
  compareExtractedToStructured,
  computeAmbiguityImpacts,
  getInterpretationDraft,
  SOURCE_QUOTE_PLACEHOLDER,
  summarizeStructuredDeal,
} from "@/lib/interpretation";
import { formatMoney, formatShowDateFull } from "@/lib/format";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Field,
} from "@/components/ui/card";
import { DealTypeBadge, PlainBadge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { confirmInterpretationAction } from "./actions";
import { calculateSettlement } from "@/lib/dealMath";
import type { Deal } from "@/db/schema";
import type {
  AmbiguityImpact,
  Divergence,
  ExtractedDealTerms,
  NumericExtractionValue,
  SavedAmbiguityResolution,
  SavedDivergenceResolution,
} from "@/lib/interpretation-types";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ artifact?: string; mock?: string }>;
};

export default async function InterpretPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const query = (await searchParams) ?? {};
  const data = await getShowById(id);
  if (!data) notFound();

  const { show, artist, deal, settlement } = data;
  if (!deal) {
    return (
      <div className="px-12 py-10 max-w-4xl">
        <BackLink showId={show.id} />
        <div className="text-[13px] text-ink-400">
          No deal entered for this show. There is no prose to interpret yet.
        </div>
      </div>
    );
  }

  const saved = query.artifact
    ? await getSettlementInterpretationById(query.artifact)
    : query.mock === "1"
      ? null
      : await getLatestSettlementInterpretation(show.id);

  if (saved) {
    return <SharedArtifact data={data} interpretation={saved} />;
  }

  const draft = await getInterpretationDraft(show.id, deal.dealNotesFreetext ?? "", {
    forceMock: query.mock === "1",
  });

  return (
    <div className="px-12 py-10 max-w-7xl">
      <BackLink showId={show.id} />

      <div className="mb-10 flex items-start justify-between gap-6">
        <div>
          <div className="flex items-center gap-1.5 mb-4">
            <StatusBadge status={show.status} />
            <DealTypeBadge type={deal.dealType} />
            {settlement?.status === "disputed" && (
              <PlainBadge variant="rose">Disputed settlement</PlainBadge>
            )}
          </div>
          <h1
            className="font-display text-[48px] font-medium text-ink-900 leading-[1.05]"
            style={{ fontOpticalSizing: "auto" }}
          >
            Interpret deal · {artist?.name}
          </h1>
          <div className="text-[14px] text-ink-400 mt-3">
            {formatShowDateFull(show.date)}
          </div>
        </div>
        {"mode" in draft && draft.mode !== "missing_api_key" && (
          <PlainBadge
            variant={draft.mode === "fixture" ? "amber" : "brand"}
            className="mt-2 px-3 py-1 text-[12px] font-semibold shadow-sm shadow-brand-700/10"
          >
            {draft.mode === "fixture" ? "Fixture extraction" : "AI extraction"}
          </PlainBadge>
        )}
      </div>

      {"message" in draft ? (
        <Card accent="amber">
          <CardHeader>
            <CardTitle>API key required</CardTitle>
            <CardDescription>{draft.message}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-[13px] text-ink-600 leading-relaxed">
              The deterministic mock flow is available for{" "}
              <code>show_0001</code>, <code>show_0007</code>, and{" "}
              <code>show_coastal_spell_dispute</code>.
            </p>
          </CardContent>
        </Card>
      ) : (
        <InterpretationForm
          data={data}
          extraction={draft.extraction}
          mode={draft.mode}
        />
      )}
    </div>
  );
}

function InterpretationForm({
  data,
  extraction,
  mode,
}: {
  data: NonNullable<Awaited<ReturnType<typeof getShowById>>>;
  extraction: ExtractedDealTerms;
  mode: "fixture" | "openai";
}) {
  const { show, deal } = data;
  const divergences = compareExtractedToStructured(extraction, deal!);
  const ambiguityImpacts = computeAmbiguityImpacts(
    extraction.ambiguities,
    extraction,
    data,
  );
  const structuredSnapshot = summarizeStructuredDeal(deal!);

  return (
    <form action={confirmInterpretationAction} className="space-y-8">
      <input type="hidden" name="showId" value={show.id} />
      <input type="hidden" name="extraction" value={JSON.stringify(extraction)} />
      <input
        type="hidden"
        name="divergences"
        value={JSON.stringify(divergences)}
      />
      <input
        type="hidden"
        name="ambiguityImpacts"
        value={JSON.stringify(ambiguityImpacts)}
      />
      <input
        type="hidden"
        name="structuredSnapshot"
        value={JSON.stringify(structuredSnapshot)}
      />

      <StepCard
        step="1"
        title="Parse"
        icon={Brain}
        description="AI extracts terms from the prose. It does not calculate payout."
      >
        <div className="mb-5 rounded-lg bg-canvas-soft ring-1 ring-ink-200/60 p-4">
          <div className="eyebrow text-[10px] text-ink-500 mb-2">
            Deal notes source
          </div>
          <p className="text-[13px] text-ink-800 leading-relaxed">
            {deal?.dealNotesFreetext ?? "No prose notes."}
          </p>
        </div>
        <ParsedTerms extraction={extraction} />
        {mode === "openai" && (
          <div className="mt-4 text-[11.5px] text-ink-400">
            Live AI extraction captured the deal terms. Payout math below is computed by Greenroom.
          </div>
        )}
      </StepCard>

      <StepCard
        step="2"
        title="Compare"
        icon={GitCompareArrows}
        description="Mariana reviews every place the prose and structured fields disagree."
      >
        {divergences.length === 0 ? (
          <EmptyState text="No structured-field divergences detected." />
        ) : (
          <div className="space-y-3">
            {divergences.map((divergence) => (
              <DivergenceChoice key={divergence.id} divergence={divergence} />
            ))}
          </div>
        )}
      </StepCard>

      <StepCard
        step="3"
        title="Ambiguity"
        icon={AlertTriangle}
        description="If the prose can be read more than one way, the artifact shows both interpretations and any reliable dollar impact."
      >
        {extraction.ambiguities.length === 0 ? (
          <EmptyState text="No unresolved ambiguities returned by extraction." />
        ) : (
          <div className="space-y-4">
            {extraction.ambiguities.map((ambiguity) => (
              <AmbiguityChoice
                key={ambiguity.id}
                ambiguity={ambiguity}
                impact={ambiguityImpacts.find(
                  (item) => item.ambiguityId === ambiguity.id,
                )}
              />
            ))}
          </div>
        )}
      </StepCard>

      <StepCard
        step="4"
        title="Confirm"
        icon={ShieldCheck}
        description="This saves a versioned audit record. The original deals row is not changed."
      >
        <div className="flex items-center justify-between gap-4">
          <p className="text-[13px] text-ink-600 leading-relaxed max-w-2xl">
            AI proposes the interpretation; Mariana confirms it. The saved
            record keeps the original structured fields, the prose extraction,
            and every selected resolution.
          </p>
          <Button variant="brand" size="lg" type="submit">
            <CheckCircle2 className="h-4 w-4" />
            Confirm interpretation
          </Button>
        </div>
      </StepCard>
    </form>
  );
}

function SharedArtifact({
  data,
  interpretation,
}: {
  data: NonNullable<Awaited<ReturnType<typeof getShowById>>>;
  interpretation: NonNullable<
    Awaited<ReturnType<typeof getLatestSettlementInterpretation>>
  >;
}) {
  const { show, artist, deal, ticketSales, expenses } = data;
  const confirmed = JSON.parse(interpretation.confirmedDealTermsJson) as {
    extraction: ExtractedDealTerms;
  };
  const divergences = JSON.parse(
    interpretation.divergenceLogJson,
  ) as SavedDivergenceResolution[];
  const ambiguityResolutions = JSON.parse(
    interpretation.ambiguityResolutionsJson,
  ) as SavedAmbiguityResolution[];
  const extraction = confirmed.extraction;
  const confirmedDeal = deal
    ? buildConfirmedDeal(deal, extraction, divergences)
    : null;
  const ambiguityOverlay = buildAmbiguityOverlay(
    extraction,
    ambiguityResolutions,
    interpretation.confirmedBy,
  );
  const calc = confirmedDeal
    ? calculateSettlement({
        deal: confirmedDeal,
        ticketSales,
        expenses,
        venueCapacity: data.venue?.capacity ?? undefined,
        additionalAllowableExpenses: ambiguityOverlay.additionalAllowableExpenses,
        grossDeductions: ambiguityOverlay.grossDeductions,
      })
    : null;

  return (
    <div className="px-12 py-10 max-w-7xl">
      <BackLink showId={show.id} />
      <div className="mb-10 flex items-start justify-between gap-6">
        <div>
          <div className="eyebrow mb-3">Shared settlement artifact</div>
          <h1
            className="font-display text-[48px] font-medium text-ink-900 leading-[1.05]"
            style={{ fontOpticalSizing: "auto" }}
          >
            {artist?.name} · confirmed deal interpretation
          </h1>
          <div className="text-[14px] text-ink-400 mt-3">
            Confirmed by {interpretation.confirmedBy} on{" "}
            {new Date(interpretation.confirmedAt).toLocaleString("en-US", {
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })}
          </div>
        </div>
        <PlainBadge variant="brand">Audit record saved</PlainBadge>
      </div>

      {calc?.supported ? (
        <SettlementHeadline calc={calc} />
      ) : (
        <div className="mb-6 rounded-lg border border-amber-200/70 bg-amber-50/50 p-5 flex gap-3">
          <AlertTriangle className="h-4 w-4 text-amber-700 mt-0.5 shrink-0" />
          <div>
            <div className="text-[13px] font-semibold text-amber-900">
              Interpretation confirmed. Existing calculator does not support
              this deal type yet.
            </div>
            <p className="text-[12.5px] text-ink-600 mt-1 leading-relaxed">
              The artifact can still show the confirmed terms, source clauses,
              and resolved ambiguity impact without overwriting the original
              structured deal.
            </p>
            {calc && !calc.supported && (
              <p className="text-[12.5px] text-ink-500 mt-1">{calc.reason}</p>
            )}
          </div>
        </div>
      )}

      {calc?.supported && (
        <SettlementWorksheet
          calc={calc}
          ambiguitySummaries={ambiguityOverlay.summaries}
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
        <Card accent="brand">
          <CardHeader>
            <div>
              <CardTitle>Confirmed terms with source clauses</CardTitle>
              <CardDescription>
                Built from the prose. Each line keeps the clause it came from.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="divide-y divide-ink-100/80">
            <ArtifactLine
              label="Deal type"
              value={formatDealType(extraction.dealType.value)}
              quote={extraction.dealType.sourceQuote}
            />
            <ArtifactLine
              label="Guarantee"
              value={formatMaybeMoney(extraction.guaranteeAmount.value)}
              quote={extraction.guaranteeAmount.sourceQuote}
            />
            <ArtifactLine
              label="Percentage"
              value={formatPercentage(extraction.percentage.value)}
              quote={extraction.percentage.sourceQuote}
            />
            <ArtifactLine
              label="Expense cap"
              value={formatMaybeMoney(extraction.expenseCap.value)}
              quote={extraction.expenseCap.sourceQuote}
            />
            <ArtifactLine
              label="Hospitality cap"
              value={formatMaybeMoney(extraction.hospitalityCap.value)}
              quote={extraction.hospitalityCap.sourceQuote}
            />
            {extraction.bonusThresholds.map((bonus) => (
              <ArtifactLine
                key={bonus.id}
                label="Bonus"
                value={bonus.label}
                quote={bonus.sourceQuote}
              />
            ))}
            {extraction.recoupLineItems.map((recoup) => (
              <ArtifactLine
                key={recoup.id}
                label="Recoup"
                value={`${recoup.description}${recoup.amount != null ? ` · ${formatMaybeMoney(recoup.amount)}` : ""}`}
                quote={recoup.sourceQuote}
              />
            ))}
          </CardContent>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Actuals used for review</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Field
                label="Gross"
                mono
                value={formatMoney(ticketSales.reduce((s, t) => s + t.gross, 0))}
              />
              <Field
                label="Fees"
                mono
                value={formatMoney(ticketSales.reduce((s, t) => s + t.fees, 0))}
              />
              <Field
                label="Passed-through expenses"
                mono
                value={formatMoney(
                  expenses
                    .filter((e) => !e.absorbedByVenue)
                    .reduce((s, e) => s + e.amount, 0),
                )}
              />
              {data.settlement?.totalToArtist != null && (
                <Field
                  label="Logged settlement"
                  mono
                  value={formatMoney(data.settlement.totalToArtist)}
                />
              )}
            </CardContent>
          </Card>

          {ambiguityResolutions.length > 0 && (
            <Card accent="amber">
              <CardHeader>
                <CardTitle>Resolved ambiguity</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {ambiguityResolutions.map((resolution) => {
                  const summary = ambiguityOverlay.summaries.find(
                    (item) => item.ambiguityId === resolution.ambiguityId,
                  );
                  return (
                    <div key={resolution.ambiguityId}>
                      <QuoteBlock quote={resolution.sourceQuote} />
                      <div className="text-[13px] font-medium text-ink-900 mt-3">
                        {resolution.chosenLabel}
                      </div>
                      <p className="text-[12px] text-ink-500 leading-relaxed mt-1">
                        {resolution.chosenDescription}
                      </p>
                      {summary && (
                        <div className="mt-3 rounded-lg bg-brand-50/60 ring-1 ring-brand-200/70 p-3 text-[12px] text-brand-900 leading-relaxed">
                          {summary.description}
                        </div>
                      )}
                      {resolution.chosenPayout != null && (
                        <div className="mt-3 rounded-lg bg-white ring-1 ring-ink-200/60 p-3">
                          <div className="eyebrow text-[10px] text-ink-400 mb-1">
                            Impact of selected read
                          </div>
                          <div className="font-mono tabular text-[20px] font-semibold text-ink-900">
                            {formatMoney(resolution.chosenPayout)}
                          </div>
                          {resolution.payoutDelta != null && (
                            <div className="text-[11.5px] text-ink-500 mt-1">
                              {formatMoney(resolution.payoutDelta)} difference
                              between interpretations.
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {divergences.length > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Confirmed divergences</CardTitle>
            <CardDescription>
              The original structured fields were left unchanged.
            </CardDescription>
          </CardHeader>
          <CardContent className="divide-y divide-ink-100/80">
            {divergences.map((divergence) => (
              <div
                key={divergence.id}
                className="py-3 grid grid-cols-[160px_1fr_auto] gap-4 items-start"
              >
                <div className="text-[12px] font-medium text-ink-900">
                  {divergence.label}
                </div>
                <div className="text-[12px] text-ink-500 leading-relaxed">
                  Prose:{" "}
                  <span className="text-ink-900">{divergence.proseValue}</span>
                  <span className="text-ink-300"> · </span>
                  Structured:{" "}
                  <span className="text-ink-900">
                    {divergence.structuredValue}
                  </span>
                </div>
                <PlainBadge
                  variant={
                    divergence.selectedSource === "prose" ? "brand" : "default"
                  }
                >
                  {divergence.selectedSource === "prose"
                    ? "Used prose"
                    : "Kept structured"}
                </PlainBadge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {deal?.dealNotesFreetext && (
        <div className="mt-6 rounded-lg border border-amber-200/80 bg-amber-50/35 px-5 py-4 shadow-sm shadow-amber-700/5">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-amber-800 ring-1 ring-amber-200/80">
              <Quote className="h-4 w-4" />
            </div>
            <div>
              <div className="eyebrow mb-2 text-[10px] text-amber-800">
                Source notes
              </div>
              <p className="text-[13px] font-medium leading-relaxed text-ink-800">
                {deal.dealNotesFreetext}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

type SupportedCalculation = Extract<
  ReturnType<typeof calculateSettlement>,
  { supported: true }
>;

type AmbiguityOverlay = {
  additionalAllowableExpenses: { label: string; amount: number; note?: string }[];
  grossDeductions: { label: string; amount: number; note?: string }[];
  summaries: { ambiguityId: string; description: string }[];
};

function SettlementHeadline({ calc }: { calc: SupportedCalculation }) {
  return (
    <div className="mb-5 rounded-lg border border-brand-200/70 bg-brand-50/35 px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="eyebrow mb-1 text-[10px] text-brand-700">
            Confirmed settlement
          </div>
          <div className="text-[13px] font-medium text-ink-600">
            Artist takes home
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="font-mono tabular text-[30px] font-semibold leading-none text-ink-900">
            {formatMoney(calc.totalToArtist)}
          </div>
          <PlainBadge variant="brand">From confirmed terms</PlainBadge>
        </div>
      </div>
    </div>
  );
}

function SettlementWorksheet({
  calc,
  ambiguitySummaries,
}: {
  calc: SupportedCalculation;
  ambiguitySummaries: AmbiguityOverlay["summaries"];
}) {
  return (
    <Card accent="brand" className="mb-6">
      <CardHeader>
        <div>
          <CardTitle>Settlement worksheet</CardTitle>
          <CardDescription className="font-mono">
            {calc.finalFormula}
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="divide-y divide-ink-100/80">
        {calc.steps.map((step, index) => (
          <WorksheetRow
            key={`${step.label}-${index}`}
            label={step.label}
            value={step.value}
            note={step.note}
            emphasized={index === calc.steps.length - 1}
          />
        ))}
        {ambiguitySummaries.length > 0 && (
          <div className="py-3 space-y-2">
            {ambiguitySummaries.map((summary) => (
              <div
                key={summary.ambiguityId}
                className="rounded-lg bg-amber-50/70 px-3 py-2 text-[12px] leading-relaxed text-amber-900 ring-1 ring-amber-200/80"
              >
                {summary.description}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function WorksheetRow({
  label,
  value,
  note,
  emphasized,
}: {
  label: string;
  value: number;
  note?: string;
  emphasized?: boolean;
}) {
  return (
    <div
      className={`flex items-start justify-between gap-4 py-3 ${
        emphasized ? "font-semibold" : ""
      }`}
    >
      <div>
        <div
          className={`text-[13px] ${
            emphasized ? "text-ink-900" : "text-ink-600"
          }`}
        >
          {label}
        </div>
        {note && (
          <div className="mt-0.5 text-[11.5px] leading-relaxed text-ink-400">
            {note}
          </div>
        )}
      </div>
      <div
        className={`shrink-0 font-mono tabular ${
          emphasized
            ? "text-[18px] text-ink-900"
            : value < 0
              ? "text-[13px] text-rose-700"
              : "text-[13px] text-ink-900"
        }`}
      >
        {formatMoney(value)}
      </div>
    </div>
  );
}

function buildConfirmedDeal(
  deal: Deal,
  extraction: ExtractedDealTerms,
  divergences: SavedDivergenceResolution[],
): Deal {
  return {
    ...deal,
    dealType: selectedStructured(divergences, "dealType")
      ? deal.dealType
      : dealTypeValue(extraction.dealType.value, deal.dealType),
    guaranteeAmount: selectedStructured(divergences, "guaranteeAmount")
      ? deal.guaranteeAmount
      : numericOrFallback(extraction.guaranteeAmount.value, deal.guaranteeAmount),
    percentage: selectedStructured(divergences, "percentage")
      ? deal.percentage
      : numericOrFallback(extraction.percentage.value, deal.percentage),
    percentageBasis: selectedStructured(divergences, "percentageBasis")
      ? deal.percentageBasis
      : percentageBasisValue(
          extraction.percentageBasis.value,
          deal.percentageBasis,
        ),
    expenseCap: selectedStructured(divergences, "expenseCap")
      ? deal.expenseCap
      : numericOrFallback(extraction.expenseCap.value, deal.expenseCap),
    hospitalityCap: selectedStructured(divergences, "hospitalityCap")
      ? deal.hospitalityCap
      : numericOrFallback(extraction.hospitalityCap.value, deal.hospitalityCap),
  };
}

function buildAmbiguityOverlay(
  extraction: ExtractedDealTerms,
  resolutions: SavedAmbiguityResolution[],
  confirmedBy: string,
): AmbiguityOverlay {
  const overlay: AmbiguityOverlay = {
    additionalAllowableExpenses: [],
    grossDeductions: [],
    summaries: [],
  };

  for (const resolution of resolutions) {
    const treatment = recoupTreatmentFromResolution(resolution);
    if (!treatment) continue;

    const recoup = findRecoupForResolution(extraction, resolution);
    const amount = numericOnly(recoup?.amount ?? null);
    if (amount == null) continue;

    const recoupLabel = recoup?.description ?? "Confirmed recoup";
    if (treatment === "outside") {
      overlay.grossDeductions.push({
        label: `${recoupLabel} outside expense cap`,
        amount,
        note: `treated as outside the expense cap per ${confirmedBy}`,
      });
      overlay.summaries.push({
        ambiguityId: resolution.ambiguityId,
        description: `${recoupLabel} treated as outside the expense cap per your confirmation.`,
      });
    } else {
      overlay.additionalAllowableExpenses.push({
        label: `${recoupLabel} inside expense cap`,
        amount,
        note: `treated as inside the expense cap per ${confirmedBy}`,
      });
      overlay.summaries.push({
        ambiguityId: resolution.ambiguityId,
        description: `${recoupLabel} treated as inside the expense cap per your confirmation.`,
      });
    }
  }

  return overlay;
}

function selectedStructured(
  divergences: SavedDivergenceResolution[],
  field: string,
) {
  return divergences.some(
    (divergence) =>
      divergence.field === field && divergence.selectedSource === "structured",
  );
}

function dealTypeValue(value: string | null, fallback: Deal["dealType"]) {
  return value === "flat" ||
    value === "percentage_of_gross" ||
    value === "percentage_of_net" ||
    value === "vs" ||
    value === "door"
    ? value
    : fallback;
}

function percentageBasisValue(
  value: string | null,
  fallback: Deal["percentageBasis"],
) {
  return value === "gross" || value === "net" ? value : fallback;
}

function numericOrFallback(
  value: NumericExtractionValue | null,
  fallback: number | null,
) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function numericOnly(value: NumericExtractionValue | null) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function recoupTreatmentFromResolution(resolution: SavedAmbiguityResolution) {
  const text = [
    resolution.chosenInterpretationId,
    resolution.chosenLabel,
    resolution.chosenDescription,
  ]
    .join(" ")
    .toLowerCase();

  if (text.includes("outside") && text.includes("cap")) return "outside";
  if (text.includes("inside") && text.includes("cap")) return "inside";
  return null;
}

function findRecoupForResolution(
  extraction: ExtractedDealTerms,
  resolution: SavedAmbiguityResolution,
) {
  return (
    extraction.recoupLineItems.find((recoup) =>
      quotesOverlap(recoup.sourceQuote, resolution.sourceQuote),
    ) ??
    extraction.recoupLineItems.find((recoup) => recoup.capTreatment === "unknown") ??
    extraction.recoupLineItems[0]
  );
}

function quotesOverlap(left: string | null, right: string | null) {
  if (!left || !right) return false;
  return left.includes(right) || right.includes(left);
}

function StepCard({
  step,
  title,
  description,
  icon: Icon,
  children,
}: {
  step: string;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex gap-3">
          <div className="w-8 h-8 rounded-lg bg-brand-50 ring-1 ring-brand-200/60 flex items-center justify-center text-brand-700 shrink-0">
            <Icon className="h-4 w-4" />
          </div>
          <div>
            <div className="eyebrow text-[10px] text-brand-700 mb-1">
              Step {step}
            </div>
            <CardTitle>{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function ParsedTerms({ extraction }: { extraction: ExtractedDealTerms }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <Field label="Deal type" value={formatDealType(extraction.dealType.value)} />
      <Field
        label="Guarantee"
        mono
        value={formatMaybeMoney(extraction.guaranteeAmount.value)}
      />
      <Field
        label="Percentage"
        mono
        value={`${formatPercentage(extraction.percentage.value)} ${extraction.percentageBasis.value ?? ""}`}
      />
      <Field
        label="Expense cap"
        mono
        value={formatMaybeMoney(extraction.expenseCap.value)}
      />
      <Field
        label="Hospitality cap"
        mono
        value={formatMaybeMoney(extraction.hospitalityCap.value)}
      />
      <Field
        label="Bonuses"
        value={String(extraction.bonusThresholds.length)}
        mono
      />
      <Field
        label="Recoups"
        value={String(extraction.recoupLineItems.length)}
        mono
      />
      <Field
        label="Ambiguities"
        value={String(extraction.ambiguities.length)}
        mono
      />
    </div>
  );
}

function DivergenceChoice({ divergence }: { divergence: Divergence }) {
  return (
    <div className="rounded-lg border border-ink-200/70 bg-white p-4">
      <div className="flex items-start justify-between gap-4 mb-3">
        <div>
          <div className="text-[13px] font-semibold text-ink-900">
            {divergence.label}
          </div>
          {divergence.sourceQuote && (
            <QuoteBlock quote={divergence.sourceQuote} className="mt-2" />
          )}
        </div>
        <PlainBadge
          variant={divergence.severity === "critical" ? "rose" : "amber"}
        >
          {divergence.severity}
        </PlainBadge>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="block rounded-lg ring-1 ring-brand-200/70 bg-brand-50/25 p-3 cursor-pointer">
          <div className="flex gap-2">
            <input
              type="radio"
              name={`divergence_${divergence.id}`}
              value="prose"
              defaultChecked
              className="mt-1"
            />
            <div>
              <div className="eyebrow text-[10px] text-brand-700 mb-1">
                Prose says
              </div>
              <div className="text-[13px] text-ink-900">
                {divergence.proseValue}
              </div>
            </div>
          </div>
        </label>
        <label className="block rounded-lg ring-1 ring-ink-200/70 bg-canvas-soft p-3 cursor-pointer">
          <div className="flex gap-2">
            <input
              type="radio"
              name={`divergence_${divergence.id}`}
              value="structured"
              className="mt-1"
            />
            <div>
              <div className="eyebrow text-[10px] text-ink-500 mb-1">
                Structured field says
              </div>
              <div className="text-[13px] text-ink-900">
                {divergence.structuredValue}
              </div>
            </div>
          </div>
        </label>
      </div>
    </div>
  );
}

function AmbiguityChoice({
  ambiguity,
  impact,
}: {
  ambiguity: ExtractedDealTerms["ambiguities"][number];
  impact?: AmbiguityImpact;
}) {
  return (
    <div className="rounded-lg border border-amber-200/70 bg-amber-50/20 p-4">
      <div className="text-[13px] font-semibold text-ink-900">
        {ambiguity.question}
      </div>
      <QuoteBlock quote={ambiguity.sourceQuote} className="mt-2" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
        {ambiguity.interpretations.map((interpretation) => {
          const option = impact?.options.find(
            (candidate) => candidate.interpretationId === interpretation.id,
          );
          return (
            <label
              key={interpretation.id}
              className="block rounded-lg ring-1 ring-ink-200/70 bg-white p-3 cursor-pointer"
            >
              <div className="flex gap-2">
                <input
                  type="radio"
                  name={`ambiguity_${ambiguity.id}`}
                  value={interpretation.id}
                  required
                  className="mt-1"
                />
                <div>
                  <div className="text-[13px] font-medium text-ink-900">
                    {interpretation.label}
                  </div>
                  <p className="text-[12px] text-ink-500 leading-relaxed mt-1">
                    {interpretation.description}
                  </p>
                  {option?.payout != null ? (
                    <div className="mt-3 rounded-md bg-canvas-soft ring-1 ring-ink-200/60 p-2">
                      <div className="eyebrow text-[9px] text-ink-400">
                        App-code impact
                      </div>
                      <div className="text-[16px] font-mono tabular font-semibold text-ink-900 mt-1">
                        {formatMoney(option.payout)}
                      </div>
                      {option.formula && (
                        <div className="text-[10.5px] text-ink-500 leading-snug mt-1">
                          {option.formula}
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>
              </div>
            </label>
          );
        })}
      </div>
      {impact?.delta != null && (
        <div className="mt-3 text-[12px] text-amber-800 font-medium">
          Payout delta between interpretations: {formatMoney(impact.delta)}
        </div>
      )}
      {impact && impact.supportState !== "computed" && (
        <div className="mt-3 text-[12px] text-ink-500">
          Interpretation can be confirmed, but the existing calculator cannot
          reliably compute this deal type yet.
        </div>
      )}
    </div>
  );
}

function ArtifactLine({
  label,
  value,
  quote,
}: {
  label: string;
  value: React.ReactNode;
  quote: string | null;
}) {
  return (
    <div className="py-3 grid grid-cols-[160px_1fr] gap-4 items-start">
      <div className="text-[12px] font-medium text-ink-900">{label}</div>
      <div>
        <div className="text-[13px] text-ink-900">{value}</div>
        {quote && <QuoteBlock quote={quote} className="mt-2" />}
      </div>
    </div>
  );
}

function QuoteBlock({
  quote,
  className,
}: {
  quote: string | null;
  className?: string;
}) {
  return (
    <div
      className={`inline-flex items-start gap-1.5 rounded-md bg-amber-50 px-2 py-1 text-[11.5px] text-amber-900 ring-1 ring-amber-200/70 ${className ?? ""}`}
    >
      <Quote className="h-3 w-3 mt-0.5 shrink-0" />
      <span>{quote ?? SOURCE_QUOTE_PLACEHOLDER}</span>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-ink-200/60 bg-canvas-soft p-4 text-[13px] text-ink-500">
      {text}
    </div>
  );
}

function BackLink({ showId }: { showId: string }) {
  return (
    <Link
      href={`/shows/${showId}/settle`}
      className="inline-flex items-center gap-1 text-[12px] text-ink-400 hover:text-ink-900 mb-8 transition-colors"
    >
      <ArrowLeft className="h-3.5 w-3.5" /> Back to settlement
    </Link>
  );
}

function formatDealType(type: string | null) {
  const labels: Record<string, string> = {
    flat: "Flat",
    percentage_of_gross: "% of gross",
    percentage_of_net: "% of net",
    vs: "Vs deal",
    door: "Door deal",
  };
  return type ? (labels[type] ?? type) : "—";
}

function formatMaybeMoney(value: NumericExtractionValue | null) {
  if (value == null) return "—";
  return typeof value === "number" ? formatMoney(value) : String(value);
}

function formatPercentage(value: NumericExtractionValue | null) {
  if (value == null) return "—";
  return typeof value === "number" ? `${(value * 100).toFixed(0)}%` : String(value);
}
