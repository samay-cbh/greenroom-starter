import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  FileWarning,
  ArrowRight,
  Check,
  AlertTriangle,
  ClipboardList,
  Info,
  Mail,
  Pencil,
  Sparkles,
  XCircle,
  Wallet,
  TrendingUp,
} from "lucide-react";
import { getShowById } from "@/lib/queries";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  Field,
} from "@/components/ui/card";
import { StatusBadge, DealTypeBadge, PlainBadge } from "@/components/ui/badge";
import { calculateSettlement } from "@/lib/dealMath";
import {
  getBlockerPresentation,
  resolveSettlementBlocker,
} from "@/lib/settlementBlocker";
import {
  formatMoney,
  formatShowDateFull,
} from "@/lib/format";
import type { Settlement, Recoup } from "@/db/schema";
import { Logomark } from "@/components/brand/logo";
import {
  flipRecoupCapScope,
  getMarketingRecoup,
  parseDealTermsJson,
  recoupInterpretationsCollapse,
  type CalculationRecord,
  type CapStatus,
  type LineSource,
} from "@/lib/dealTerms";
import { db } from "@/db";
import { settlements } from "@/db/schema";
import { eq } from "drizzle-orm";

const RECOUP_LABELS: Record<Recoup["category"], string> = {
  marketing: "Marketing",
  hospitality_overage: "Hospitality overage",
  production_overage: "Production overage",
  prior_advance: "Prior advance",
  damages: "Damages",
  other: "Other",
};

export default async function SettlePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getShowById(id);
  if (!data) notFound();

  const { show, artist, deal, ticketSales, expenses, settlement, recoups } =
    data;

  if (!deal) {
    return (
      <div className="px-12 py-10 max-w-4xl">
        <BackLink showId={show.id} />
        <div className="text-[13px] text-ink-400">
          No deal entered for this show. Settlement can&apos;t run yet.
        </div>
      </div>
    );
  }

  const confirmedTerms = parseDealTermsJson(deal.dealTermsJson);
  const termsParseFailed = Boolean(deal.dealTermsJson) && !confirmedTerms;

  const calc = calculateSettlement({
    deal,
    ticketSales,
    expenses,
    venueCapacity: data.venue?.capacity ?? undefined,
    confirmedTerms: confirmedTerms ?? undefined,
  });

  // Counterfactual: when the deal has a marketing recoup, also calculate
  // what the total WOULD have been under the opposite cap_scope. The F2
  // statement surfaces the delta so the audit trail makes the choice's
  // impact explicit — and so cases where the cap absorbs both reads don't
  // mislead the reader into thinking the choice was unimportant.
  let altTotalToArtist: number | null = null;
  if (
    calc.supported &&
    calc.calculationRecord &&
    confirmedTerms &&
    getMarketingRecoup(confirmedTerms)
  ) {
    const altCalc = calculateSettlement({
      deal,
      ticketSales,
      expenses,
      venueCapacity: data.venue?.capacity ?? undefined,
      confirmedTerms: flipRecoupCapScope(confirmedTerms),
    });
    if (altCalc.supported) altTotalToArtist = altCalc.totalToArtist;
  }

  // Persist calculation_json on the existing settlement record when the
  // engine produces an auditable record. Idempotent: same inputs produce
  // the same record body (modulo `calculatedAt`, which is intentional —
  // see CalculationRecord.version). We only UPDATE; creating a new
  // settlement row pulls in lifecycle/timestamp logic out of scope here.
  if (calc.supported && calc.calculationRecord && settlement?.id) {
    const nextJson = JSON.stringify(calc.calculationRecord);
    // why: the engine sets `calculatedAt = new Date().toISOString()` on every
    // run, so a naïve JSON-equality check would mark every render as dirty
    // and issue an UPDATE on every page load. Compare structural fingerprints
    // (everything except calculatedAt) so we only write when inputs/output
    // actually changed. Persisted JSON still carries calculatedAt as the
    // most-recent computation timestamp.
    const fingerprint = (json: string | null): string | null => {
      if (!json) return null;
      try {
        const { calculatedAt: _ignored, ...rest } = JSON.parse(json);
        return JSON.stringify(rest);
      } catch {
        return json;
      }
    };
    if (fingerprint(settlement.calculationJson) !== fingerprint(nextJson)) {
      try {
        await db
          .update(settlements)
          .set({ calculationJson: nextJson })
          .where(eq(settlements.id, settlement.id));
      } catch {
        // Non-fatal: the page still renders the calculation; persistence is
        // best-effort for the prototype.
      }
    }
  }
  const grossSoFar = ticketSales.reduce((sum, t) => sum + t.gross, 0);
  const totalFees = ticketSales.reduce((sum, t) => sum + t.fees, 0);
  const totalExpenses = expenses
    .filter((e) => !e.absorbedByVenue)
    .reduce((sum, e) => sum + e.amount, 0);

  const disputedRecoups = recoups.filter((r) => r.status === "disputed");
  const isDisputed = settlement?.status === "disputed" || settlement?.status === "revised" || !!settlement?.disputedAt;
  const disputedRecoupValue = disputedRecoups.reduce((s, r) => s + r.amount, 0);

  return (
    <div className={`px-12 py-10 max-w-7xl ${isDisputed ? "bg-gradient-to-b from-rose-50/30 via-canvas to-canvas" : ""}`}>
      <BackLink showId={show.id} />

      <div className="mb-20">
        <div className="flex items-center gap-1.5 mb-4">
          <StatusBadge status={show.status} />
          <DealTypeBadge type={deal.dealType} />
          {settlement?.status === "disputed" && (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10.5px] font-medium ring-1 ring-inset bg-rose-50 text-rose-800 ring-rose-200/80">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-rose-500" />
              </span>
              Disputed
            </span>
          )}
          {settlement?.status === "voided" && (
            <PlainBadge variant="default">Voided</PlainBadge>
          )}
        </div>
        <h1 className="font-display text-[48px] font-medium text-ink-900 leading-[1.05]" style={{ letterSpacing: "-0.02em", fontOpticalSizing: "auto" }}>
          Settlement · {artist?.name}
        </h1>
        <div className="text-[14px] text-ink-400 mt-3">
          {formatShowDateFull(show.date)}
        </div>
      </div>

      {/* Disputed callout */}
      {isDisputed && disputedRecoupValue > 0 && (
        <div className="mb-8 rounded-lg border border-rose-200/60 bg-rose-50/40 p-5 flex gap-3">
          <AlertTriangle className="h-4 w-4 text-rose-700 mt-0.5 shrink-0" />
          <div>
            <div className="text-[13px] font-semibold text-rose-800">
              {disputedRecoups.length} recoup{disputedRecoups.length === 1 ? "" : "s"} in dispute · {formatMoney(disputedRecoupValue)} contested
            </div>
            <p className="text-[12.5px] text-ink-600 mt-1 leading-relaxed">
              The artist team has flagged recoup line items. This settlement cannot be finalized until the dispute is resolved.
            </p>
          </div>
        </div>
      )}

      {settlement && (
        <LifecycleBar settlement={settlement} disputedRecoups={disputedRecoups.length} />
      )}

      <div className="space-y-6 mt-6">
        {!calc.supported ? (
          <SettlementBlocked
            calc={calc}
            deal={deal}
            termsParseFailed={termsParseFailed}
            existingSettlement={settlement}
            grossSoFar={grossSoFar}
            totalFees={totalFees}
            totalExpenses={totalExpenses}
            ticketCount={ticketSales.reduce((s, t) => s + (t.qty ?? 0), 0)}
            expenseRowCount={expenses.length}
          />
        ) : (
          <SupportedSettlement
            calc={calc}
            existingSettlement={settlement}
            showId={show.id}
            altTotalToArtist={altTotalToArtist ?? undefined}
          />
        )}

        {recoups.length > 0 && <RecoupsSection recoups={recoups} />}

        {settlement && (settlement.signoffText || settlement.notes) && (
          <SignoffSection settlement={settlement} />
        )}
      </div>

      <div className="mt-16 pt-10 border-t border-ink-200/60">
        <div className="flex gap-4 items-start max-w-3xl">
          <Logomark size={40} className="shrink-0" />
          <div>
            <h2 className="font-display text-[20px] font-medium text-ink-900 mb-2" style={{ letterSpacing: "-0.02em" }}>
              You&apos;re looking at the seam this case study is about.
            </h2>
            <p className="text-[13px] text-ink-500 leading-relaxed">
              Greenroom&apos;s in-app settlement tool was built early in the
              company&apos;s history, when most deals were flat guarantees.
              About 18% of customers actively use it; the other 82% — including
              most of the larger venues — default to spreadsheets. The CEO has
              flagged this as the company&apos;s biggest craft gap.{" "}
              <Link
                href="/context"
                className="text-brand-700 font-medium hover:text-brand-800 hover:underline inline-flex items-center gap-0.5"
              >
                Where to start <ArrowRight className="h-3 w-3" />
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function BackLink({ showId }: { showId: string }) {
  return (
    <Link
      href={`/shows/${showId}`}
      className="inline-flex items-center gap-1 text-[12px] text-ink-400 hover:text-ink-900 mb-8 transition-colors"
    >
      <ArrowLeft className="h-3.5 w-3.5" /> Back to show
    </Link>
  );
}

type Stage = {
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  timestamp?: Date | null;
};

function LifecycleBar({
  settlement,
  disputedRecoups,
}: {
  settlement: Settlement;
  disputedRecoups: number;
}) {
  if (settlement.status === "voided") {
    return (
      <div className="rounded-lg border border-ink-200/80 bg-white px-5 py-4 flex items-center gap-3">
        <XCircle className="h-4 w-4 text-ink-400" />
        <div>
          <div className="text-[13px] font-medium text-ink-900">
            Settlement voided
          </div>
          <div className="text-[11.5px] text-ink-400 mt-0.5">
            The show was cancelled or the settlement was scrapped.
          </div>
        </div>
      </div>
    );
  }

  const stages: Stage[] = [
    {
      key: "draft",
      label: "Drafted",
      icon: Pencil,
      timestamp: settlement.draftedAt,
    },
    {
      key: "submitted",
      label: "Submitted",
      icon: Mail,
      timestamp: settlement.submittedAt,
    },
    {
      key: "review",
      label: "Reviewed",
      icon: TrendingUp,
      timestamp: settlement.reviewStartedAt,
    },
    {
      key: "signed",
      label: settlement.disputedAt ? "Finalized" : "Signed",
      icon: Check,
      timestamp: settlement.finalizedAt ?? settlement.signedAt,
    },
    {
      key: "paid",
      label: "Paid",
      icon: Wallet,
      timestamp: settlement.paidAt,
    },
  ];

  const currentIndex = (() => {
    switch (settlement.status) {
      case "draft":
        return 0;
      case "submitted":
        return 1;
      case "in_review":
        return 2;
      case "disputed":
      case "signed":
      case "revised":
      case "finalized":
        return 3;
      case "paid":
        return 4;
      default:
        return 0;
    }
  })();

  const isDisputed =
    settlement.status === "disputed" ||
    settlement.status === "revised" ||
    !!settlement.disputedAt;

  return (
    <Card>
      <CardContent className="py-5">
        <div className="flex items-center justify-between mb-4">
          <div className="eyebrow text-[10px] text-ink-400">
            Settlement lifecycle
          </div>
          {isDisputed && (
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-rose-700">
              <AlertTriangle className="h-3 w-3" />
              {settlement.status === "disputed"
                ? "In dispute"
                : settlement.status === "revised"
                  ? "Revision sent"
                  : "Resolved after dispute"}
              {disputedRecoups > 0 && (
                <span className="text-rose-600">
                  · {disputedRecoups} disputed recoup
                  {disputedRecoups === 1 ? "" : "s"}
                </span>
              )}
            </div>
          )}
        </div>

        <div className="grid grid-cols-5 gap-1 relative">
          <div className="absolute top-3.5 left-[10%] right-[10%] h-px bg-ink-200/60" />

          {stages.map((stage, i) => {
            const isComplete = i < currentIndex;
            const isCurrent = i === currentIndex;
            const isFuture = i > currentIndex;
            const Icon = stage.icon;

            const stageDot = (() => {
              if (isComplete) {
                return "bg-brand-700 ring-brand-700 text-white";
              }
              if (isCurrent) {
                return isDisputed
                  ? "bg-rose-50 ring-rose-500 text-rose-700"
                  : "bg-brand-50 ring-brand-700 text-brand-700";
              }
              return "bg-white ring-ink-200/80 text-ink-300";
            })();

            return (
              <div
                key={stage.key}
                className="flex flex-col items-center text-center"
              >
                <div
                  className={`relative z-10 w-7 h-7 rounded-full ring-2 flex items-center justify-center ${stageDot}`}
                >
                  <Icon className="h-3.5 w-3.5" />
                </div>
                <div
                  className={`mt-2.5 text-[11px] font-medium leading-tight ${
                    isFuture ? "text-ink-300" : "text-ink-900"
                  }`}
                >
                  {stage.label}
                </div>
                <div className="text-[10px] text-ink-400 mt-0.5 font-mono tabular leading-tight min-h-[12px]">
                  {stage.timestamp
                    ? new Date(stage.timestamp).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })
                    : ""}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function SettlementBlocked({
  calc,
  deal,
  termsParseFailed,
  existingSettlement,
  grossSoFar,
  totalFees,
  totalExpenses,
  ticketCount,
  expenseRowCount,
}: {
  calc: Extract<ReturnType<typeof calculateSettlement>, { supported: false }>;
  deal: NonNullable<NonNullable<Awaited<ReturnType<typeof getShowById>>>["deal"]>;
  termsParseFailed: boolean;
  existingSettlement: NonNullable<
    Awaited<ReturnType<typeof getShowById>>
  >["settlement"];
  grossSoFar: number;
  totalFees: number;
  totalExpenses: number;
  ticketCount: number;
  expenseRowCount: number;
}) {
  const blocker = resolveSettlementBlocker(calc, { termsParseFailed });
  const hasSignedSettlement = Boolean(
    existingSettlement?.signedAt ||
      existingSettlement?.status === "signed" ||
      existingSettlement?.status === "finalized" ||
      existingSettlement?.status === "paid",
  );
  const ui = getBlockerPresentation(blocker, {
    dealType: calc.dealType,
    showId: deal.showId,
    reason: calc.reason,
    hasSignedSettlement,
  });

  const iconWrap =
    ui.accent === "brand"
      ? "bg-brand-50 ring-brand-200/80"
      : ui.accent === "rose"
        ? "bg-rose-50 ring-rose-200/80"
        : "bg-amber-50 ring-amber-200/80";
  const iconColor =
    ui.accent === "brand"
      ? "text-brand-700"
      : ui.accent === "rose"
        ? "text-rose-700"
        : "text-amber-700";

  const BlockerIcon =
    ui.icon === "confirm"
      ? ClipboardList
      : ui.icon === "error"
        ? XCircle
        : FileWarning;

  return (
    <>
      <Card accent={ui.accent}>
        <CardContent className="py-10 px-6 sm:px-10">
          <div className="flex flex-col sm:flex-row sm:items-start gap-6">
            <div
              className={`inline-flex h-12 w-12 items-center justify-center rounded-full ring-1 shrink-0 ${iconWrap}`}
            >
              <BlockerIcon className={`h-5 w-5 ${iconColor}`} />
            </div>
            <div className="min-w-0 flex-1">
              <h2
                className="font-display text-[22px] font-medium text-ink-900 leading-snug"
                style={{ letterSpacing: "-0.02em" }}
              >
                {ui.title}
              </h2>
              <p className="text-[13px] text-ink-500 mt-2 max-w-2xl leading-relaxed">
                {ui.description}
              </p>
              {ui.detail && (
                <p className="text-[12.5px] text-ink-600 mt-3 rounded-lg bg-canvas-soft px-3 py-2.5 ring-1 ring-ink-200/60 max-w-2xl leading-relaxed">
                  {ui.detail}
                </p>
              )}
              {(ui.primaryAction || ui.secondaryAction) && (
                <div className="mt-5 flex flex-wrap items-center gap-3">
                  {ui.primaryAction && (
                    <Link
                      href={ui.primaryAction.href}
                      className={
                        ui.accent === "brand"
                          ? "inline-flex items-center gap-1.5 h-9 px-4 rounded-lg text-[13px] font-medium bg-brand-700 text-white hover:bg-brand-800 shadow-sm shadow-brand-700/15 ring-1 ring-inset ring-brand-800/20 transition-colors"
                          : "inline-flex items-center gap-1.5 h-9 px-4 rounded-lg text-[13px] font-medium bg-ink-900 text-white hover:bg-ink-800 ring-1 ring-inset ring-ink-900/20 transition-colors"
                      }
                    >
                      {ui.primaryAction.label}
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  )}
                  {ui.secondaryAction && (
                    <Link
                      href={ui.secondaryAction.href}
                      className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg text-[13px] font-medium text-ink-700 bg-white hover:bg-canvas-soft ring-1 ring-ink-200/80 transition-colors"
                    >
                      {ui.secondaryAction.label}
                    </Link>
                  )}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>{ui.inputsHeading}</CardTitle>
            <CardDescription>{ui.inputsDescription}</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            <Field
              label="Gross box office"
              mono
              value={formatMoney(grossSoFar)}
            />
            <Field label="Fees" mono value={formatMoney(totalFees)} />
            <Field
              label="Net box office"
              mono
              value={formatMoney(grossSoFar - totalFees)}
            />
          </div>

          <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-5">
            <Field label="Tickets sold" mono value={String(ticketCount)} />
            <Field
              label="Expenses (line items)"
              mono
              value={String(expenseRowCount)}
            />
            <Field
              label="Expenses (passed through)"
              mono
              value={formatMoney(totalExpenses)}
            />
          </div>

          {deal?.dealNotesFreetext && (
            <div className="mt-6">
              <div className="eyebrow text-[10px] text-ink-500 mb-2">
                Deal notes (free text — what Mariana actually trusts)
              </div>
              <div className="text-[12.5px] text-ink-800 bg-canvas-soft rounded-lg p-4 ring-1 ring-ink-200/60 leading-relaxed">
                {deal.dealNotesFreetext}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {existingSettlement?.totalToArtist != null && (
        <Card
          accent={existingSettlement.status === "disputed" ? "rose" : "brand"}
        >
          <CardHeader>
            <div>
              <CardTitle>{ui.offPlatformTitle}</CardTitle>
              <CardDescription>{ui.offPlatformDescription}</CardDescription>
            </div>
            {existingSettlement.status === "disputed" ? (
              <PlainBadge variant="rose">Disputed</PlainBadge>
            ) : (
              <PlainBadge variant="brand">Signed</PlainBadge>
            )}
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline justify-between py-2">
              <span className="text-[13px] text-ink-600">Total to artist</span>
              <span className="text-[32px] font-mono tabular font-semibold text-ink-900" style={{ letterSpacing: "-0.02em" }}>
                {formatMoney(existingSettlement.totalToArtist)}
              </span>
            </div>
          </CardContent>
        </Card>
      )}
    </>
  );
}

function SupportedSettlement({
  calc,
  existingSettlement,
  showId,
  altTotalToArtist,
}: {
  calc: Extract<
    ReturnType<typeof calculateSettlement>,
    { supported: true }
  >;
  existingSettlement: NonNullable<
    Awaited<ReturnType<typeof getShowById>>
  >["settlement"];
  showId: string;
  altTotalToArtist?: number;
}) {
  const record = calc.calculationRecord;
  return (
    <>
      {/* Hero number */}
      <div className="text-center py-10 mb-2">
        <div className="eyebrow text-[10px] text-ink-400 mb-3">Total to artist</div>
        <div
          className="text-[56px] sm:text-[72px] font-mono tabular font-bold text-ink-900 leading-none"
          style={{ letterSpacing: "-0.03em" }}
        >
          {formatMoney(calc.totalToArtist)}
        </div>
        {existingSettlement && (
          <div className="mt-3">
            {existingSettlement.status === "paid" ? (
              <PlainBadge variant="brand">Paid</PlainBadge>
            ) : existingSettlement.status === "signed" ||
              existingSettlement.status === "finalized" ? (
              <PlainBadge variant="brand">Signed</PlainBadge>
            ) : existingSettlement.status === "disputed" ? (
              <PlainBadge variant="rose">Disputed</PlainBadge>
            ) : null}
          </div>
        )}
        {existingSettlement?.totalToArtist != null &&
          existingSettlement.totalToArtist !== calc.totalToArtist && (
          <div className="text-[12px] text-ink-400 mt-2">
            Originally settled at{" "}
            <span className="font-mono tabular text-ink-600">
              {formatMoney(existingSettlement.totalToArtist)}
            </span>
          </div>
        )}
      </div>

      {record ? (
        <AuditableWorksheet
          calc={calc}
          record={record}
          showId={showId}
          altTotalToArtist={altTotalToArtist}
        />
      ) : (
        <LegacyWorksheet calc={calc} />
      )}

      {calc.bonusesNotTriggered.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Bonuses not triggered</CardTitle>
            <CardDescription>
              Structured bonuses on this deal that didn&apos;t hit. Shown for
              transparency — useful when the agent asks &quot;what about that
              gross threshold bonus?&quot;
            </CardDescription>
          </CardHeader>
          <CardContent className="divide-y divide-ink-100/80">
            {calc.bonusesNotTriggered.map((b, i) => (
              <div
                key={i}
                className="py-3 flex items-baseline justify-between gap-4"
              >
                <div className="min-w-0">
                  <div className="text-[13px] text-ink-600">{b.label}</div>
                  <div className="text-[11.5px] text-ink-400 mt-0.5">
                    {b.reason}
                  </div>
                </div>
                <div className="text-[12.5px] text-ink-300 font-mono tabular line-through">
                  {formatMoney(b.amount)}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </>
  );
}

/**
 * Pre-F1 worksheet — used by flat and percentage_of_gross. Unchanged.
 */
function LegacyWorksheet({
  calc,
}: {
  calc: Extract<ReturnType<typeof calculateSettlement>, { supported: true }>;
}) {
  return (
    <Card accent="brand">
      <CardHeader>
        <div>
          <CardTitle>Settlement worksheet</CardTitle>
          <CardDescription className="font-mono">
            {calc.finalFormula}
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="divide-y divide-ink-100/80">
        <Row
          label="Gross box office"
          value={formatMoney(calc.grossBoxOffice)}
        />
        <Row label="Net box office" value={formatMoney(calc.netBoxOffice)} />
        <Row
          label="Total expenses (passed through)"
          value={formatMoney(calc.totalExpenses)}
        />
        <div className="pt-3" />
        {calc.steps.map((step, i) => (
          <Row
            key={i}
            label={step.label}
            value={formatMoney(step.value)}
            note={step.note}
          />
        ))}
        <div className="pt-3" />
        <div className="flex items-baseline justify-between py-3 font-semibold">
          <span className="text-[13px] text-ink-900">Total to artist</span>
          <span className="text-[18px] font-mono tabular text-ink-900">
            {formatMoney(calc.totalToArtist)}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * F2 auditable worksheet — used by vs deals once F0 terms are confirmed.
 *
 * Each step shows its source (deal-term / POS / manual / receipt). Absorbed
 * expenses get their own section. The MAX(guarantee, share) comparison is
 * surfaced as an explicit row so the TM doesn't have to infer it.
 */
function AuditableWorksheet({
  calc,
  record,
  showId,
  altTotalToArtist,
}: {
  calc: Extract<ReturnType<typeof calculateSettlement>, { supported: true }>;
  record: CalculationRecord;
  showId: string;
  altTotalToArtist?: number;
}) {
  const absorbed = record.inputs.expenses.filter((e) => e.absorbedByVenue);
  const visibleSteps = record.steps.filter((s) => s.source !== "absorbed");
  const cmp = record.guaranteeComparison;
  // Only surface the counterfactual when it differs from the confirmed total.
  // Same-number case is handled by CapBindingNote (explains why).
  const altDiffers =
    typeof altTotalToArtist === "number" &&
    Math.abs(altTotalToArtist - calc.totalToArtist) > 0.005;
  const recoup = getMarketingRecoup(record.termsSnapshot);
  // why: altLabel describes the OTHER reading (the counterfactual). When
  // the confirmed reading is `outside_cap` ("off gross"), the alternative
  // would have been `inside_cap` ("in cap") — so the inversion is intentional.
  // Only rendered inside the `altDiffers` conditional below.
  const altLabel =
    recoup?.cap_scope === "outside_cap" ? "recoup in cap" : "recoup off gross";

  return (
    <>
      {/* Confirmed terms banner — F0 → F1 traceability anchor */}
      <Card>
        <CardContent className="py-4 px-5">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-2.5 min-w-0">
              <Sparkles className="h-3.5 w-3.5 text-brand-700 shrink-0" />
              <div className="text-[12.5px] text-ink-600 leading-snug">
                Calculated against{" "}
                <span className="font-medium text-ink-900">
                  confirmed deal terms
                </span>
                {" — "}
                <span className="font-mono tabular text-ink-500">
                  {formatMoney(record.termsSnapshot.guarantee_amount)} vs{" "}
                  {(record.termsSnapshot.artist_percent * 100).toFixed(0)}%
                </span>
                {recoup && (
                  <>
                    {", recoup "}
                    <span className="font-medium text-ink-700">
                      {recoup.cap_scope === "outside_cap" ? "off gross" : "in cap"}
                    </span>
                  </>
                )}
              </div>
            </div>
            <Link
              href={`/shows/${showId}/confirm-terms`}
              className="text-[11.5px] text-brand-700 hover:text-brand-800 hover:underline inline-flex items-center gap-0.5 shrink-0"
            >
              View terms <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <CapBindingNote record={record} />
        </CardContent>
      </Card>

      {/* Worksheet */}
      <Card accent="brand">
        <CardHeader>
          <div>
            <CardTitle>Settlement worksheet</CardTitle>
            <CardDescription className="font-mono text-[11.5px] break-all">
              {calc.finalFormula}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="divide-y divide-ink-100/80">
          {visibleSteps.map((step, i) => (
            <AuditableRow key={i} step={step} />
          ))}
          <div className="pt-3" />
          {/* Explicit guarantee comparison */}
          <div className="py-3 grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 items-baseline bg-brand-50/40 rounded-md px-3 -mx-3 ring-1 ring-brand-100/60">
            <div>
              <div className="text-[12px] text-brand-800 font-medium">
                Guarantee comparison
              </div>
              <div className="text-[11.5px] text-ink-600 mt-1 leading-snug">
                Artist share{" "}
                <span className="font-mono tabular text-ink-900">
                  {formatMoney(cmp.artistShare)}
                </span>{" "}
                vs guarantee{" "}
                <span className="font-mono tabular text-ink-900">
                  {formatMoney(cmp.guarantee)}
                </span>{" "}
                — paying the{" "}
                <span className="font-semibold text-ink-900">
                  {cmp.winner === "guarantee" ? "guarantee (floor)" : "share"}
                </span>
                .
              </div>
            </div>
            <div className="text-[13.5px] font-mono tabular text-ink-900 text-right sm:min-w-[100px]">
              {formatMoney(
                cmp.winner === "guarantee" ? cmp.guarantee : cmp.artistShare,
              )}
            </div>
          </div>
          {record.bonusesApplied.length > 0 && (
            <>
              <div className="pt-3" />
              {record.bonusesApplied.map((b, i) => (
                <AuditableRow
                  key={`bonus-${i}`}
                  step={{
                    label: b.label,
                    amount: b.amount,
                    source: "deal-term",
                    note: b.reason,
                  }}
                />
              ))}
            </>
          )}
          <div className="pt-3" />
          <div className="flex items-baseline justify-between py-3 font-semibold">
            <span className="text-[13px] text-ink-900">Total to artist</span>
            <span className="text-[18px] font-mono tabular text-ink-900">
              {formatMoney(calc.totalToArtist)}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Counterfactual: what the OTHER recoup interpretation would have paid.
          Only rendered when it differs — same-number case is handled by
          CapBindingNote inside the confirmed-terms banner. */}
      {altDiffers && typeof altTotalToArtist === "number" && (
        <Card accent="amber">
          <CardContent className="py-4 px-5 flex items-start gap-3">
            <Info className="h-4 w-4 text-amber-700 mt-0.5 shrink-0" />
            <div className="min-w-0">
              <div className="text-[12.5px] text-ink-700 leading-snug">
                If the team had picked{" "}
                <span className="font-medium text-ink-900">{altLabel}</span> at
                confirmation, the total would be{" "}
                <span className="font-mono tabular text-ink-900">
                  {formatMoney(altTotalToArtist)}
                </span>
                {" — a "}
                <span className="font-mono tabular font-semibold text-amber-800">
                  {formatMoney(Math.abs(altTotalToArtist - calc.totalToArtist))}
                </span>{" "}
                {altTotalToArtist > calc.totalToArtist ? "higher" : "lower"}{" "}
                payout. The audit record captures which reading was confirmed.
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Absorbed expenses — distinct section so they aren't silently dropped */}
      {absorbed.length > 0 && (
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Absorbed by venue</CardTitle>
              <CardDescription>
                Expenses the venue ate — not passed through to the artist
                deduction. Surfaced so they aren&apos;t invisible.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="divide-y divide-ink-100/80">
            {absorbed.map((e) => (
              <div
                key={e.id}
                className="py-2.5 flex items-baseline justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="text-[13px] text-ink-700">{e.label}</div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <SourceBadge source="absorbed" />
                  <div className="text-[13px] font-mono tabular text-ink-500 line-through min-w-[80px] text-right">
                    {formatMoney(e.amount)}
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </>
  );
}

/**
 * Honest disclosure for the auditable view: when expenses + recoup ≤ cap,
 * both recoup interpretations produce the same `totalToArtist` and the
 * "dispute" the deal-term confirmation prevents isn't visible at *this*
 * show's numbers. Surface that — silently producing the same number under
 * a different label would be the opposite of what F2 is for.
 */
function CapBindingNote({ record }: { record: CalculationRecord }) {
  if (!recoupInterpretationsCollapse(record)) return null;
  const recoup = getMarketingRecoup(record.termsSnapshot)!;
  const cap = record.termsSnapshot.expense_cap.cap_amount!;
  const nonAbsorbed = record.inputs.expenses
    .filter((e) => !e.absorbedByVenue)
    .reduce((s, e) => s + e.amount, 0);

  return (
    <div className="mt-3 pt-3 border-t border-ink-100/80 flex gap-2 items-start">
      <Info className="h-3 w-3 text-ink-400 mt-0.5 shrink-0" />
      <div className="text-[11.5px] text-ink-500 leading-snug">
        Expenses{" "}
        <span className="font-mono tabular">{formatMoney(nonAbsorbed)}</span> +
        recoup{" "}
        <span className="font-mono tabular">{formatMoney(recoup.amount)}</span>{" "}
        = <span className="font-mono tabular">{formatMoney(cap)}</span>. The
        cap doesn&apos;t bind at this show&apos;s numbers — both recoup
        interpretations produce the same total here. They diverge only when
        expenses + recoup exceed the cap; the engine still records which
        reading was confirmed so the audit trail is complete either way.
      </div>
    </div>
  );
}

function AuditableRow({
  step,
}: {
  step: CalculationRecord["steps"][number];
}) {
  return (
    <div className="py-2.5 grid grid-cols-[1fr_auto] gap-x-3 items-baseline">
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[13px] text-ink-600 leading-snug">
            {step.label}
          </span>
          {step.source !== "computed" && <SourceBadge source={step.source} />}
          {step.capStatus && <CapStatusBadge status={step.capStatus} />}
        </div>
        {step.note && (
          <div className="text-[11.5px] text-ink-400 mt-0.5 max-w-md leading-snug">
            {step.note}
          </div>
        )}
      </div>
      <div className="text-right">
        <div className="text-[13.5px] text-ink-900 font-mono tabular">
          {step.amount < 0
            ? `− ${formatMoney(-step.amount)}`
            : formatMoney(step.amount)}
        </div>
        {step.runningBalance != null && (
          <div className="text-[10.5px] text-ink-400 font-mono tabular mt-0.5">
            = {formatMoney(step.runningBalance)}
          </div>
        )}
      </div>
    </div>
  );
}

const CAP_STATUS_BADGE: Record<
  CapStatus,
  { label: string; classes: string }
> = {
  pre_cap: {
    label: "pre-cap",
    classes: "bg-ink-50 text-ink-600 ring-ink-200/80",
  },
  in_cap: {
    label: "in cap",
    classes: "bg-ink-50 text-ink-600 ring-ink-200/80",
  },
  absorbed: {
    label: "absorbed",
    classes: "bg-ink-50 text-ink-500 ring-ink-200/60",
  },
  cap_binding: {
    label: "cap binds",
    classes: "bg-amber-50 text-amber-800 ring-amber-200/80",
  },
  cap_at: {
    label: "at cap",
    classes: "bg-amber-50 text-amber-800 ring-amber-200/80",
  },
  cap_within: {
    label: "within cap",
    classes: "bg-ink-50 text-ink-600 ring-ink-200/80",
  },
};

function CapStatusBadge({ status }: { status: CapStatus }) {
  const s = CAP_STATUS_BADGE[status];
  return (
    <span
      className={`inline-flex items-center px-1.5 py-px rounded text-[9.5px] font-medium ring-1 ring-inset tracking-wide uppercase ${s.classes}`}
    >
      {s.label}
    </span>
  );
}

const SOURCE_BADGE: Record<
  LineSource,
  { label: string; classes: string }
> = {
  "deal-term": {
    label: "deal",
    classes: "bg-brand-50 text-brand-800 ring-brand-200/80",
  },
  pos: { label: "POS", classes: "bg-ink-50 text-ink-700 ring-ink-200/80" },
  receipt: {
    label: "receipt",
    classes: "bg-amber-50 text-amber-800 ring-amber-200/80",
  },
  manual: {
    label: "manual",
    classes: "bg-ink-50 text-ink-500 ring-ink-200/60",
  },
  computed: {
    label: "computed",
    classes: "bg-ink-50 text-ink-500 ring-ink-200/60",
  },
  absorbed: {
    label: "absorbed",
    classes: "bg-ink-50 text-ink-500 ring-ink-200/60",
  },
};

function SourceBadge({ source }: { source: LineSource }) {
  const s = SOURCE_BADGE[source];
  return (
    <span
      className={`inline-flex items-center px-1.5 py-px rounded text-[9.5px] font-medium ring-1 ring-inset tracking-wide uppercase ${s.classes}`}
    >
      {s.label}
    </span>
  );
}

function RecoupsSection({ recoups }: { recoups: Recoup[] }) {
  const total = recoups.reduce((s, r) => s + r.amount, 0);
  const disputedTotal = recoups
    .filter((r) => r.status === "disputed")
    .reduce((s, r) => s + r.amount, 0);
  const hasDisputed = disputedTotal > 0;

  return (
    <Card accent={hasDisputed ? "rose" : undefined}>
      <CardHeader>
        <div>
          <CardTitle>Recoups</CardTitle>
          <CardDescription>
            Venue costs taken off the top before artist payment. Often the
            disputed line items in a settlement.
          </CardDescription>
        </div>
        <PlainBadge variant={hasDisputed ? "rose" : "default"}>
          {formatMoney(total)} total
        </PlainBadge>
      </CardHeader>
      <CardContent className="divide-y divide-ink-100/80">
        {recoups.map((r) => (
          <div
            key={r.id}
            className="py-3.5 grid grid-cols-[1fr_auto_auto] items-center gap-3"
          >
            <div className="min-w-0">
              <div className="text-[13px] text-ink-900 leading-tight">
                {r.label}
              </div>
              <div className="text-[11.5px] text-ink-400 mt-0.5">
                {RECOUP_LABELS[r.category]}
              </div>
            </div>
            <div>
              {r.status === "disputed" ? (
                <PlainBadge variant="rose">Disputed</PlainBadge>
              ) : r.status === "withdrawn" ? (
                <PlainBadge variant="default">Withdrawn</PlainBadge>
              ) : (
                <PlainBadge variant="brand">Agreed</PlainBadge>
              )}
            </div>
            <div className="text-[13.5px] font-mono tabular text-ink-900 text-right min-w-[80px]">
              {formatMoney(r.amount)}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function SignoffSection({ settlement }: { settlement: Settlement }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign-off & notes</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {settlement.signoffText && (
          <div>
            <div className="eyebrow text-[10px] text-ink-500 mb-2">
              From the artist team
            </div>
            <div className="text-[13px] text-ink-800 bg-canvas-soft rounded-lg p-4 ring-1 ring-ink-200/60 leading-relaxed">
              &ldquo;{settlement.signoffText}&rdquo;
            </div>
          </div>
        )}
        {settlement.notes && (
          <div>
            <div className="eyebrow text-[10px] text-ink-500 mb-2">
              Mariana&apos;s settlement notes
            </div>
            <div className="text-[12.5px] text-ink-800 bg-canvas-soft rounded-lg p-4 ring-1 ring-ink-200/60 leading-relaxed">
              {settlement.notes}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Row({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <div className="flex items-baseline justify-between py-2.5">
      <div>
        <div className="text-[13px] text-ink-600">{label}</div>
        {note && (
          <div className="text-[11.5px] text-ink-400 mt-0.5 max-w-md leading-snug">
            {note}
          </div>
        )}
      </div>
      <div className="text-[13.5px] text-ink-900 font-mono tabular">
        {value}
      </div>
    </div>
  );
}
