import { getAllShows, getShowTriageItems } from "@/lib/queries";
import {
  formatMoneyCompact,
  formatShowDate,
  formatShowMonth,
  relativeShowDate,
} from "@/lib/format";
import { ShowsList } from "./shows-list";
import type { ShowRow } from "./shows-list";

export default async function ShowsPage() {
  const [rows, triage] = await Promise.all([
    getAllShows(),
    getShowTriageItems(),
  ]);

  const reversed = [...rows].reverse();

  const settledCount = reversed.filter((r) => r.settlement).length;
  const disputedCount = reversed.filter(
    (r) => r.settlement?.status === "disputed",
  ).length;
  const unsettledCount = reversed.filter(
    (r) =>
      r.settlement &&
      !["paid", "voided"].includes(r.settlement.status),
  ).length;
  const unsignedCount = reversed.filter(
    (r) =>
      r.settlement &&
      ["draft", "submitted"].includes(r.settlement.status),
  ).length;
  const paidCount = reversed.filter(
    (r) => r.settlement?.status === "paid",
  ).length;
  const totalToArtists = reversed.reduce(
    (sum, r) => sum + (r.settlement?.totalToArtist ?? 0),
    0,
  );
  const avgPayout =
    paidCount > 0
      ? reversed
          .filter((r) => r.settlement?.status === "paid")
          .reduce((s, r) => s + (r.settlement?.totalToArtist ?? 0), 0) /
        paidCount
      : 0;

  const serialized: ShowRow[] = reversed.map(
    ({ show, artist, deal, settlement }) => ({
      show: {
        id: show.id,
        status: show.status as
          | "booked"
          | "advanced"
          | "day_of"
          | "settled"
          | "closed",
      },
      artist: artist ? { name: artist.name } : null,
      deal: deal
        ? {
            dealType: deal.dealType,
            guaranteeFormatted:
              deal.guaranteeAmount != null
                ? formatMoneyCompact(deal.guaranteeAmount)
                : null,
          }
        : null,
      settlement: settlement
        ? {
            totalFormatted:
              settlement.totalToArtist != null
                ? formatMoneyCompact(settlement.totalToArtist)
                : null,
            status: settlement.status,
          }
        : null,
      dateFormatted: formatShowDate(show.date),
      dateRelative: relativeShowDate(show.date),
      month: formatShowMonth(show.date),
    }),
  );

  return (
    <div className="px-12 py-10 max-w-7xl">
      <div className="mb-10">
        <div className="eyebrow mb-3">
          The Crescent · Nashville · 650 cap
        </div>
        <h1
          className="font-display text-[48px] font-medium text-ink-900 leading-[1.02]"
          style={{ letterSpacing: "-0.025em", fontOpticalSizing: "auto" }}
        >
          Shows
        </h1>
        <p className="text-[14px] text-ink-500 mt-3 max-w-lg leading-relaxed">
          Mariana&apos;s operations surface. {reversed.length} shows over
          24 months.
        </p>
      </div>

      {/* Enhanced metrics strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-px bg-ink-200/40 rounded-xl overflow-hidden mb-10">
        <StatCard label="Shows" value={String(reversed.length)} />
        <StatCard label="Paid" value={String(paidCount)} accent />
        <StatCard
          label="To artists"
          value={formatMoneyCompact(totalToArtists)}
          mono
        />
        <StatCard
          label="Avg payout"
          value={formatMoneyCompact(avgPayout)}
          mono
        />
        <StatCard
          label="Unsettled"
          value={String(unsettledCount)}
          warn={unsettledCount > 5}
        />
        <StatCard
          label="Disputed"
          value={String(disputedCount)}
          warn={disputedCount > 0}
        />
      </div>

      {/* Triage surface */}
      {(triage.thisWeekend.length > 0 ||
        triage.needsAttention.length > 0 ||
        triage.unresolved.length > 0) && (
        <div className="mb-14">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <TriageColumn
              title="This weekend"
              items={triage.thisWeekend}
              accent="brand"
              emptyMessage="No recent shows"
            />
            <TriageColumn
              title="Needs your attention"
              items={triage.needsAttention}
              accent="amber"
              emptyMessage="All clear"
            />
            <TriageColumn
              title="Unresolved"
              items={triage.unresolved}
              accent="rose"
              emptyMessage="No open issues"
            />
          </div>
        </div>
      )}

      <ShowsList rows={serialized} />
    </div>
  );
}

function StatCard({
  label,
  value,
  mono = false,
  accent = false,
  warn = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
  accent?: boolean;
  warn?: boolean;
}) {
  return (
    <div className="bg-white px-5 py-4">
      <div
        className={`text-[24px] font-medium leading-none ${
          warn
            ? "text-rose-700"
            : accent
              ? "text-brand-700"
              : "text-ink-900"
        } ${mono ? "font-mono tabular font-semibold! text-[20px]" : "font-display"}`}
        style={!mono ? { letterSpacing: "-0.02em" } : undefined}
      >
        {value}
      </div>
      <div className="text-[10px] font-medium text-ink-400 uppercase tracking-[0.08em] mt-1.5">
        {label}
      </div>
    </div>
  );
}

type TriageItem = {
  showId: string;
  artistName: string;
  dateFormatted: string;
  dateRelative: string;
  dealType: string | null;
  dealAmount: string | null;
  settlementStatus: string | null;
  settlementTotal: string | null;
  triageLabel: string;
  daysOld: number;
};

const DEAL_LABELS: Record<string, string> = {
  flat: "Flat",
  vs: "Vs",
  percentage_of_net: "% net",
  percentage_of_gross: "% gross",
  door: "Door",
};

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-ink-100 text-ink-600",
  submitted: "bg-sky-50 text-sky-700",
  in_review: "bg-sky-50 text-sky-700",
  signed: "bg-brand-50 text-brand-700",
  disputed: "bg-rose-50 text-rose-700",
  revised: "bg-amber-50 text-amber-700",
  finalized: "bg-brand-50 text-brand-700",
  paid: "bg-brand-50 text-brand-700",
};

function TriageColumn({
  title,
  items,
  accent,
  emptyMessage,
}: {
  title: string;
  items: TriageItem[];
  accent: "brand" | "amber" | "rose";
  emptyMessage: string;
}) {
  const accentColors = {
    brand: "border-brand-200/60 from-brand-50/20",
    amber: "border-amber-200/60 from-amber-50/20",
    rose: "border-rose-200/60 from-rose-50/20",
  };
  const titleColors = {
    brand: "text-brand-800",
    amber: "text-amber-800",
    rose: "text-rose-800",
  };
  const dotColors = {
    brand: "bg-brand-500",
    amber: "bg-amber-500",
    rose: "bg-rose-500",
  };

  return (
    <div
      className={`rounded-lg border ${accentColors[accent]} bg-linear-to-b to-white overflow-hidden`}
    >
      <div className="px-4 py-3 border-b border-ink-100/60 flex items-center gap-2">
        <span
          className={`w-1.5 h-1.5 rounded-full ${dotColors[accent]}`}
        />
        <h3
          className={`text-[11px] font-semibold uppercase tracking-widest ${titleColors[accent]}`}
        >
          {title}
        </h3>
        {items.length > 0 && (
          <span className="ml-auto text-[10px] font-mono tabular text-ink-400">
            {items.length}
          </span>
        )}
      </div>

      {items.length === 0 ? (
        <div className="px-4 py-6 text-center text-[12px] text-ink-400">
          {emptyMessage}
        </div>
      ) : (
        <div className="divide-y divide-ink-100/60">
          {items.map((item) => (
            <a
              key={item.showId}
              href={`/shows/${item.showId}`}
              className="block px-4 py-3 hover:bg-white/80 transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[13px] font-medium text-ink-900 truncate">
                    {item.artistName}
                  </div>
                  <div className="text-[10.5px] text-ink-400 mt-0.5">
                    {item.dateFormatted} · {item.dateRelative}
                  </div>
                </div>
                {item.settlementTotal && (
                  <div className="text-[12px] font-mono tabular text-ink-700 shrink-0">
                    {item.settlementTotal}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1.5 mt-2">
                {item.dealType && (
                  <span className="text-[9px] font-medium uppercase tracking-wider text-ink-500 px-1.5 py-px rounded bg-ink-50 ring-1 ring-ink-200/50">
                    {DEAL_LABELS[item.dealType] ?? item.dealType}
                  </span>
                )}
                {item.settlementStatus && (
                  <span
                    className={`text-[9px] font-medium px-1.5 py-px rounded ${STATUS_STYLES[item.settlementStatus] ?? "bg-ink-100 text-ink-600"}`}
                  >
                    {item.settlementStatus.replace("_", " ")}
                  </span>
                )}
              </div>
              <div className="text-[10.5px] text-ink-500 mt-1.5 leading-snug">
                {item.triageLabel}
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
