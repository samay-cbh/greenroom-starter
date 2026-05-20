import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import {
  getAgentsList,
  getAgenciesList,
  getArtistsList,
} from "@/lib/queries";
import { ParseClient } from "./parse-client";

type Params = {
  showName?: string;
  showDate?: string;
  artistId?: string;
  agentId?: string;
  agencyId?: string;
};

export default async function ParseDealPage({
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

  const backHref = `/deals/new/capture?${new URLSearchParams({
    ...(params.showName && { showName: params.showName }),
    ...(params.showDate && { showDate: params.showDate }),
    ...(params.artistId && { artistId: params.artistId }),
    ...(params.agentId && { agentId: params.agentId }),
    ...(params.agencyId && { agencyId: params.agencyId }),
  }).toString()}`;

  const demoEmail = `Hey Mariana — terms for ${
    artist?.name ?? "the show"
  } ${showDate}:

$4,500 vs 85% of net after expenses
expense cap $3,200
marketing recoup not to exceed $500
walkout pot $200

— ${agent?.name?.split(" ")[0] ?? "Agent"}`;

  return (
    <div className="px-12 py-10 max-w-4xl">
      <Link
        href={backHref}
        className="inline-flex items-center gap-1.5 text-[12px] text-ink-400 hover:text-ink-600 mb-6"
      >
        <ArrowLeft className="h-3 w-3" />
        Back · paste email
      </Link>

      <div className="mb-8">
        <p className="eyebrow">New deal · draft</p>
        <h1 className="font-display text-[36px] text-ink-900 leading-tight">
          {artist?.name ?? showName}
          <span className="text-ink-400 font-display text-[24px] ml-3">
            · {showDate}
          </span>
        </h1>
      </div>

      {/* Counterparty reference strip */}
      {agent?.name === "Daniel Hwang" && (
        <div className="rounded-md border border-rose-200 bg-rose-50/40 px-4 py-2.5 mb-5 flex items-center gap-2.5">
          <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
          <div className="text-[12px] text-ink-700 flex-1">
            <strong>{agent.name} · {agency?.name}</strong> — counterparty flag
            active.{" "}
            <Link
              href={backHref}
              className="text-rose-700 underline underline-offset-2 hover:text-rose-900"
            >
              See signal ↗
            </Link>
          </div>
        </div>
      )}

      <ParseClient demoEmail={demoEmail} contextParams={params} />
    </div>
  );
}
