import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  FileWarning,
  Check,
  AlertTriangle,
  Mail,
  Pencil,
  XCircle,
  Wallet,
  TrendingUp,
  GitPullRequest,
  CheckCircle2,
  Clock,
  Flag,
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
import { DealTypeBadge, PlainBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { calculateSettlement } from "@/lib/dealMath";
import { formatMoney, formatShowDateFull } from "@/lib/format";
import type { Settlement, Recoup } from "@/db/schema";
import { stageHistory } from "@/lib/settlementStage";

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

  const { show, artist, deal, ticketSales, expenses, settlement, recoups, venue } = data;

  if (!deal) {
    return (
      <div className="px-12 py-10 max-w-4xl">
        <BackLink showId={show.id} />
        <EmptySettlement showId={show.id} />
      </div>
    );
  }

  const calc = calculateSettlement({
    deal,
    ticketSales,
    expenses,
    venueCapacity: venue?.capacity ?? undefined,
  });
  const grossSoFar = ticketSales.reduce((sum, t) => sum + t.gross, 0);
  const totalFees = ticketSales.reduce((sum, t) => sum + t.fees, 0);
  const totalExpenses = expenses
    .filter((e) => !e.absorbedByVenue)
    .reduce((sum, e) => sum + e.amount, 0);

  const disputedRecoups = recoups.filter((r) => r.status === "disputed");
  const isDisputed = settlement?.status === "disputed" || settlement?.status === "revised" || !!settlement?.disputedAt;
  const disputedRecoupValue = disputedRecoups.reduce((s, r) => s + r.amount, 0);

  // Review status
  const reviewStatus = settlement
    ? settlement.status === "paid" || settlement.status === "finalized"
      ? "approved"
      : settlement.status === "disputed"
        ? "changes_requested"
        : settlement.status === "signed"
          ? "approved"
          : "pending"
    : "draft";

  const reviewStatusConfig = {
    approved: { label: "Approved", icon: CheckCircle2, color: "text-brand-700 bg-brand-50 ring-brand-200/60" },
    changes_requested: { label: "Changes Requested", icon: AlertTriangle, color: "text-rose-700 bg-rose-50 ring-rose-200/60" },
    pending: { label: "Pending Review", icon: Clock, color: "text-amber-700 bg-amber-50 ring-amber-200/60" },
    draft: { label: "Draft", icon: Pencil, color: "text-ink-600 bg-ink-50 ring-ink-200/60" },
  };

  const rstatus = reviewStatusConfig[reviewStatus];
  const RStatusIcon = rstatus.icon;

  // Settlement history
  const history = settlement ? stageHistory(settlement) : [];

  return (
    <div className={`px-12 py-10 max-w-6xl ${isDisputed ? "bg-linear-to-b from-rose-50/30 via-canvas to-canvas" : ""}`}>
      <BackLink showId={show.id} />

      {/* Header with PR-style status */}
      <div className="mb-10">
        <div className="flex items-center gap-2 mb-4">
          <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md ring-1 ring-inset text-[11px] font-semibold ${rstatus.color}`}>
            <RStatusIcon className="h-3.5 w-3.5" />
            {rstatus.label}
          </div>
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
        </div>
        <h1 className="font-display text-[40px] font-medium text-ink-900 leading-[1.05]" style={{ letterSpacing: "-0.02em", fontOpticalSizing: "auto" }}>
          Settlement Review
        </h1>
        <div className="text-[14px] text-ink-500 mt-2 flex items-center gap-2">
          <span className="text-ink-700 font-medium">{artist?.name}</span>
          <span className="text-ink-300">·</span>
          <span>{formatShowDateFull(show.date)}</span>
        </div>
      </div>

      {/* Dispute callout */}
      {isDisputed && disputedRecoupValue > 0 && (
        <div className="mb-6 rounded-lg border border-rose-200/60 bg-rose-50/40 p-5 flex gap-3">
          <AlertTriangle className="h-4 w-4 text-rose-700 mt-0.5 shrink-0" />
          <div>
            <div className="text-[13px] font-semibold text-rose-800">
              {disputedRecoups.length} recoup{disputedRecoups.length === 1 ? "" : "s"} in dispute · {formatMoney(disputedRecoupValue)} contested
            </div>
            <p className="text-[12.5px] text-ink-600 mt-1 leading-relaxed">
              This settlement cannot be finalized until disputes are resolved.
            </p>
          </div>
        </div>
      )}

      {/* Lifecycle bar */}
      {settlement && <LifecycleBar settlement={settlement} />}

      {/* Main content: Invoice panel + Review sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 mt-6">
        {/* Left: Invoice/calculation panel */}
        <div className="space-y-6">
          {!calc.supported ? (
            <UnsupportedDeal
              dealType={calc.dealType}
              deal={deal}
              existingSettlement={settlement}
              grossSoFar={grossSoFar}
              totalFees={totalFees}
              totalExpenses={totalExpenses}
              ticketCount={ticketSales.reduce((s, t) => s + (t.qty ?? 0), 0)}
              expenseRowCount={expenses.length}
            />
          ) : (
            <SupportedSettlement calc={calc} />
          )}

          {recoups.length > 0 && <RecoupsSection recoups={recoups} />}

          {settlement && (settlement.signoffText || settlement.notes) && (
            <SignoffSection settlement={settlement} />
          )}
        </div>

        {/* Right: Review panel */}
        <div className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          {/* Settlement summary card */}
          <Card accent="brand">
            <CardContent className="py-5">
              <div className="eyebrow text-[10px] text-ink-400 mb-1">Total to artist</div>
              <div className="text-[36px] font-mono tabular font-bold text-ink-900 leading-none" style={{ letterSpacing: "-0.02em" }}>
                {calc.supported ? formatMoney(calc.totalToArtist) : settlement?.totalToArtist != null ? formatMoney(settlement.totalToArtist) : "—"}
              </div>
              {calc.supported && (
                <div className="text-[10.5px] font-mono text-ink-400 mt-2">{calc.finalFormula}</div>
              )}
            </CardContent>
          </Card>

          {/* Review actions */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-1.5">
                <GitPullRequest className="h-3.5 w-3.5 text-ink-400" />
                Review
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Reviewer */}
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-400 block mb-1.5">
                  Reviewer
                </label>
                <input
                  type="text"
                  defaultValue="Mariana Reyes"
                  className="w-full text-[13px] text-ink-900 bg-ink-50/50 border border-ink-200/60 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-700/20 focus:border-brand-300"
                  readOnly
                />
              </div>

              {/* Comment */}
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-400 block mb-1.5">
                  Comment
                </label>
                <textarea
                  placeholder="Add a note about this settlement…"
                  rows={3}
                  className="w-full text-[13px] text-ink-900 bg-white border border-ink-200/60 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-700/20 focus:border-brand-300 resize-none placeholder:text-ink-400"
                />
              </div>

              {/* Actions */}
              <div className="space-y-2">
                <Button variant="brand" className="w-full">
                  <Check className="h-3.5 w-3.5" />
                  Approve & confirm payout
                </Button>
                <Button variant="outline" className="w-full">
                  <Flag className="h-3.5 w-3.5" />
                  Request changes
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Review timeline */}
          {history.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Timeline</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {history.map((h, i) => (
                    <div key={i} className="flex items-start gap-2.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-ink-300 mt-1.5 shrink-0" />
                      <div>
                        <div className="text-[12px] font-medium text-ink-700 capitalize">
                          {h.stage.replace("_", " ")}
                        </div>
                        <div className="text-[10px] font-mono tabular text-ink-400">
                          {new Date(h.at).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function EmptySettlement({ showId }: { showId: string }) {
  return (
    <Card>
      <CardContent className="py-16 text-center">
        <GitPullRequest className="h-10 w-10 text-ink-200 mx-auto mb-4" />
        <h2 className="font-display text-[20px] font-medium text-ink-900 mb-2" style={{ letterSpacing: "-0.02em" }}>
          No settlement prepared yet
        </h2>
        <p className="text-[13px] text-ink-500 max-w-md mx-auto mb-6 leading-relaxed">
          Use the calculator on the show page to prepare a settlement, then push it here for review.
        </p>
        <Link href={`/shows/${showId}`}>
          <Button variant="brand">
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to show
          </Button>
        </Link>
      </CardContent>
    </Card>
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

function LifecycleBar({ settlement }: { settlement: Settlement }) {
  if (settlement.status === "voided") {
    return (
      <div className="rounded-lg border border-ink-200/80 bg-white px-5 py-4 flex items-center gap-3">
        <XCircle className="h-4 w-4 text-ink-400" />
        <div>
          <div className="text-[13px] font-medium text-ink-900">Settlement voided</div>
          <div className="text-[11.5px] text-ink-400 mt-0.5">The show was cancelled or the settlement was scrapped.</div>
        </div>
      </div>
    );
  }

  const stages: Stage[] = [
    { key: "draft", label: "Drafted", icon: Pencil, timestamp: settlement.draftedAt },
    { key: "submitted", label: "Submitted", icon: Mail, timestamp: settlement.submittedAt },
    { key: "review", label: "Reviewed", icon: TrendingUp, timestamp: settlement.reviewStartedAt },
    { key: "signed", label: settlement.disputedAt ? "Finalized" : "Signed", icon: Check, timestamp: settlement.finalizedAt ?? settlement.signedAt },
    { key: "paid", label: "Paid", icon: Wallet, timestamp: settlement.paidAt },
  ];

  const currentIndex = (() => {
    switch (settlement.status) {
      case "draft": return 0;
      case "submitted": return 1;
      case "in_review": return 2;
      case "disputed": case "signed": case "revised": case "finalized": return 3;
      case "paid": return 4;
      default: return 0;
    }
  })();

  const isDisp = settlement.status === "disputed" || settlement.status === "revised" || !!settlement.disputedAt;

  return (
    <Card>
      <CardContent className="py-5">
        <div className="flex items-center justify-between mb-4">
          <div className="eyebrow text-[10px] text-ink-400">Settlement lifecycle</div>
          {isDisp && (
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-rose-700">
              <AlertTriangle className="h-3 w-3" />
              {settlement.status === "disputed" ? "In dispute" : settlement.status === "revised" ? "Revision sent" : "Resolved after dispute"}
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
            const dot = isComplete
              ? "bg-brand-700 ring-brand-700 text-white"
              : isCurrent
                ? isDisp ? "bg-rose-50 ring-rose-500 text-rose-700" : "bg-brand-50 ring-brand-700 text-brand-700"
                : "bg-white ring-ink-200/80 text-ink-300";

            return (
              <div key={stage.key} className="flex flex-col items-center text-center">
                <div className={`relative z-10 w-7 h-7 rounded-full ring-2 flex items-center justify-center ${dot}`}>
                  <Icon className="h-3.5 w-3.5" />
                </div>
                <div className={`mt-2.5 text-[11px] font-medium leading-tight ${isFuture ? "text-ink-300" : "text-ink-900"}`}>
                  {stage.label}
                </div>
                <div className="text-[10px] text-ink-400 mt-0.5 font-mono tabular leading-tight min-h-[12px]">
                  {stage.timestamp ? new Date(stage.timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : ""}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function UnsupportedDeal({
  dealType, deal, existingSettlement, grossSoFar, totalFees, totalExpenses, ticketCount, expenseRowCount,
}: {
  dealType: string;
  deal: NonNullable<Awaited<ReturnType<typeof getShowById>>>["deal"];
  existingSettlement: NonNullable<Awaited<ReturnType<typeof getShowById>>>["settlement"];
  grossSoFar: number;
  totalFees: number;
  totalExpenses: number;
  ticketCount: number;
  expenseRowCount: number;
}) {
  const friendly: Record<string, string> = { flat: "flat guarantee", percentage_of_gross: "percentage of gross", percentage_of_net: "percentage of net", vs: "vs deal", door: "door deal" };

  return (
    <>
      <Card accent="amber">
        <CardContent className="py-10 text-center">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 ring-1 ring-amber-200/80 mb-5">
            <FileWarning className="h-5 w-5 text-amber-700" />
          </div>
          <h2 className="font-display text-[20px] font-medium text-ink-900 mb-2" style={{ letterSpacing: "-0.02em" }}>
            The in-app tool can&apos;t settle a {friendly[dealType] ?? dealType} yet.
          </h2>
          <p className="text-[13px] text-ink-500 max-w-md mx-auto leading-relaxed">
            Use the calculator on the show page to prepare the numbers manually.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>What the system has</CardTitle>
            <CardDescription>Available inputs for this settlement.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            <Field label="Gross box office" mono value={formatMoney(grossSoFar)} />
            <Field label="Fees" mono value={formatMoney(totalFees)} />
            <Field label="Net box office" mono value={formatMoney(grossSoFar - totalFees)} />
          </div>
          <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-5">
            <Field label="Tickets sold" mono value={String(ticketCount)} />
            <Field label="Expenses (line items)" mono value={String(expenseRowCount)} />
            <Field label="Expenses (passed through)" mono value={formatMoney(totalExpenses)} />
          </div>
          {deal?.dealNotesFreetext && (
            <div className="mt-6">
              <div className="eyebrow text-[10px] text-ink-500 mb-2">Deal notes</div>
              <div className="text-[12.5px] text-ink-800 bg-canvas-soft rounded-lg p-4 ring-1 ring-ink-200/60 leading-relaxed">
                {deal.dealNotesFreetext}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {existingSettlement?.totalToArtist != null && (
        <Card accent={existingSettlement.status === "disputed" ? "rose" : "brand"}>
          <CardHeader>
            <div>
              <CardTitle>Actually settled (off-platform)</CardTitle>
              <CardDescription>Result logged back into Greenroom.</CardDescription>
            </div>
            {existingSettlement.status === "disputed" ? <PlainBadge variant="rose">Disputed</PlainBadge> : <PlainBadge variant="brand">Signed</PlainBadge>}
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline justify-between py-2">
              <span className="text-[13px] text-ink-600">Total to artist</span>
              <span className="text-[28px] font-mono tabular font-semibold text-ink-900" style={{ letterSpacing: "-0.02em" }}>
                {formatMoney(existingSettlement.totalToArtist)}
              </span>
            </div>
          </CardContent>
        </Card>
      )}
    </>
  );
}

function SupportedSettlement({ calc }: {
  calc: Extract<ReturnType<typeof calculateSettlement>, { supported: true }>;
}) {
  return (
    <>
      {/* Worksheet */}
      <Card accent="brand">
        <CardHeader>
          <div>
            <CardTitle>Settlement worksheet</CardTitle>
            <CardDescription className="font-mono">{calc.finalFormula}</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="divide-y divide-ink-100/80">
          <Row label="Gross box office" value={formatMoney(calc.grossBoxOffice)} />
          <Row label="Net box office" value={formatMoney(calc.netBoxOffice)} />
          <Row label="Total expenses (passed through)" value={formatMoney(calc.totalExpenses)} />
          <div className="pt-3" />
          {calc.steps.map((step, i) => (
            <Row key={i} label={step.label} value={formatMoney(step.value)} note={step.note} />
          ))}
          <div className="pt-3" />
          <div className="flex items-baseline justify-between py-3 font-semibold">
            <span className="text-[13px] text-ink-900">Total to artist</span>
            <span className="text-[18px] font-mono tabular text-ink-900">{formatMoney(calc.totalToArtist)}</span>
          </div>
        </CardContent>
      </Card>

      {calc.bonusesNotTriggered.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Bonuses not triggered</CardTitle>
            <CardDescription>Structured bonuses that didn&apos;t hit.</CardDescription>
          </CardHeader>
          <CardContent className="divide-y divide-ink-100/80">
            {calc.bonusesNotTriggered.map((b, i) => (
              <div key={i} className="py-3 flex items-baseline justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-[13px] text-ink-600">{b.label}</div>
                  <div className="text-[11.5px] text-ink-400 mt-0.5">{b.reason}</div>
                </div>
                <div className="text-[12.5px] text-ink-300 font-mono tabular line-through">{formatMoney(b.amount)}</div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </>
  );
}

function RecoupsSection({ recoups }: { recoups: Recoup[] }) {
  const total = recoups.reduce((s, r) => s + r.amount, 0);
  const hasDisputed = recoups.some((r) => r.status === "disputed");

  return (
    <Card accent={hasDisputed ? "rose" : undefined}>
      <CardHeader>
        <div>
          <CardTitle>Recoups</CardTitle>
          <CardDescription>Venue costs taken off the top before artist payment.</CardDescription>
        </div>
        <PlainBadge variant={hasDisputed ? "rose" : "default"}>{formatMoney(total)} total</PlainBadge>
      </CardHeader>
      <CardContent className="divide-y divide-ink-100/80">
        {recoups.map((r) => (
          <div key={r.id} className="py-3.5 grid grid-cols-[1fr_auto_auto] items-center gap-3">
            <div className="min-w-0">
              <div className="text-[13px] text-ink-900 leading-tight">{r.label}</div>
              <div className="text-[11.5px] text-ink-400 mt-0.5">{RECOUP_LABELS[r.category]}</div>
            </div>
            <div>
              {r.status === "disputed" ? <PlainBadge variant="rose">Disputed</PlainBadge> : r.status === "withdrawn" ? <PlainBadge variant="default">Withdrawn</PlainBadge> : <PlainBadge variant="brand">Agreed</PlainBadge>}
            </div>
            <div className="text-[13.5px] font-mono tabular text-ink-900 text-right min-w-[80px]">{formatMoney(r.amount)}</div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function SignoffSection({ settlement }: { settlement: Settlement }) {
  return (
    <Card>
      <CardHeader><CardTitle>Sign-off & notes</CardTitle></CardHeader>
      <CardContent className="space-y-5">
        {settlement.signoffText && (
          <div>
            <div className="eyebrow text-[10px] text-ink-500 mb-2">From the artist team</div>
            <div className="text-[13px] text-ink-800 bg-canvas-soft rounded-lg p-4 ring-1 ring-ink-200/60 leading-relaxed">
              &ldquo;{settlement.signoffText}&rdquo;
            </div>
          </div>
        )}
        {settlement.notes && (
          <div>
            <div className="eyebrow text-[10px] text-ink-500 mb-2">Mariana&apos;s settlement notes</div>
            <div className="text-[12.5px] text-ink-800 bg-canvas-soft rounded-lg p-4 ring-1 ring-ink-200/60 leading-relaxed">
              {settlement.notes}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Row({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="flex items-baseline justify-between py-2.5">
      <div>
        <div className="text-[13px] text-ink-600">{label}</div>
        {note && <div className="text-[11.5px] text-ink-400 mt-0.5 max-w-md leading-snug">{note}</div>}
      </div>
      <div className="text-[13.5px] text-ink-900 font-mono tabular">{value}</div>
    </div>
  );
}
