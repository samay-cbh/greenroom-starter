import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, Sparkles } from "lucide-react";
import { getShowById } from "@/lib/queries";
import { mergeDealRecordFallbacks, parseDealEmail } from "@/lib/dealParser";
import { getMarketingRecoup, parseDealTermsJson } from "@/lib/dealTerms";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  Field,
} from "@/components/ui/card";
import { DealTypeBadge } from "@/components/ui/badge";
import { formatMoney, formatShowDateFull } from "@/lib/format";
import { ConfirmForm } from "./confirm-form";

export default async function ConfirmTermsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ reconfirm?: string }>;
}) {
  const { id } = await params;
  const { reconfirm } = await searchParams;
  const data = await getShowById(id);
  if (!data) notFound();

  const { show, artist, deal } = data;
  if (!deal) notFound();

  const back = (
    <Link
      href={`/shows/${id}/settle`}
      className="inline-flex items-center gap-1 text-[12px] text-ink-400 hover:text-ink-900 mb-8 transition-colors"
    >
      <ArrowLeft className="h-3.5 w-3.5" /> Back to settlement
    </Link>
  );

  // ----- Not a vs deal: term confirmation only applies to vs in this slice. -----
  if (deal.dealType !== "vs") {
    return (
      <div className="px-12 py-10 max-w-3xl">
        {back}
        <Card>
          <CardHeader>
            <div>
              <CardTitle>This deal doesn&apos;t need term confirmation</CardTitle>
              <CardDescription>
                Forced-choice term confirmation is only required for vs deals
                in this slice. Other deal types either settle directly or
                fall through to the off-platform path.
              </CardDescription>
            </div>
            <DealTypeBadge type={deal.dealType} />
          </CardHeader>
          <CardContent>
            <Link
              href={`/shows/${id}/settle`}
              className="text-[13px] text-brand-700 font-medium hover:text-brand-800 hover:underline inline-flex items-center gap-1"
            >
              Back to settlement <ArrowRight className="h-3 w-3" />
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const sourceText = deal.dealNotesFreetext ?? "";
  const confirmed = parseDealTermsJson(deal.dealTermsJson);

  // ----- Already confirmed and not re-confirming: short status view. -----
  if (confirmed && !reconfirm) {
    return (
      <div className="px-12 py-10 max-w-3xl">
        {back}
        <div className="mb-10">
          <div className="flex items-center gap-1.5 mb-4">
            <DealTypeBadge type={deal.dealType} />
          </div>
          <h1
            className="font-display text-[40px] font-medium text-ink-900 leading-[1.05]"
            style={{ letterSpacing: "-0.02em", fontOpticalSizing: "auto" }}
          >
            Deal terms confirmed
          </h1>
          <div className="text-[14px] text-ink-400 mt-3">
            {artist?.name} · {formatShowDateFull(show.date)}
          </div>
        </div>

        <Card accent="brand">
          <CardHeader>
            <div>
              <CardTitle className="flex items-center gap-1.5">
                <Check className="h-3.5 w-3.5 text-brand-700" />
                Confirmed on {new Date(confirmed.confirmed_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
              </CardTitle>
              <CardDescription>
                These structured terms (Deal Terms Schema v1) are what the
                engine reads when it settles this show.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <Field label="Guarantee" mono value={formatMoney(confirmed.guarantee_amount)} />
              <Field
                label="Artist percentage"
                mono
                value={`${(confirmed.artist_percent * 100).toFixed(0)}%`}
              />
              <Field
                label="Expense cap"
                mono
                value={
                  confirmed.expense_cap.exists &&
                  confirmed.expense_cap.cap_amount != null
                    ? formatMoney(confirmed.expense_cap.cap_amount)
                    : "No cap"
                }
              />
              {(() => {
                const recoup = getMarketingRecoup(confirmed);
                return (
                  <Field
                    label="Marketing recoup"
                    mono
                    value={
                      recoup
                        ? `${formatMoney(recoup.amount)} · ${
                            recoup.cap_scope === "outside_cap"
                              ? "off gross (outside cap)"
                              : "inside expense cap"
                          }`
                        : "None"
                    }
                  />
                );
              })()}
              {confirmed.bonus_tiers.length > 0 && (
                <Field
                  className="sm:col-span-2"
                  label="Bonus tiers"
                  value={
                    <ul className="space-y-1">
                      {confirmed.bonus_tiers.map((b, i) => (
                        <li key={i} className="text-[13px] text-ink-800 font-mono tabular">
                          {b.label ??
                            `$${(b.flat_amount ?? 0).toLocaleString()} over $${b.threshold_amount.toLocaleString()} ${b.basis}`}
                        </li>
                      ))}
                    </ul>
                  }
                />
              )}
            </div>
          </CardContent>
        </Card>

        <div className="mt-6 flex items-center justify-between">
          <Link
            href={`/shows/${id}/settle`}
            className="text-[13px] text-brand-700 font-medium hover:text-brand-800 hover:underline inline-flex items-center gap-1"
          >
            Open settlement <ArrowRight className="h-3 w-3" />
          </Link>
          <Link
            href={`/shows/${id}/confirm-terms?reconfirm=1`}
            className="text-[12px] text-ink-500 hover:text-ink-900 hover:underline"
          >
            Re-confirm terms
          </Link>
        </div>
      </div>
    );
  }

  // ----- Fresh (or re-)confirmation flow. Parse server-side. -----
  // why: the email parser only sees what's in the prose. When the booker
  // stored numbers on the deal row (guaranteeAmount, percentage, expenseCap,
  // bonusesJson) but the email phrasing didn't trip the regex, fall back to
  // the deal record so the form lights up with sensible defaults instead
  // of forcing manual re-entry.
  const parsed = mergeDealRecordFallbacks(parseDealEmail(sourceText), deal);

  return (
    <div className="px-12 py-10 max-w-4xl">
      {back}
      <div className="mb-10">
        <div className="flex items-center gap-1.5 mb-4">
          <DealTypeBadge type={deal.dealType} />
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10.5px] font-medium ring-1 ring-inset bg-brand-50 text-brand-800 ring-brand-200/80">
            <Sparkles className="h-3 w-3" />
            Parser-extracted draft
          </span>
        </div>
        <h1
          className="font-display text-[48px] font-medium text-ink-900 leading-[1.05]"
          style={{ letterSpacing: "-0.02em", fontOpticalSizing: "auto" }}
        >
          Confirm deal terms
        </h1>
        <div className="text-[14px] text-ink-400 mt-3">
          {artist?.name} · {formatShowDateFull(show.date)}
        </div>
        <p className="text-[13px] text-ink-500 mt-4 max-w-2xl leading-relaxed">
          The deal email is below — preserved verbatim. Underneath, the
          fields the deterministic parser extracted, plus any phrase that
          can be read more than one way. Resolve those once here, and the
          engine will settle this show end-to-end.
        </p>
      </div>

      <ConfirmForm showId={id} sourceText={sourceText} parsed={parsed} />
    </div>
  );
}
