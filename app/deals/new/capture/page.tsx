import Link from "next/link";
import { ArrowLeft, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getAgentsList,
  getAgenciesList,
  getArtistsList,
} from "@/lib/queries";

type Params = {
  showName?: string;
  showDate?: string;
  artistId?: string;
  agentId?: string;
  agencyId?: string;
};

export default async function CaptureDealPage({
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

  const showName = params.showName ?? "—";
  const showDate = params.showDate ?? "—";
  const counterparty = [agent?.name, agency?.name].filter(Boolean).join(" · ");
  const isHwang = agent?.name === "Daniel Hwang";

  // Demo email body — synthetic, pre-filled for the scripted flow
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
        href={`/deals/new`}
        className="inline-flex items-center gap-1.5 text-[12px] text-ink-400 hover:text-ink-600 mb-6"
      >
        <ArrowLeft className="h-3 w-3" />
        Back · step 1
      </Link>

      <div className="mb-8">
        <p className="eyebrow">New deal · step 2 of 2</p>
        <h1 className="font-display text-[36px] text-ink-900 leading-tight">
          Capture deal terms
          <span className="text-ink-400 font-display text-[24px] ml-3">
            · {artist?.name ?? showName} · {showDate}
          </span>
        </h1>
      </div>

      {/* Context card */}
      <div className="rounded-xl border border-ink-200/60 bg-white p-5 mb-5 shadow-[0_1px_2px_rgba(26,24,20,0.03)]">
        <div className="grid grid-cols-2 gap-6">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-ink-400 font-medium mb-1">
              Show
            </div>
            <div className="text-[13.5px] text-ink-900 font-medium">
              {showName} · {showDate}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-ink-400 font-medium mb-1">
              Counterparty
            </div>
            <div className="text-[13.5px] text-ink-900 font-medium">
              {counterparty || "—"}
            </div>
          </div>
        </div>
      </div>

      {/* Counterparty risk banner */}
      {isHwang ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50/60 p-5 mb-5">
          <div className="flex items-start gap-3">
            <span className="text-rose-700 text-[14px]">⚠</span>
            <div className="flex-1">
              <div className="text-[11px] uppercase tracking-wider text-rose-700 font-semibold mb-1.5">
                Counterparty signal · from your deal history
              </div>
              <div className="text-[13px] text-ink-800 leading-relaxed">
                <strong>{agent?.name}</strong>'s last{" "}
                <strong>6 settlements</strong>:{" "}
                <strong>6 disputed</strong>,{" "}
                <strong>5 on marketing recoup</strong>.{" "}
                <strong>
                  5 of those never appeared in Reports
                </strong>{" "}
                — they sat inside settlements marked{" "}
                <em>paid</em>.
              </div>
              <div className="text-[12px] text-ink-500 mt-2">
                Pattern at deal capture: marketing recoup language is usually
                unclear. Watch for it below.
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-ink-200/60 bg-canvas-soft p-5 mb-5">
          <div className="text-[12px] text-ink-500">
            No prior dispute signal for{" "}
            <strong className="text-ink-700">
              {agent?.name ?? "this agent"}
            </strong>{" "}
            in your last 12 months.
          </div>
        </div>
      )}

      {/* Paste box */}
      <div className="rounded-xl border border-ink-200/60 bg-white p-5 mb-5 shadow-[0_1px_2px_rgba(26,24,20,0.03)]">
        <div className="text-[11px] uppercase tracking-wider text-ink-400 font-medium mb-2">
          Paste the deal email
        </div>
        <textarea
          defaultValue={demoEmail}
          className="w-full px-3 py-3 rounded-md border border-ink-200 bg-canvas-soft text-[12.5px] text-ink-800 leading-relaxed font-mono focus:outline-none focus:ring-2 focus:ring-brand-700 focus:border-transparent resize-none"
          rows={9}
        />
        <div className="text-[11px] text-ink-400 mt-2">
          Prototype note: email pre-filled for the demo. Production version
          would accept any pasted email and parse on click.
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Link href={`/deals/new/parse?${new URLSearchParams({
          ...(params.showName && { showName: params.showName }),
          ...(params.showDate && { showDate: params.showDate }),
          ...(params.artistId && { artistId: params.artistId }),
          ...(params.agentId && { agentId: params.agentId }),
          ...(params.agencyId && { agencyId: params.agencyId }),
        }).toString()}`}>
          <Button variant="brand">
            <Sparkles className="h-4 w-4" />
            Parse with AI
          </Button>
        </Link>
        <Button variant="ghost" disabled>
          Skip — enter manually
        </Button>
      </div>
    </div>
  );
}
