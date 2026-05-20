"use client";

import { formatMoney } from "@/lib/format";
import type { Deal } from "@/db/schema";

const DEAL_COLORS: Record<string, { bar: string; bg: string; label: string }> = {
  flat: { bar: "bg-ink-500", bg: "bg-ink-50", label: "Flat Guarantee" },
  vs: { bar: "bg-amber-600", bg: "bg-amber-50", label: "Vs Deal" },
  percentage_of_net: { bar: "bg-sky-600", bg: "bg-sky-50", label: "% of Net" },
  percentage_of_gross: { bar: "bg-brand-600", bg: "bg-brand-50", label: "% of Gross" },
  door: { bar: "bg-rose-500", bg: "bg-rose-50", label: "Door Deal" },
};

export function DealVisualizer({
  deal,
  grossBoxOffice,
  totalExpenses,
  artistPayout,
}: {
  deal: Deal;
  grossBoxOffice: number;
  totalExpenses: number;
  artistPayout: number | null;
}) {
  const style = DEAL_COLORS[deal.dealType] ?? DEAL_COLORS.flat;
  const net = grossBoxOffice - totalExpenses;
  const payout = artistPayout ?? deal.guaranteeAmount ?? 0;
  const venueShare = grossBoxOffice > 0 ? Math.max(0, grossBoxOffice - payout) : 0;
  const payoutPct = grossBoxOffice > 0 ? (payout / grossBoxOffice) * 100 : 0;
  const venuePct = grossBoxOffice > 0 ? (venueShare / grossBoxOffice) * 100 : 0;

  return (
    <div>
      <div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-ink-400 mb-3">
        How this deal works
      </div>

      {/* Visual bar */}
      <div className="h-8 rounded-md overflow-hidden flex bg-ink-100/50 mb-3">
        {payoutPct > 0 && (
          <div
            className={`${style.bar} flex items-center justify-center transition-all duration-300`}
            style={{ width: `${Math.max(payoutPct, 8)}%` }}
          >
            <span className="text-[9px] font-semibold text-white tracking-wide uppercase truncate px-2">
              Artist
            </span>
          </div>
        )}
        {venuePct > 0 && (
          <div
            className="bg-ink-200 flex items-center justify-center transition-all duration-300"
            style={{ width: `${Math.max(venuePct, 8)}%` }}
          >
            <span className="text-[9px] font-semibold text-ink-600 tracking-wide uppercase truncate px-2">
              Venue
            </span>
          </div>
        )}
      </div>

      {/* Deal structure explanation */}
      <div className="space-y-2">
        {deal.dealType === "flat" && (
          <DealRow
            label="Flat guarantee"
            value={formatMoney(deal.guaranteeAmount)}
            note="Fixed amount regardless of box office performance"
          />
        )}

        {deal.dealType === "vs" && (
          <>
            <DealRow
              label="Guarantee"
              value={formatMoney(deal.guaranteeAmount)}
              note="Floor — artist gets at least this"
            />
            <div className="text-[11px] text-ink-500 font-medium pl-1">vs</div>
            <DealRow
              label={`${deal.percentage ? (deal.percentage * 100).toFixed(0) : "—"}% of ${deal.percentageBasis ?? "net"}`}
              value={formatMoney(net > 0 && deal.percentage ? net * deal.percentage : null)}
              note="Whichever is greater"
            />
          </>
        )}

        {deal.dealType === "percentage_of_net" && (
          <>
            <DealRow label="Gross" value={formatMoney(grossBoxOffice)} />
            <DealRow label="− Expenses" value={formatMoney(totalExpenses)} />
            <DealRow
              label={`× ${deal.percentage ? (deal.percentage * 100).toFixed(0) : "—"}%`}
              value={formatMoney(net > 0 && deal.percentage ? net * deal.percentage : null)}
              note="Artist's share of net after expenses"
            />
          </>
        )}

        {deal.dealType === "percentage_of_gross" && (
          <DealRow
            label={`${deal.percentage ? (deal.percentage * 100).toFixed(0) : "—"}% of gross`}
            value={formatMoney(deal.percentage ? grossBoxOffice * deal.percentage : null)}
            note="No expense deductions"
          />
        )}

        {deal.dealType === "door" && (
          <DealRow
            label="Door revenue − expenses"
            value={formatMoney(Math.max(0, grossBoxOffice - totalExpenses))}
            note="Artist gets ticket revenue minus venue expenses"
          />
        )}

        {/* Caps */}
        {(deal.expenseCap != null || deal.hospitalityCap != null) && (
          <div className="pt-2 border-t border-ink-100/60">
            <div className="flex gap-4">
              {deal.expenseCap != null && (
                <div className="text-[11px]">
                  <span className="text-ink-400">Expense cap:</span>{" "}
                  <span className="font-mono tabular text-ink-700">
                    {formatMoney(deal.expenseCap)}
                  </span>
                </div>
              )}
              {deal.hospitalityCap != null && (
                <div className="text-[11px]">
                  <span className="text-ink-400">Hospitality cap:</span>{" "}
                  <span className="font-mono tabular text-ink-700">
                    {formatMoney(deal.hospitalityCap)}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function DealRow({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <div>
        <span className="text-[12px] text-ink-700">{label}</span>
        {note && (
          <div className="text-[10px] text-ink-400 leading-snug">{note}</div>
        )}
      </div>
      <span className="text-[12.5px] font-mono tabular text-ink-900 shrink-0">
        {value}
      </span>
    </div>
  );
}
