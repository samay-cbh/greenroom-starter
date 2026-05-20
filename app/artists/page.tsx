import { getArtistProfiles } from "@/lib/queries";
import { ArtistsGrid } from "./artists-grid";

export default async function ArtistsPage() {
  const profiles = await getArtistProfiles();

  const avgHealth =
    profiles.length > 0
      ? profiles.reduce((s, p) => s + p.health.score, 0) / profiles.length
      : 0;
  const withDisputes = profiles.filter((p) => p.disputeCount > 0).length;
  const totalRevenue = profiles.reduce((s, p) => s + p.totalRevenue, 0);

  return (
    <div className="px-12 py-10 max-w-7xl">
      <div className="mb-10">
        <div className="eyebrow mb-3">Roster · Relationship Intelligence</div>
        <h1
          className="font-display text-[44px] font-medium text-ink-900 leading-[1.05]"
          style={{ letterSpacing: "-0.02em", fontOpticalSizing: "auto" }}
        >
          Artists
        </h1>
        <p className="text-[14px] text-ink-500 mt-3 max-w-xl leading-relaxed">
          {profiles.length} artists booked at The Crescent. Health scores,
          deal intelligence, and booking readiness at a glance.
        </p>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-4 gap-px bg-ink-200/40 rounded-xl overflow-hidden mb-10">
        <SummaryCard label="Artists" value={String(profiles.length)} />
        <SummaryCard
          label="Avg health"
          value={avgHealth.toFixed(1)}
          accent
        />
        <SummaryCard
          label="With disputes"
          value={String(withDisputes)}
          warn={withDisputes > 0}
        />
        <SummaryCard
          label="Total revenue"
          value={formatCompact(totalRevenue)}
          mono
        />
      </div>

      <ArtistsGrid profiles={profiles} />
    </div>
  );
}

function SummaryCard({
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
    <div className="bg-white px-6 py-4">
      <div
        className={`text-[26px] font-medium leading-none ${
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
      <div className="text-[11px] font-medium text-ink-400 uppercase tracking-[0.08em] mt-1.5">
        {label}
      </div>
    </div>
  );
}

function formatCompact(amount: number | null | undefined): string {
  if (amount == null) return "—";
  if (Math.abs(amount) >= 1000) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 1,
      notation: "compact",
    }).format(amount);
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}
