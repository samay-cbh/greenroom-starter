import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getShowById, getLatestBriefForShow } from "@/lib/queries";
import {
  parseDealBrief,
  parseAmbiguities,
  parseContradictions,
} from "@/lib/dealBrief";
import { hasLLMProvider } from "@/lib/aiProvider";
import { formatShowDateFull } from "@/lib/format";
import { StatusBadge, DealTypeBadge, PlainBadge } from "@/components/ui/badge";
import { BriefClient } from "./brief-client";

export default async function BriefPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // Independent queries — fetch in parallel to cut server response time.
  const [data, briefRow] = await Promise.all([
    getShowById(id),
    getLatestBriefForShow(id),
  ]);
  if (!data) notFound();

  const { show, artist, agent, agency, deal } = data;
  if (!deal) {
    return (
      <div className="px-12 py-10 max-w-4xl">
        <Link
          href={`/shows/${show.id}`}
          className="inline-flex items-center gap-1 text-[12px] text-ink-400 hover:text-ink-900 mb-8 transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to show
        </Link>
        <h1
          className="font-display text-[40px] font-medium text-ink-900 leading-[1.05]"
          style={{ letterSpacing: "-0.02em" }}
        >
          No deal yet
        </h1>
        <p className="text-[13.5px] text-ink-500 mt-3 max-w-md leading-relaxed">
          A Deal Brief is anchored to a deal row. Create the deal on the
          show first, then come back to confirm it.
        </p>
      </div>
    );
  }

  const extracted = briefRow ? parseDealBrief(briefRow.extractedJson) : null;
  const ambiguities = briefRow ? parseAmbiguities(briefRow.ambiguitiesJson) : [];
  const contradictions = briefRow
    ? parseContradictions(briefRow.contradictionsJson)
    : [];

  const briefSerialized = briefRow
    ? {
        id: briefRow.id,
        version: briefRow.version,
        status: briefRow.status,
        sourceEmailText: briefRow.sourceEmailText,
        confirmedAt: briefRow.confirmedAt
          ? briefRow.confirmedAt.toISOString()
          : null,
        confirmedVia: briefRow.confirmedVia,
        agentReplyText: briefRow.agentReplyText,
        createdAt: briefRow.createdAt.toISOString(),
      }
    : null;

  return (
    <div className="px-12 py-10 max-w-7xl">
      <Link
        href={`/shows/${show.id}`}
        className="inline-flex items-center gap-1 text-[12px] text-ink-400 hover:text-ink-900 mb-8 transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back to show
      </Link>

      <div className="mb-12">
        <div className="flex items-center gap-1.5 mb-4">
          <StatusBadge status={show.status} />
          <DealTypeBadge type={deal.dealType} />
          {briefRow?.status === "confirmed" && (
            <PlainBadge variant="brand">Brief confirmed</PlainBadge>
          )}
          {briefRow?.status === "draft" && (
            <PlainBadge variant="amber">Brief in draft</PlainBadge>
          )}
          {briefRow?.status === "awaiting_confirmation" && (
            <PlainBadge variant="amber">Awaiting agent reply</PlainBadge>
          )}
          {!briefRow && (
            <PlainBadge variant="default">No brief yet</PlainBadge>
          )}
        </div>
        <h1
          className="font-display text-[48px] font-medium text-ink-900 leading-[1.05]"
          style={{ letterSpacing: "-0.02em", fontOpticalSizing: "auto" }}
        >
          Confirm the deal
        </h1>
        <p className="text-[13.5px] text-ink-500 mt-3 max-w-2xl leading-relaxed">
          Paste the deal email from {agent?.name ?? "the agent"}
          {agency ? ` at ${agency.name}` : ""}. We&apos;ll extract the
          structured terms, flag anything ambiguous, and help you confirm
          the deal in writing before {artist?.name ?? "the artist"}
          {" "}plays on {formatShowDateFull(show.date)}.
        </p>

        {!hasLLMProvider() && (
          <div className="mt-5 rounded-lg border border-amber-200/60 bg-amber-50/40 px-4 py-3 text-[12.5px] text-amber-900 max-w-2xl leading-relaxed">
            <strong className="font-semibold">Manual mode.</strong> No AI
            provider configured. Set{" "}
            <code className="font-mono text-[11px] bg-white/80 px-1 py-0.5 rounded ring-1 ring-amber-200/40">
              GEMINI_API_KEY
            </code>{" "}
            in <code className="font-mono text-[11px]">.env.local</code> to
            enable extraction. Until then, you can still build a brief by
            hand.
          </div>
        )}
      </div>

      <BriefClient
        showId={show.id}
        legacyDeal={{
          dealType: deal.dealType,
          guaranteeAmount: deal.guaranteeAmount,
          percentage: deal.percentage,
          expenseCap: deal.expenseCap,
          hospitalityCap: deal.hospitalityCap,
          dealNotesFreetext: deal.dealNotesFreetext,
        }}
        brief={briefSerialized}
        extracted={extracted}
        ambiguities={ambiguities}
        contradictions={contradictions}
        hasLLMProvider={hasLLMProvider()}
      />
    </div>
  );
}
