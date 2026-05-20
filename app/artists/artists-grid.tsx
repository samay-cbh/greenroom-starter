"use client";

import { useState, useMemo } from "react";
import {
  Search,
  ArrowUpDown,
  Filter,
  Star,
  AlertTriangle,
  TrendingUp,
  ChevronDown,
  RefreshCw,
  Users,
} from "lucide-react";
import { PlainBadge, DealTypeBadge } from "@/components/ui/badge";
import type { ArtistBookingProfile } from "@/lib/types";

type SortKey = "frequency" | "health" | "revenue" | "dispute_risk" | "last_booked";
type FilterKey = "all" | "high_dispute" | "needs_rebook" | "wasserman" | "wme" | "caa" | "paradigm" | "independent";

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "frequency", label: "Frequency" },
  { value: "health", label: "Health Score" },
  { value: "revenue", label: "Revenue" },
  { value: "dispute_risk", label: "Dispute Risk" },
  { value: "last_booked", label: "Last Booked" },
];

const FILTER_OPTIONS: { value: FilterKey; label: string }[] = [
  { value: "all", label: "All artists" },
  { value: "high_dispute", label: "High dispute risk" },
  { value: "needs_rebook", label: "Needs rebook" },
  { value: "wasserman", label: "Wasserman" },
  { value: "wme", label: "WME" },
  { value: "caa", label: "CAA" },
  { value: "paradigm", label: "Paradigm" },
  { value: "independent", label: "Independent" },
];

function formatMoney(amount: number | null | undefined): string {
  if (amount == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
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
  return formatMoney(amount);
}

export function ArtistsGrid({ profiles }: { profiles: ArtistBookingProfile[] }) {
  const [sort, setSort] = useState<SortKey>("frequency");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [query, setQuery] = useState("");
  const [sortDropdownOpen, setSortDropdownOpen] = useState(false);
  const [filterDropdownOpen, setFilterDropdownOpen] = useState(false);

  const filtered = useMemo(() => {
    let result = profiles;

    // Text search
    if (query.trim()) {
      const q = query.toLowerCase();
      result = result.filter(
        (p) =>
          p.artistName.toLowerCase().includes(q) ||
          p.agentName?.toLowerCase().includes(q) ||
          p.agencyName?.toLowerCase().includes(q) ||
          p.genre?.toLowerCase().includes(q),
      );
    }

    // Filter
    switch (filter) {
      case "high_dispute":
        result = result.filter((p) => p.disputeCount > 0);
        break;
      case "needs_rebook":
        result = result.filter((p) => {
          if (!p.lastShowDate) return false;
          const daysSince = Math.floor(
            (Date.now() - new Date(p.lastShowDate).getTime()) / (1000 * 60 * 60 * 24),
          );
          return daysSince > 180;
        });
        break;
      case "wasserman":
        result = result.filter((p) => p.agencyName === "Wasserman");
        break;
      case "wme":
        result = result.filter((p) => p.agencyName === "WME");
        break;
      case "caa":
        result = result.filter((p) => p.agencyName === "CAA");
        break;
      case "paradigm":
        result = result.filter((p) => p.agencyName === "Paradigm");
        break;
      case "independent":
        result = result.filter((p) => p.agencyName === "Independent");
        break;
    }

    // Sort
    result = [...result].sort((a, b) => {
      switch (sort) {
        case "frequency":
          return b.showCount - a.showCount;
        case "health":
          return b.health.score - a.health.score;
        case "revenue":
          return b.totalRevenue - a.totalRevenue;
        case "dispute_risk":
          return b.disputeCount - a.disputeCount;
        case "last_booked":
          return (b.lastShowDate ?? "").localeCompare(a.lastShowDate ?? "");
        default:
          return 0;
      }
    });

    return result;
  }, [profiles, sort, filter, query]);

  return (
    <div>
      {/* Control bar */}
      <div className="flex flex-wrap items-center gap-3 mb-8">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-ink-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Search artists, agents, genres…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-64 pl-9 pr-3 py-2 text-[13px] bg-white border border-ink-200/60 rounded-lg text-ink-900 placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-brand-700/20 focus:border-brand-300 transition-all"
          />
        </div>

        {/* Sort dropdown */}
        <div className="relative">
          <button
            onClick={() => {
              setSortDropdownOpen(!sortDropdownOpen);
              setFilterDropdownOpen(false);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-[12px] font-medium text-ink-700 bg-white border border-ink-200/60 rounded-lg hover:border-ink-300 transition-colors"
          >
            <ArrowUpDown className="h-3 w-3 text-ink-400" />
            {SORT_OPTIONS.find((o) => o.value === sort)?.label}
            <ChevronDown className="h-3 w-3 text-ink-400" />
          </button>
          {sortDropdownOpen && (
            <div className="absolute top-full left-0 mt-1 bg-white border border-ink-200/80 rounded-lg shadow-lg z-20 py-1 min-w-[160px]">
              {SORT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => {
                    setSort(opt.value);
                    setSortDropdownOpen(false);
                  }}
                  className={`w-full text-left px-3 py-1.5 text-[12px] hover:bg-ink-50 transition-colors ${
                    sort === opt.value
                      ? "text-brand-700 font-medium"
                      : "text-ink-700"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Filter dropdown */}
        <div className="relative">
          <button
            onClick={() => {
              setFilterDropdownOpen(!filterDropdownOpen);
              setSortDropdownOpen(false);
            }}
            className={`inline-flex items-center gap-1.5 px-3 py-2 text-[12px] font-medium border rounded-lg transition-colors ${
              filter !== "all"
                ? "text-brand-800 bg-brand-50 border-brand-200/60"
                : "text-ink-700 bg-white border-ink-200/60 hover:border-ink-300"
            }`}
          >
            <Filter className="h-3 w-3" />
            {FILTER_OPTIONS.find((o) => o.value === filter)?.label}
            <ChevronDown className="h-3 w-3" />
          </button>
          {filterDropdownOpen && (
            <div className="absolute top-full left-0 mt-1 bg-white border border-ink-200/80 rounded-lg shadow-lg z-20 py-1 min-w-[180px]">
              {FILTER_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => {
                    setFilter(opt.value);
                    setFilterDropdownOpen(false);
                  }}
                  className={`w-full text-left px-3 py-1.5 text-[12px] hover:bg-ink-50 transition-colors ${
                    filter === opt.value
                      ? "text-brand-700 font-medium"
                      : "text-ink-700"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="ml-auto text-[11px] text-ink-400 font-mono tabular">
          {filtered.length} of {profiles.length} artists
        </div>
      </div>

      {/* Results */}
      {filtered.length === 0 ? (
        <div className="py-20 text-center">
          <Users className="h-8 w-8 text-ink-200 mx-auto mb-3" />
          <div className="text-[14px] text-ink-500">
            {query
              ? `No artists matching "${query}"`
              : "No artists match the current filter."}
          </div>
          {(query || filter !== "all") && (
            <button
              onClick={() => {
                setQuery("");
                setFilter("all");
              }}
              className="mt-2 text-[12px] text-brand-700 hover:text-brand-800 font-medium"
            >
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filtered.map((profile) => (
            <ArtistCard key={profile.artistId} profile={profile} />
          ))}
        </div>
      )}
    </div>
  );
}

function ArtistCard({ profile }: { profile: ArtistBookingProfile }) {
  const p = profile;

  return (
    <div className="group relative rounded-lg border border-ink-200/60 bg-white transition-all duration-150 hover:shadow-[0_4px_16px_rgba(26,24,20,0.06)] hover:-translate-y-0.5 hover:border-ink-200 overflow-hidden">
      {/* Header */}
      <div className="px-5 pt-5 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[16px] font-medium text-ink-900 leading-tight group-hover:text-brand-800 transition-colors truncate">
              {p.artistName}
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[11.5px] text-ink-400 capitalize">
                {p.genre ?? "—"}
              </span>
              {p.agentName && (
                <>
                  <span className="text-ink-200">·</span>
                  <span className="text-[11.5px] text-ink-500 truncate">
                    {p.agentName}
                    {p.agencyName && (
                      <span className="text-ink-400"> · {p.agencyName}</span>
                    )}
                  </span>
                </>
              )}
            </div>
          </div>
          <HealthBadge score={p.health.score} />
        </div>

        {/* Status badges */}
        <div className="flex flex-wrap gap-1.5 mt-2.5">
          {p.disputeCount > 0 && (
            <PlainBadge variant="rose">
              {p.disputeCount} dispute{p.disputeCount === 1 ? "" : "s"}
            </PlainBadge>
          )}
          {p.showCount >= 6 && (
            <PlainBadge variant="brand">Regular</PlainBadge>
          )}
          {p.lastShowDate && (() => {
            const days = Math.floor(
              (Date.now() - new Date(p.lastShowDate).getTime()) / (1000 * 60 * 60 * 24),
            );
            return days > 180 ? <PlainBadge variant="amber">Rebook due</PlainBadge> : null;
          })()}
        </div>
      </div>

      {/* Booking history strip */}
      <div className="px-5 py-3 border-t border-ink-100/60">
        <div className="grid grid-cols-4 gap-3">
          <MiniField label="Shows" value={String(p.showCount)} mono />
          <MiniField
            label="Avg payout"
            value={p.avgPayout ? formatCompact(p.avgPayout) : "—"}
            mono
          />
          <MiniField
            label="Revenue"
            value={formatCompact(p.totalRevenue)}
            mono
          />
          <MiniField
            label="Compliance"
            value={`${Math.round(p.expenseComplianceRate * 100)}%`}
            mono
            accent={p.expenseComplianceRate < 0.7 ? "rose" : undefined}
          />
        </div>
      </div>

      {/* Deal mix */}
      {p.dealMix.length > 0 && (
        <div className="px-5 py-3 border-t border-ink-100/60">
          <div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-ink-400 mb-2">
            Deal mix
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {p.dealMix.map((d) => (
              <span
                key={d.dealType}
                className="inline-flex items-center gap-1"
              >
                <DealTypeBadge type={d.dealType} />
                <span className="text-[10px] font-mono tabular text-ink-400">
                  {Math.round(d.percentage * 100)}%
                </span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Health intelligence */}
      <div className="px-5 py-3 border-t border-ink-100/60 bg-ink-50/30">
        <div className="space-y-1">
          {p.health.statements.slice(0, 3).map((stmt, i) => (
            <div
              key={i}
              className="text-[11.5px] text-ink-600 flex items-start gap-1.5"
            >
              <span className="text-ink-300 mt-px">›</span>
              {stmt}
            </div>
          ))}
          {p.health.recommendedDealStructure && (
            <div className="text-[11.5px] text-brand-700 flex items-start gap-1.5 font-medium">
              <TrendingUp className="h-3 w-3 mt-px shrink-0" />
              {p.health.recommendedDealStructure}
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="px-5 py-3 border-t border-ink-100/60 flex items-center justify-between">
        <div className="text-[10.5px] text-ink-400 font-mono tabular">
          Last booked{" "}
          {p.lastShowDate
            ? new Date(p.lastShowDate).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })
            : "—"}
        </div>
        <button className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-brand-700 bg-brand-50 hover:bg-brand-100 rounded-md transition-colors ring-1 ring-inset ring-brand-200/60">
          <RefreshCw className="h-3 w-3" />
          Book again
        </button>
      </div>
    </div>
  );
}

function HealthBadge({ score }: { score: number }) {
  const color =
    score >= 4
      ? "text-brand-700 bg-brand-50 ring-brand-200/60"
      : score >= 3
        ? "text-ink-700 bg-ink-50 ring-ink-200/60"
        : score >= 2
          ? "text-amber-700 bg-amber-50 ring-amber-200/60"
          : "text-rose-700 bg-rose-50 ring-rose-200/60";

  return (
    <div
      className={`inline-flex items-center gap-1 px-2 py-1 rounded-md ring-1 ring-inset text-[11px] font-semibold ${color}`}
    >
      <Star className="h-3 w-3" />
      {score.toFixed(1)}
    </div>
  );
}

function MiniField({
  label,
  value,
  mono = false,
  accent,
}: {
  label: string;
  value: string;
  mono?: boolean;
  accent?: "rose" | "brand";
}) {
  return (
    <div>
      <div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-ink-400">
        {label}
      </div>
      <div
        className={`text-[13px] mt-0.5 leading-tight ${
          mono ? "font-mono tabular" : ""
        } ${
          accent === "rose"
            ? "text-rose-700"
            : accent === "brand"
              ? "text-brand-700"
              : "text-ink-900"
        }`}
      >
        {value}
      </div>
    </div>
  );
}
