import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import {
  getAgentsList,
  getAgenciesList,
  getArtistsList,
} from "@/lib/queries";
import { ReviewActions } from "./review-actions";

type Params = {
  showName?: string;
  showDate?: string;
  artistId?: string;
  agentId?: string;
  agencyId?: string;
  treatment?: string;
  scope?: string;
  others?: string;
};

export default async function ReviewDealPage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const params = await searchParams;
  const [artists, agents, agencies] = await Promise.all([
    getArtistsList(),
    getAgentsList(),
    getAgenciesList(),
  ]);

  const artist = artists.find((a) => a.id === params.artistId);
  const agent = agents.find((a) => a.id === params.agentId);
  const agency = agencies.find((c) => c.id === params.agencyId);

  const showName = params.showName ?? artist?.name ?? "—";
  const showDate = params.showDate ?? "—";

  // Mariana's picks from the disambiguation modal (fallback to demo defaults)
  const treatment = params.treatment ?? "on top of cap";
  const scope = params.scope ?? "paid digital ads + flyer";
  const others = params.others ?? "no other categories";

  const queryStr = new URLSearchParams({
    ...(params.showName && { showName: params.showName }),
    ...(params.showDate && { showDate: params.showDate }),
    ...(params.artistId && { artistId: params.artistId }),
    ...(params.agentId && { agentId: params.agentId }),
    ...(params.agencyId && { agencyId: params.agencyId }),
  }).toString();

  return (
    <div className="px-12 py-10 max-w-4xl">
      <Link
        href={`/deals/new/parse?${queryStr}`}
        className="inline-flex items-center gap-1.5 text-[12px] text-ink-400 hover:text-ink-600 mb-6"
      >
        <ArrowLeft className="h-3 w-3" />
        Back · parse
      </Link>

      <div className="mb-8">
        <p className="eyebrow">Draft deal · ready to send</p>
        <h1 className="font-display text-[36px] text-ink-900 leading-tight">
          {artist?.name ?? showName}
          <span className="text-ink-400 font-display text-[24px] ml-3">
            · {showDate}
          </span>
        </h1>
      </div>

      {/* Status banner */}
      <div className="rounded-md border border-brand-200 bg-brand-50/40 px-4 py-2.5 mb-5 flex items-center gap-3">
        <span className="px-2 py-0.5 rounded bg-white text-brand-700 text-[10px] uppercase tracking-wider font-bold ring-1 ring-brand-200">
          draft
        </span>
        <span className="text-[12.5px] text-ink-700">
          All fields resolved · ready for agent approval
        </span>
      </div>

      {/* Counterparty card */}
      <div className="rounded-xl border border-ink-200/60 bg-white p-5 mb-5 shadow-[0_1px_2px_rgba(26,24,20,0.03)]">
        <div className="grid grid-cols-2 gap-6">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-ink-400 font-medium mb-1">
              Show
            </div>
            <div className="text-[13.5px] text-ink-900 font-medium">
              {showName}
            </div>
            <div className="text-[11.5px] text-ink-500 mt-0.5">{showDate}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-ink-400 font-medium mb-1">
              Will send to
            </div>
            <div className="text-[13.5px] text-ink-900 font-medium">
              {agent?.name ?? "—"}
              {agency?.name && (
                <span className="text-ink-500 font-normal"> · {agency.name}</span>
              )}
            </div>
            <div className="text-[11.5px] text-ink-500 mt-0.5">
              {agent?.email ?? "—"}
            </div>
          </div>
        </div>
      </div>

      {/* Deal terms card */}
      <div className="rounded-xl border border-ink-200/60 bg-white shadow-[0_1px_2px_rgba(26,24,20,0.03)] mb-6">
        <div className="px-5 py-3 border-b border-ink-100">
          <div className="text-[11px] uppercase tracking-wider text-ink-400 font-semibold">
            Deal terms · as Mariana approved
          </div>
        </div>

        <div className="divide-y divide-ink-100">
          <FinalFieldRow
            label="Deal type"
            value="V1 · standard vs net"
          />
          <FinalFieldRow label="Guarantee" value="$4,500" mono />
          <FinalFieldRow
            label="Artist split"
            value="85% of net after expenses"
          />
          <FinalFieldRow label="Expense cap" value="$3,200" mono />

          {/* Recoups — show full structured detail */}
          <div className="px-5 py-4 bg-brand-50/20">
            <div className="flex items-center justify-between mb-3">
              <div className="text-[13px] text-ink-700 font-medium">
                Recoups
              </div>
              <span className="px-2 py-0.5 rounded bg-brand-50 text-brand-700 text-[10.5px] uppercase tracking-wider font-semibold">
                ✓ resolved
              </span>
            </div>

            {/* Marketing line — full detail */}
            <div className="rounded-lg border border-brand-200 bg-white overflow-hidden mb-3">
              <div className="px-4 py-2 border-b border-brand-100 bg-brand-50/40 flex items-center justify-between">
                <div className="text-[13px] text-ink-900 font-semibold">
                  ↳ Marketing
                </div>
                <div className="text-[11.5px] text-ink-600">
                  cap <span className="font-mono font-medium">$500</span>
                </div>
              </div>
              <div className="divide-y divide-brand-100">
                <RecoupDetailRow
                  label="Treatment"
                  value={treatment}
                />
                <RecoupDetailRow
                  label="Scope"
                  value={scope}
                />
              </div>
            </div>

            {/* Other categories — same visual weight as Marketing */}
            <div className="rounded-lg border border-brand-200 bg-white overflow-hidden">
              <div className="px-4 py-2 border-b border-brand-100 bg-brand-50/40 flex items-center justify-between">
                <div className="text-[13px] text-ink-900 font-semibold">
                  ↳ Other categories
                </div>
                <div className="text-[11.5px] text-ink-600">
                  specialty backline · hospitality overage · production overage
                </div>
              </div>
              <RecoupDetailRow label="Allowed" value={others} />
            </div>
          </div>

          <FinalFieldRow label="Walkout pot" value="$200" mono />
          <FinalFieldRow label="Bonus" value="— not specified" muted />
        </div>
      </div>

      <ReviewActions
        agentName={agent?.name ?? "agent"}
        agentEmail={agent?.email ?? "—"}
        artistName={artist?.name ?? showName}
        showDate={showDate}
        sendBackHref={`/deals/new/sent-back?${queryStr}`}
        approveHref={`/deals/new/locked?${queryStr}`}
      />

      <div className="mt-6 text-[11.5px] text-ink-400 leading-relaxed border-t border-ink-100 pt-4">
        <span className="text-ink-600 font-medium">Prototype note · </span>
        Values above echo what you picked in the disambiguation modal. From the
        next screen onward the demo follows a scripted path — Hwang pushes back
        on the marketing-recoup treatment — to walk the canonical Coastal Spell
        dispute end-to-end.
      </div>
    </div>
  );
}

function FinalFieldRow({
  label,
  value,
  mono,
  muted,
}: {
  label: string;
  value: string;
  mono?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="px-5 py-3 grid grid-cols-[180px_1fr_auto] gap-4 items-center">
      <div className="text-[13px] text-ink-700 font-medium">{label}</div>
      <div
        className={`text-[13px] ${
          muted ? "text-ink-400 italic" : "text-ink-900"
        } ${mono ? "font-mono" : ""}`}
      >
        {value}
      </div>
      <span className="px-2 py-0.5 rounded bg-brand-50 text-brand-700 text-[10.5px] uppercase tracking-wider font-semibold">
        ✓ ok
      </span>
    </div>
  );
}

function RecoupDetailRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="px-4 py-2 grid grid-cols-[110px_1fr_auto] gap-3 items-center">
      <div className="text-[11.5px] uppercase tracking-wider text-ink-400 font-medium">
        {label}
      </div>
      <div className="text-[12.5px] text-ink-800">{value}</div>
      <span className="text-brand-700 text-[12px]">✓</span>
    </div>
  );
}
