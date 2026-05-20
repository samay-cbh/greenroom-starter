"use client";

import { useState, useCallback } from "react";
import { Calculator, ArrowRight, RotateCcw, Send } from "lucide-react";
import { Button } from "@/components/ui/button";

interface CalcField {
  id: string;
  label: string;
  value: number;
  editable: boolean;
  format: "money" | "percent" | "number";
}

function fmt(v: number, format: "money" | "percent" | "number"): string {
  if (format === "money")
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 2,
    }).format(v);
  if (format === "percent") return `${(v * 100).toFixed(1)}%`;
  return v.toLocaleString();
}

export function SettlementCalculator({
  grossBoxOffice,
  fees,
  totalExpenses,
  guarantee,
  percentage,
  percentageBasis,
  dealType,
  showId,
}: {
  grossBoxOffice: number;
  fees: number;
  totalExpenses: number;
  guarantee: number | null;
  percentage: number | null;
  percentageBasis: string | null;
  dealType: string;
  showId: string;
}) {
  const [fields, setFields] = useState<CalcField[]>(() => [
    { id: "gross", label: "Gross box office", value: grossBoxOffice, editable: true, format: "money" },
    { id: "fees", label: "Fees", value: fees, editable: true, format: "money" },
    { id: "expenses", label: "Expenses", value: totalExpenses, editable: true, format: "money" },
    ...(guarantee != null
      ? [{ id: "guarantee", label: "Guarantee", value: guarantee, editable: true, format: "money" as const }]
      : []),
    ...(percentage != null
      ? [{ id: "pct", label: "Artist %", value: percentage, editable: true, format: "percent" as const }]
      : []),
  ]);

  const [customLines, setCustomLines] = useState<{ label: string; value: number }[]>([]);

  const updateField = useCallback((id: string, value: number) => {
    setFields((prev) =>
      prev.map((f) => (f.id === id ? { ...f, value } : f)),
    );
  }, []);

  const getVal = (id: string) => fields.find((f) => f.id === id)?.value ?? 0;

  // Calculate result
  const gross = getVal("gross");
  const feeVal = getVal("fees");
  const exp = getVal("expenses");
  const guar = getVal("guarantee");
  const pct = getVal("pct");
  const net = gross - feeVal - exp;
  const customTotal = customLines.reduce((s, l) => s + l.value, 0);

  let baseCalc = 0;
  let formula = "";

  switch (dealType) {
    case "flat":
      baseCalc = guar;
      formula = `Flat guarantee: ${fmt(guar, "money")}`;
      break;
    case "vs":
      const pctAmount = percentageBasis === "gross" ? gross * pct : net * pct;
      baseCalc = Math.max(guar, pctAmount);
      formula = `max(${fmt(guar, "money")}, ${fmt(pct, "percent")} of ${percentageBasis ?? "net"})`;
      break;
    case "percentage_of_net":
      baseCalc = Math.max(0, net * pct);
      formula = `${fmt(pct, "percent")} of net (${fmt(net, "money")})`;
      break;
    case "percentage_of_gross":
      baseCalc = gross * pct;
      formula = `${fmt(pct, "percent")} of gross`;
      break;
    case "door":
      baseCalc = Math.max(0, gross - exp);
      formula = "Gross − expenses";
      break;
    default:
      baseCalc = 0;
      formula = "Manual calculation";
  }

  const totalToArtist = baseCalc + customTotal;

  const resetAll = () => {
    setFields((prev) =>
      prev.map((f) => {
        if (f.id === "gross") return { ...f, value: grossBoxOffice };
        if (f.id === "fees") return { ...f, value: fees };
        if (f.id === "expenses") return { ...f, value: totalExpenses };
        if (f.id === "guarantee" && guarantee != null) return { ...f, value: guarantee };
        if (f.id === "pct" && percentage != null) return { ...f, value: percentage };
        return f;
      }),
    );
    setCustomLines([]);
  };

  const addCustomLine = () => {
    setCustomLines((prev) => [...prev, { label: "Adjustment", value: 0 }]);
  };

  return (
    <div className="rounded-lg border border-ink-300/60 bg-white overflow-hidden shadow-[0_2px_8px_rgba(26,24,20,0.06)]">
      {/* Header */}
      <div className="px-5 py-4 border-b border-ink-200/60 bg-ink-900">
        <div className="flex items-center gap-2">
          <Calculator className="h-4 w-4 text-brand-400" />
          <span className="text-[12px] font-semibold text-white uppercase tracking-widest">
            Settlement Calculator
          </span>
        </div>
        <div className="text-[10px] text-ink-400 mt-1 font-mono">
          {formula}
        </div>
      </div>

      {/* Editable fields */}
      <div className="divide-y divide-ink-100/60">
        {fields.map((field) => (
          <div key={field.id} className="px-5 py-3 flex items-center justify-between gap-3">
            <label className="text-[11.5px] text-ink-600 shrink-0">
              {field.label}
            </label>
            {field.editable ? (
              <input
                type="number"
                value={field.format === "percent" ? +(field.value * 100).toFixed(1) : +field.value.toFixed(2)}
                onChange={(e) => {
                  const raw = parseFloat(e.target.value) || 0;
                  updateField(field.id, field.format === "percent" ? raw / 100 : raw);
                }}
                step={field.format === "percent" ? 0.5 : 50}
                className="w-32 text-right font-mono tabular text-[13px] text-ink-900 bg-ink-50/50 border border-ink-200/60 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-brand-700/20 focus:border-brand-300"
              />
            ) : (
              <span className="font-mono tabular text-[13px] text-ink-900">
                {fmt(field.value, field.format)}
              </span>
            )}
          </div>
        ))}

        {/* Custom lines */}
        {customLines.map((line, i) => (
          <div key={i} className="px-5 py-3 flex items-center justify-between gap-3 bg-brand-50/20">
            <input
              type="text"
              value={line.label}
              onChange={(e) => {
                setCustomLines((prev) =>
                  prev.map((l, j) => (j === i ? { ...l, label: e.target.value } : l)),
                );
              }}
              className="flex-1 text-[11.5px] text-ink-700 bg-transparent border-0 p-0 focus:outline-none"
              placeholder="Line label"
            />
            <input
              type="number"
              value={line.value}
              onChange={(e) => {
                setCustomLines((prev) =>
                  prev.map((l, j) => (j === i ? { ...l, value: parseFloat(e.target.value) || 0 } : l)),
                );
              }}
              step={50}
              className="w-32 text-right font-mono tabular text-[13px] text-ink-900 bg-white border border-ink-200/60 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-brand-700/20"
            />
          </div>
        ))}
      </div>

      {/* Result */}
      <div className="px-5 py-5 bg-ink-900 border-t border-ink-800">
        <div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-ink-400 mb-1">
          Total to artist
        </div>
        <div className="text-[32px] font-mono tabular font-bold text-white leading-none" style={{ letterSpacing: "-0.02em" }}>
          {fmt(totalToArtist, "money")}
        </div>
      </div>

      {/* Actions */}
      <div className="px-5 py-3 border-t border-ink-200/60 flex items-center gap-2">
        <button
          onClick={addCustomLine}
          className="text-[11px] font-medium text-ink-600 hover:text-ink-900 transition-colors"
        >
          + Add line
        </button>
        <button
          onClick={resetAll}
          className="text-[11px] font-medium text-ink-400 hover:text-ink-700 transition-colors flex items-center gap-1 ml-auto"
        >
          <RotateCcw className="h-3 w-3" /> Reset
        </button>
        <a href={`/shows/${showId}/settle`}>
          <Button variant="brand" size="sm">
            <Send className="h-3 w-3" />
            Push to settlement
          </Button>
        </a>
      </div>
    </div>
  );
}
