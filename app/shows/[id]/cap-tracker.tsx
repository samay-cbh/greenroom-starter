import type { Deal, Expense } from "@/db/schema";

/**
 * Layer B — real-time cap tracker.
 *
 * Shows how expenses are burning against the deal caps right now.
 * No AI. Just arithmetic surfaced before show night so Mariana
 * isn't surprised at settlement.
 */
export function CapTracker({
  deal,
  expenses,
}: {
  deal: Deal;
  expenses: Expense[];
}) {
  const hasAnyCap = deal.expenseCap != null || deal.hospitalityCap != null;
  if (!hasAnyCap) return null;

  const passedThrough = expenses.filter((e) => !e.absorbedByVenue);

  const totalExpenses = passedThrough.reduce((s, e) => s + e.amount, 0);

  const hospitality = passedThrough
    .filter((e) => e.category === "hospitality")
    .reduce((s, e) => s + e.amount, 0);

  const nonHospitality = passedThrough
    .filter((e) => e.category !== "hospitality")
    .reduce((s, e) => s + e.amount, 0);

  const rows: {
    label: string;
    spent: number;
    cap: number | null;
  }[] = [];

  if (deal.expenseCap != null) {
    rows.push({ label: "Total expenses vs cap", spent: totalExpenses, cap: deal.expenseCap });
  }
  if (deal.hospitalityCap != null) {
    rows.push({ label: "Hospitality vs cap", spent: hospitality, cap: deal.hospitalityCap });
  }

  if (rows.length === 0) return null;

  return (
    <div className="rounded-lg ring-1 ring-ink-200/50 bg-canvas-soft p-4 space-y-3">
      <div className="eyebrow text-[10px] text-ink-500">Expense caps</div>
      {rows.map((row) => {
        const cap = row.cap!;
        const pct = Math.min(100, (row.spent / cap) * 100);
        const over = row.spent > cap;
        const overage = row.spent - cap;

        return (
          <div key={row.label} className="space-y-1.5">
            <div className="flex items-center justify-between text-[12px]">
              <span className="text-ink-600">{row.label}</span>
              <span className={`font-mono font-medium tabular-nums ${over ? "text-rose-700" : "text-ink-800"}`}>
                ${row.spent.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                {" / "}
                ${cap.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-ink-100 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${over ? "bg-rose-500" : pct > 85 ? "bg-amber-400" : "bg-emerald-500"}`}
                style={{ width: `${Math.min(100, pct)}%` }}
              />
            </div>
            {over && (
              <div className="text-[11.5px] text-rose-700 font-medium">
                ${overage.toLocaleString(undefined, { maximumFractionDigits: 0 })} over cap — unabsorbed overage will charge the artist above the agreed limit
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
