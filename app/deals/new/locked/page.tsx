import Link from "next/link";
import { ArrowLeft, Lock, Check } from "lucide-react";
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
  treatment?: string;
  scope?: string;
  others?: string;
};

export default async function LockedDealPage({
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
  const treatment = params.treatment ?? "in cap";
  const scope = params.scope ?? "paid digital ads + flyer";
  const others = params.others ?? "no other categories";

  // Whether we got here via the send-back loop (treatment was corrected to "in cap")
  // or directly via Approve (treatment matches whatever Mariana originally picked).
  // We use a simple heuristic: if treatment is "in cap" we assume the send-back path.
  const viaSendBack = treatment === "in cap";

  return (
    <div className="px-12 py-10 max-w-5xl">
      <Link
        href="/deals"
        className="inline-flex items-center gap-1.5 text-[12px] text-ink-400 hover:text-ink-600 mb-6"
      >
        <ArrowLeft className="h-3 w-3" />
        Back to deals
      </Link>

      <div className="mb-8">
        <p className="eyebrow">Deal · locked</p>
        <h1 className="font-display text-[36px] text-ink-900 leading-tight">
          {artist?.name ?? showName}
          <span className="text-ink-400 font-display text-[24px] ml-3">
            · {showDate}
          </span>
        </h1>
      </div>

      {/* Lock banner */}
      <div className="rounded-md border border-brand-300 bg-brand-50/60 px-4 py-3 mb-6 flex items-center gap-3">
        <Lock className="h-4 w-4 text-brand-700" />
        <span className="px-2 py-0.5 rounded bg-white text-brand-700 text-[10px] uppercase tracking-wider font-bold ring-1 ring-brand-300">
          approved & locked
        </span>
        <span className="text-[12.5px] text-ink-800">
          Both sides hold the same terms.{" "}
          <span className="text-ink-500">
            Any future edit triggers a drift notice for re-approval.
          </span>
        </span>
      </div>

      <div className="grid grid-cols-[1.4fr_1fr] gap-5">
        {/* Locked terms */}
        <div className="rounded-xl border border-ink-200/60 bg-white shadow-[0_1px_2px_rgba(26,24,20,0.03)]">
          <div className="px-5 py-3 border-b border-ink-100">
            <div className="text-[11px] uppercase tracking-wider text-ink-400 font-semibold">
              Locked terms
            </div>
          </div>
          <div className="divide-y divide-ink-100">
            <LockedRow label="Deal type" value="V1 · standard vs net" />
            <LockedRow label="Guarantee" value="$4,500" mono />
            <LockedRow label="Artist split" value="85% after expenses" />
            <LockedRow label="Expense cap" value="$3,200" mono />

            <div className="px-5 py-3.5 bg-brand-50/15">
              <div className="text-[13px] text-ink-700 font-medium mb-2">
                Recoups
              </div>
              <div className="rounded-md border border-brand-200 bg-white overflow-hidden">
                <div className="px-3 py-1.5 bg-brand-50/40 border-b border-brand-100 text-[12.5px] text-ink-900 font-semibold flex items-center justify-between">
                  <span>↳ Marketing</span>
                  <span className="text-[11px] text-ink-600 font-normal">
                    cap <span className="font-mono">$500</span>
                  </span>
                </div>
                <div className="px-3 py-1.5 text-[12px] text-ink-700">
                  <span className="text-ink-400">treatment ·</span> {treatment}
                </div>
                <div className="px-3 py-1.5 text-[12px] text-ink-700 border-t border-brand-100">
                  <span className="text-ink-400">scope ·</span> {scope}
                </div>
              </div>
              <div className="px-1 pt-2 text-[11.5px] text-ink-500 italic">
                ↳ Other categories: {others}
              </div>
            </div>

            <LockedRow label="Walkout pot" value="$200" mono />
          </div>
        </div>

        {/* Version history */}
        <div className="rounded-xl border border-ink-200/60 bg-white shadow-[0_1px_2px_rgba(26,24,20,0.03)]">
          <div className="px-5 py-3 border-b border-ink-100">
            <div className="text-[11px] uppercase tracking-wider text-ink-400 font-semibold">
              Version history
            </div>
          </div>
          <div className="p-5 space-y-3">
            <TimelineItem
              when="2026-05-19 · 11:42pm"
              text={
                <>
                  <strong>v1 created</strong> by Mariana — AI-parsed from{" "}
                  {agent?.name ?? "agent"}'s email
                </>
              }
            />
            <TimelineItem
              when="2026-05-19 · 11:48pm"
              text={
                <>
                  <strong>v1 sent</strong> to {agent?.name ?? "agent"} for
                  approval
                </>
              }
            />
            {viaSendBack && (
              <>
                <TimelineItem
                  when="2026-05-20 · 9:14am"
                  amber
                  text={
                    <>
                      <strong>v1 sent back</strong> by{" "}
                      {agent?.name ?? "agent"} —{" "}
                      <em>"marketing recoup should be in the cap"</em>
                    </>
                  }
                />
                <TimelineItem
                  when="2026-05-20 · 9:32am"
                  text={
                    <>
                      <strong>v2 edited</strong> by Mariana —{" "}
                      <code className="text-[10.5px]">
                        recoups[marketing].treatment: on top of cap → in cap
                      </code>
                    </>
                  }
                />
                <TimelineItem
                  when="2026-05-20 · 9:51am"
                  brand
                  text={
                    <>
                      <Check className="inline h-3 w-3 mr-0.5 text-brand-700" />
                      <strong>v2 approved</strong> by{" "}
                      {agent?.name ?? "agent"} — <strong>LOCKED</strong>
                    </>
                  }
                />
              </>
            )}
            {!viaSendBack && (
              <TimelineItem
                when="2026-05-20 · 8:14am"
                brand
                text={
                  <>
                    <Check className="inline h-3 w-3 mr-0.5 text-brand-700" />
                    <strong>v1 approved</strong> by{" "}
                    {agent?.name ?? "agent"} — <strong>LOCKED</strong>
                  </>
                }
              />
            )}
          </div>
          <div className="px-5 py-3 border-t border-ink-100 bg-canvas-soft text-[11px] text-ink-500 italic">
            Plain chronological log of every state change. Both sides can
            scroll back to see what changed, when, and who acted.
          </div>
        </div>
      </div>

      {/* Counterparty footer */}
      <div className="mt-6 text-[12px] text-ink-500 leading-relaxed">
        Counterparty: <strong className="text-ink-700">{agent?.name}</strong>{" "}
        {agency?.name && (
          <span>· <strong className="text-ink-700">{agency.name}</strong></span>
        )}{" "}
        · {agent?.email}
      </div>

      <div className="mt-8 pt-6 border-t border-ink-100 flex items-center gap-3">
        <Link href="/deals">
          <Button variant="outline">Back to deals</Button>
        </Link>
        <span className="text-[11.5px] text-ink-400">
          Next ship (not built): settlement-against-the-locked-deal — same
          schema, same approval surface, post-show.
        </span>
      </div>
    </div>
  );
}

function LockedRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="px-5 py-3 grid grid-cols-[180px_1fr_auto] gap-4 items-center">
      <div className="text-[13px] text-ink-700 font-medium">{label}</div>
      <div className={`text-[13px] text-ink-900 ${mono ? "font-mono" : ""}`}>
        {value}
      </div>
      <span className="text-brand-700 text-[12px]">✓</span>
    </div>
  );
}

function TimelineItem({
  when,
  text,
  brand,
  amber,
}: {
  when: string;
  text: React.ReactNode;
  brand?: boolean;
  amber?: boolean;
}) {
  const dotColor = brand
    ? "bg-brand-500"
    : amber
      ? "bg-amber-500"
      : "bg-ink-300";
  return (
    <div className="flex gap-3">
      <div className="pt-1.5">
        <div className={`h-2 w-2 rounded-full ${dotColor}`} />
      </div>
      <div className="flex-1">
        <div className="text-[10.5px] uppercase tracking-wider text-ink-400 font-medium mb-0.5">
          {when}
        </div>
        <div className="text-[12.5px] text-ink-800 leading-relaxed">
          {text}
        </div>
      </div>
    </div>
  );
}
