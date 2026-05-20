import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import {
  getAgentsList,
  getAgenciesList,
  getArtistsList,
} from "@/lib/queries";
import { SentBackClient } from "./sent-back-client";

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

export default async function SentBackPage({
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
  const originalTreatment = params.treatment ?? "on top of cap";
  const scope = params.scope ?? "paid digital ads + flyer";
  const others = params.others ?? "no other categories";

  const backHref = `/deals/new/review?${new URLSearchParams({
    ...(params.showName && { showName: params.showName }),
    ...(params.showDate && { showDate: params.showDate }),
    ...(params.artistId && { artistId: params.artistId }),
    ...(params.agentId && { agentId: params.agentId }),
    ...(params.agencyId && { agencyId: params.agencyId }),
    ...(params.treatment && { treatment: params.treatment }),
    ...(params.scope && { scope: params.scope }),
    ...(params.others && { others: params.others }),
  }).toString()}`;

  const lockedHrefBase = `/deals/new/locked?${new URLSearchParams({
    ...(params.showName && { showName: params.showName }),
    ...(params.showDate && { showDate: params.showDate }),
    ...(params.artistId && { artistId: params.artistId }),
    ...(params.agentId && { agentId: params.agentId }),
    ...(params.agencyId && { agencyId: params.agencyId }),
    ...(params.scope && { scope: params.scope }),
    ...(params.others && { others: params.others }),
  }).toString()}`;

  return (
    <div className="px-12 py-10 max-w-4xl">
      <Link
        href={backHref}
        className="inline-flex items-center gap-1.5 text-[12px] text-ink-400 hover:text-ink-600 mb-6"
      >
        <ArrowLeft className="h-3 w-3" />
        Back · review
      </Link>

      <div className="mb-8">
        <p className="eyebrow">Deal · awaiting changes</p>
        <h1 className="font-display text-[36px] text-ink-900 leading-tight">
          {artist?.name ?? showName}
          <span className="text-ink-400 font-display text-[24px] ml-3">
            · {showDate}
          </span>
        </h1>
      </div>

      <SentBackClient
        agentName={agent?.name ?? "agent"}
        agentEmail={agent?.email ?? "—"}
        agencyName={agency?.name ?? ""}
        showName={showName}
        showDate={showDate}
        artistName={artist?.name ?? showName}
        originalTreatment={originalTreatment}
        scope={scope}
        others={others}
        lockedHrefBase={lockedHrefBase}
      />
    </div>
  );
}
