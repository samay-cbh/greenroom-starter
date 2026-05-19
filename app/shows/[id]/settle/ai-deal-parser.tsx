"use client";

import { useState } from "react";
import { Sparkles, AlertTriangle, ChevronDown } from "lucide-react";
import type { Deal } from "@/db/schema";
import type { ParsedDealTerms } from "@/app/api/parse-deal/route";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PlainBadge } from "@/components/ui/badge";

// ---- props ----------------------------------------------------------------

interface Props {
  deal: Deal;
  grossBoxOffice: number;
  totalFees: number;
  totalExpenses: number;
  venueCapacity?: number;
  ticketsSold: number;
  artistName: string;
}

// ---- client-side calculation ----------------------------------------------

interface CalcResult {
  supported: boolean;
  unsupportedReason?: string;
  totalToArtist: number;
  steps: { label: string; value: number; note?: string }[];
  finalFormula: string;
  grossBoxOffice: number;
  netBoxOffice: number;
  cappedExpenses: number;
}

function applyBonuses(
  bonuses: ParsedDealTerms["bonuses"],
  gross: number,
): { steps: { label: string; value: number; note?: string }[]; total: number } {
  const steps: { label: string; value: number; note?: string }[] = [];
  let total = 0;
  for (const b of bonuses) {
    if (b.type === "gross_percentage_above_threshold") {
      if (gross > b.threshold) {
        const amount = (gross - b.threshold) * b.percentage;
        steps.push({
          label: b.label,
          value: amount,
          note: `${(b.percentage * 100).toFixed(0)}% × ($${gross.toLocaleString()} − $${b.threshold.toLocaleString()})`,
        });
        total += amount;
      }
    } else if (b.type === "gross_threshold") {
      if (gross >= b.threshold) {
        steps.push({ label: b.label, value: b.amount, note: `Gross $${gross.toLocaleString()} ≥ $${b.threshold.toLocaleString()}` });
        total += b.amount;
      }
    } else if (b.type === "sellout") {
      // Sellout requires capacity — skip client-side, shown separately
    } else if (b.type === "attendance_threshold") {
      // Attendance requires ticket count — skip client-side
    }
  }
  return { steps, total };
}

function runCalculation(
  terms: ParsedDealTerms,
  grossBoxOffice: number,
  totalFees: number,
  totalExpenses: number,
): CalcResult {
  const cappedExpenses =
    terms.expenseCap != null
      ? Math.min(totalExpenses, terms.expenseCap)
      : totalExpenses;
  const netBoxOffice = grossBoxOffice - totalFees - cappedExpenses;

  const expenseCapNote =
    terms.expenseCap != null && totalExpenses > terms.expenseCap
      ? `Actual $${totalExpenses.toLocaleString()} → capped at $${terms.expenseCap.toLocaleString()} per deal`
      : undefined;

  const bonusResult = applyBonuses(terms.bonuses, grossBoxOffice);

  if (terms.dealType === "flat") {
    const g = terms.guaranteeAmount ?? 0;
    return {
      supported: true,
      totalToArtist: g + bonusResult.total,
      grossBoxOffice,
      netBoxOffice,
      cappedExpenses,
      steps: [
        { label: "Flat guarantee", value: g, note: "No expense deductions." },
        ...bonusResult.steps,
      ],
      finalFormula: `flat guarantee = $${g.toLocaleString()}`,
    };
  }

  if (terms.dealType === "percentage_of_gross") {
    const pct = terms.percentage ?? 0;
    const payout = grossBoxOffice * pct;
    return {
      supported: true,
      totalToArtist: payout + bonusResult.total,
      grossBoxOffice,
      netBoxOffice,
      cappedExpenses,
      steps: [
        { label: "Gross box office", value: grossBoxOffice },
        { label: `× ${(pct * 100).toFixed(0)}%`, value: payout, note: "No expense deductions." },
        ...bonusResult.steps,
      ],
      finalFormula: `gross × ${(pct * 100).toFixed(0)}% = $${payout.toFixed(2)}`,
    };
  }

  if (terms.dealType === "percentage_of_net") {
    const pct = terms.percentage ?? 0;
    const payout = Math.max(0, netBoxOffice) * pct;
    return {
      supported: true,
      totalToArtist: payout + bonusResult.total,
      grossBoxOffice,
      netBoxOffice,
      cappedExpenses,
      steps: [
        { label: "Gross box office", value: grossBoxOffice },
        { label: "− Ticketing fees", value: -totalFees },
        { label: "− Approved expenses", value: -cappedExpenses, note: expenseCapNote },
        { label: "= Net box office", value: netBoxOffice },
        { label: `× ${(pct * 100).toFixed(0)}%`, value: payout },
        ...bonusResult.steps,
      ],
      finalFormula: `(gross − fees − expenses) × ${(pct * 100).toFixed(0)}% = $${payout.toFixed(2)}`,
    };
  }

  if (terms.dealType === "vs") {
    const g = terms.guaranteeAmount ?? 0;
    const pct = terms.percentage ?? 0;
    const percentageSide = Math.max(0, netBoxOffice) * pct;
    const percentageWon = percentageSide > g;
    const base = Math.max(g, percentageSide);
    return {
      supported: true,
      totalToArtist: base + bonusResult.total,
      grossBoxOffice,
      netBoxOffice,
      cappedExpenses,
      steps: [
        { label: "Flat guarantee", value: g, note: percentageWon ? "Not applied — percentage side is higher" : "Applied — higher of the two" },
        { label: "Gross box office", value: grossBoxOffice },
        { label: "− Ticketing fees", value: -totalFees },
        { label: "− Approved expenses", value: -cappedExpenses, note: expenseCapNote },
        { label: "= Net box office", value: netBoxOffice },
        {
          label: `× ${(pct * 100).toFixed(0)}% (percentage side)`,
          value: percentageSide,
          note: percentageWon ? "Applied — higher of the two" : "Not applied — guarantee is higher",
        },
        { label: "Artist base (higher side wins)", value: base },
        ...bonusResult.steps,
      ],
      finalFormula: `max($${g.toLocaleString()} guarantee, net × ${(pct * 100).toFixed(0)}%) = $${base.toFixed(2)}`,
    };
  }

  return {
    supported: false,
    unsupportedReason: `Door deal calculation isn't handled by the AI parser yet.`,
    totalToArtist: 0,
    grossBoxOffice,
    netBoxOffice,
    cappedExpenses,
    steps: [],
    finalFormula: "",
  };
}

// ---- helpers ---------------------------------------------------------------

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

function confidenceColor(c: ParsedDealTerms["confidence"]) {
  return c === "high" ? "brand" : c === "medium" ? "default" : "rose";
}

// ---- component -------------------------------------------------------------

type UIState = "idle" | "loading" | "error" | "parsed" | "calculated";

export function AIDealParser({
  deal,
  grossBoxOffice,
  totalFees,
  totalExpenses,
  venueCapacity,
  artistName,
}: Props) {
  const [uiState, setUiState] = useState<UIState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedDealTerms | null>(null);
  const [calcResult, setCalcResult] = useState<CalcResult | null>(null);

  // Editable parsed terms
  const [dealType, setDealType] = useState<ParsedDealTerms["dealType"]>("vs");
  const [guaranteeAmount, setGuaranteeAmount] = useState<string>("");
  const [percentage, setPercentage] = useState<string>("");
  const [expenseCap, setExpenseCap] = useState<string>("");
  const [hospitalityCap, setHospitalityCap] = useState<string>("");

  const hasNotes = !!deal.dealNotesFreetext?.trim();

  const handleParse = async () => {
    setUiState("loading");
    setError(null);
    setCalcResult(null);
    try {
      const res = await fetch("/api/parse-deal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dealNotes: deal.dealNotesFreetext,
          artistName,
          grossBoxOffice,
          totalExpenses,
          venueCapacity,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        setUiState("error");
        return;
      }
      const terms: ParsedDealTerms = data;
      setParsed(terms);
      setDealType(terms.dealType);
      setGuaranteeAmount(terms.guaranteeAmount != null ? String(terms.guaranteeAmount) : "");
      setPercentage(terms.percentage != null ? String((terms.percentage * 100).toFixed(1)) : "");
      setExpenseCap(terms.expenseCap != null ? String(terms.expenseCap) : "");
      setHospitalityCap(terms.hospitalityCap != null ? String(terms.hospitalityCap) : "");
      setUiState("parsed");
    } catch {
      setError("Network error. Check your connection and try again.");
      setUiState("error");
    }
  };

  const handleCalculate = () => {
    const terms: ParsedDealTerms = {
      dealType,
      guaranteeAmount: guaranteeAmount !== "" ? parseFloat(guaranteeAmount) : null,
      percentage: percentage !== "" ? parseFloat(percentage) / 100 : null,
      expenseCap: expenseCap !== "" ? parseFloat(expenseCap) : null,
      hospitalityCap: hospitalityCap !== "" ? parseFloat(hospitalityCap) : null,
      bonuses: parsed?.bonuses ?? [],
      recoups: parsed?.recoups ?? [],
      confidence: parsed?.confidence ?? "medium",
      aiNotes: parsed?.aiNotes ?? "",
    };
    const result = runCalculation(terms, grossBoxOffice, totalFees, totalExpenses);
    setCalcResult(result);
    setUiState("calculated");
  };

  return (
    <div className="space-y-6">
      {/* Deal notes + parse trigger */}
      <Card accent="brand">
        <CardHeader>
          <div>
            <CardTitle>AI Deal Parser</CardTitle>
            <CardDescription>
              Let AI read the deal notes and extract the structured terms needed to run the settlement math.
            </CardDescription>
          </div>
          <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[10.5px] font-medium ring-1 ring-inset bg-brand-50 text-brand-700 ring-brand-200/80">
            <Sparkles className="h-3 w-3" />
            Powered by Claude
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {hasNotes ? (
            <div>
              <div className="eyebrow text-[10px] text-ink-500 mb-2">
                Deal notes (what Mariana actually trusts)
              </div>
              <div className="text-[12.5px] text-ink-800 bg-canvas-soft rounded-lg p-4 ring-1 ring-ink-200/60 leading-relaxed whitespace-pre-wrap">
                {deal.dealNotesFreetext}
              </div>
            </div>
          ) : (
            <div className="text-[13px] text-ink-400 bg-canvas-soft rounded-lg p-4 ring-1 ring-ink-200/60">
              No deal notes on file. Add free-text deal notes to enable AI parsing.
            </div>
          )}

          {uiState === "error" && error && (
            <div className="flex items-start gap-2.5 rounded-lg bg-rose-50 ring-1 ring-rose-200/60 p-3.5">
              <AlertTriangle className="h-4 w-4 text-rose-700 mt-0.5 shrink-0" />
              <div className="text-[12.5px] text-rose-800">{error}</div>
            </div>
          )}

          <Button
            onClick={handleParse}
            disabled={!hasNotes || uiState === "loading"}
            className="gap-2"
          >
            {uiState === "loading" ? (
              <>
                <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Reading deal notes…
              </>
            ) : (
              <>
                <Sparkles className="h-3.5 w-3.5" />
                {uiState === "parsed" || uiState === "calculated" ? "Re-parse notes" : "Parse deal notes with AI"}
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Parsed terms — editable form */}
      {(uiState === "parsed" || uiState === "calculated") && parsed && (
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Extracted deal terms</CardTitle>
              <CardDescription>
                Review and correct before running the calculation. These fields are not saved — they&apos;re used for this settlement only.
              </CardDescription>
            </div>
            <PlainBadge variant={confidenceColor(parsed.confidence)}>
              {parsed.confidence === "high" ? "High confidence" : parsed.confidence === "medium" ? "Medium confidence" : "Low confidence — review carefully"}
            </PlainBadge>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* AI explanation */}
            {parsed.aiNotes && (
              <div className={`flex items-start gap-2.5 rounded-lg p-3.5 ring-1 ${parsed.confidence === "low" ? "bg-amber-50 ring-amber-200/60" : "bg-brand-50/50 ring-brand-200/40"}`}>
                <Sparkles className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${parsed.confidence === "low" ? "text-amber-700" : "text-brand-700"}`} />
                <div className={`text-[12.5px] leading-relaxed ${parsed.confidence === "low" ? "text-amber-900" : "text-ink-700"}`}>
                  {parsed.aiNotes}
                </div>
              </div>
            )}

            {/* Fields */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="eyebrow text-[10px] text-ink-500 block mb-1.5">Deal type</label>
                <div className="relative">
                  <select
                    value={dealType}
                    onChange={(e) => setDealType(e.target.value as ParsedDealTerms["dealType"])}
                    className="w-full appearance-none bg-white border border-ink-200/80 rounded-lg px-3 py-2 text-[13px] text-ink-900 pr-8 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500"
                  >
                    <option value="flat">Flat guarantee</option>
                    <option value="percentage_of_gross">Percentage of gross</option>
                    <option value="percentage_of_net">Percentage of net</option>
                    <option value="vs">Vs deal (guarantee vs % of net)</option>
                    <option value="door">Door deal</option>
                  </select>
                  <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-ink-400 pointer-events-none" />
                </div>
              </div>

              {(dealType === "flat" || dealType === "vs") && (
                <div>
                  <label className="eyebrow text-[10px] text-ink-500 block mb-1.5">Guarantee amount</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-ink-400">$</span>
                    <input
                      type="number"
                      value={guaranteeAmount}
                      onChange={(e) => setGuaranteeAmount(e.target.value)}
                      placeholder="0"
                      className="w-full bg-white border border-ink-200/80 rounded-lg pl-6 pr-3 py-2 text-[13px] text-ink-900 font-mono tabular focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500"
                    />
                  </div>
                </div>
              )}

              {(dealType === "percentage_of_gross" || dealType === "percentage_of_net" || dealType === "vs") && (
                <div>
                  <label className="eyebrow text-[10px] text-ink-500 block mb-1.5">Percentage</label>
                  <div className="relative">
                    <input
                      type="number"
                      value={percentage}
                      onChange={(e) => setPercentage(e.target.value)}
                      placeholder="85"
                      min={0}
                      max={100}
                      step={0.1}
                      className="w-full bg-white border border-ink-200/80 rounded-lg pl-3 pr-7 py-2 text-[13px] text-ink-900 font-mono tabular focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-ink-400">%</span>
                  </div>
                </div>
              )}

              {(dealType === "percentage_of_net" || dealType === "vs") && (
                <div>
                  <label className="eyebrow text-[10px] text-ink-500 block mb-1.5">Expense cap <span className="text-ink-300">(optional)</span></label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-ink-400">$</span>
                    <input
                      type="number"
                      value={expenseCap}
                      onChange={(e) => setExpenseCap(e.target.value)}
                      placeholder="No cap"
                      className="w-full bg-white border border-ink-200/80 rounded-lg pl-6 pr-3 py-2 text-[13px] text-ink-900 font-mono tabular focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500"
                    />
                  </div>
                </div>
              )}

              {(dealType === "percentage_of_net" || dealType === "vs") && (
                <div>
                  <label className="eyebrow text-[10px] text-ink-500 block mb-1.5">Hospitality cap <span className="text-ink-300">(optional)</span></label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-ink-400">$</span>
                    <input
                      type="number"
                      value={hospitalityCap}
                      onChange={(e) => setHospitalityCap(e.target.value)}
                      placeholder="No cap"
                      className="w-full bg-white border border-ink-200/80 rounded-lg pl-6 pr-3 py-2 text-[13px] text-ink-900 font-mono tabular focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Extracted recoups */}
            {parsed.recoups.length > 0 && (
              <div>
                <div className="eyebrow text-[10px] text-ink-500 mb-2">Recoups mentioned in notes</div>
                <div className="space-y-1.5">
                  {parsed.recoups.map((r, i) => (
                    <div key={i} className="flex items-center justify-between rounded-lg bg-canvas-soft px-3.5 py-2.5 ring-1 ring-ink-100/80">
                      <div>
                        <div className="text-[12.5px] text-ink-800">{r.description}</div>
                        <div className="text-[11px] text-ink-400 mt-0.5">{r.category}</div>
                      </div>
                      <div className="text-[12.5px] font-mono tabular text-ink-700">{fmt(r.amount)}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <Button onClick={handleCalculate} className="w-full sm:w-auto">
              Run settlement calculation
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Calculation results */}
      {uiState === "calculated" && calcResult && (
        <>
          {calcResult.supported ? (
            <>
              {/* Hero */}
              <div className="text-center py-10 mb-2">
                <div className="eyebrow text-[10px] text-ink-400 mb-3">Total to artist</div>
                <div
                  className="text-[72px] font-mono tabular font-bold text-ink-900 leading-none"
                  style={{ letterSpacing: "-0.03em" }}
                >
                  {fmt(calcResult.totalToArtist)}
                </div>
                <div className="mt-3 text-[12px] text-ink-400">
                  Calculated from AI-parsed deal terms · not yet saved
                </div>
              </div>

              {/* Worksheet */}
              <Card accent="brand">
                <CardHeader>
                  <div>
                    <CardTitle>Settlement worksheet</CardTitle>
                    <CardDescription className="font-mono text-[11.5px]">
                      {calcResult.finalFormula}
                    </CardDescription>
                  </div>
                </CardHeader>
                <CardContent className="divide-y divide-ink-100/80">
                  <WorksheetRow label="Gross box office" value={fmt(calcResult.grossBoxOffice)} />
                  <WorksheetRow label="Net box office" value={fmt(calcResult.netBoxOffice)} />
                  <WorksheetRow label="Expenses (passed through)" value={fmt(calcResult.cappedExpenses)} />
                  <div className="pt-3" />
                  {calcResult.steps.map((step, i) => (
                    <WorksheetRow
                      key={i}
                      label={step.label}
                      value={step.value < 0 ? `(${fmt(Math.abs(step.value))})` : fmt(step.value)}
                      note={step.note}
                    />
                  ))}
                  <div className="pt-3" />
                  <div className="flex items-baseline justify-between py-3 font-semibold">
                    <span className="text-[13px] text-ink-900">Total to artist</span>
                    <span className="text-[18px] font-mono tabular text-ink-900">
                      {fmt(calcResult.totalToArtist)}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </>
          ) : (
            <Card>
              <CardContent className="py-8 text-center">
                <p className="text-[13px] text-ink-500">{calcResult.unsupportedReason}</p>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function WorksheetRow({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="flex items-baseline justify-between py-2.5">
      <div>
        <div className="text-[13px] text-ink-600">{label}</div>
        {note && <div className="text-[11.5px] text-ink-400 mt-0.5 max-w-md leading-snug">{note}</div>}
      </div>
      <div className="text-[13.5px] text-ink-900 font-mono tabular">{value}</div>
    </div>
  );
}
