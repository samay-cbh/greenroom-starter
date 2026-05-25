"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle, Lightbulb, Loader2, ChevronDown, ChevronUp } from "lucide-react";

interface BriefProps {
  showId: string;
  dealNotes: string;
  dealType: string;
  guaranteeAmount: number | null;
  percentage: number | null;
  expenseCap: number | null;
  hospitalityCap: number | null;
  totalExpenses: number;
  showDate: string;
  artistName: string;
}

interface BriefResult {
  flags: { severity: "high" | "medium" | "low"; text: string }[];
  expenseReadiness: { label: string; status: "ready" | "missing" | "warning"; note: string }[];
  suggestedAction: string;
  summary: string;
}

export function PreSettlementBrief(props: BriefProps) {
  const [brief, setBrief] = useState<BriefResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const showDate = new Date(props.showDate);
  const now = new Date();
  const daysUntilShow = Math.ceil((showDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  const isUpcoming = daysUntilShow > 0;

  useEffect(() => {
    if (!isUpcoming) return;
    generateBrief();
  }, []);

  async function generateBrief() {
    setLoading(true);
    setError(null);
    try {
      const prompt = `You are an experienced music venue settlement analyst. Analyze this show deal and generate a pre-settlement brief for the booker.

SHOW: ${props.artistName}
DATE: ${props.showDate} (${daysUntilShow} days away)
DEAL TYPE: ${props.dealType}
GUARANTEE: ${props.guaranteeAmount ? "$" + props.guaranteeAmount.toLocaleString() : "none"}
PERCENTAGE: ${props.percentage ? (props.percentage * 100).toFixed(0) + "%" : "none"}
EXPENSE CAP: ${props.expenseCap ? "$" + props.expenseCap.toLocaleString() : "none stated"}
HOSPITALITY CAP: ${props.hospitalityCap ? "$" + props.hospitalityCap.toLocaleString() : "none stated"}
TOTAL EXPENSES SO FAR: $${props.totalExpenses.toLocaleString()}
DEAL NOTES (free text): "${props.dealNotes}"

Generate a JSON pre-settlement brief with this exact structure:
{
  "summary": "One sentence describing the deal and any notable complexity",
  "flags": [
    {"severity": "high|medium|low", "text": "specific issue to resolve before show night"}
  ],
  "expenseReadiness": [
    {"label": "category name", "status": "ready|missing|warning", "note": "short explanation"}
  ],
  "suggestedAction": "Single most important thing Mariana should do TODAY to prevent a 2am dispute"
}

Focus on:
- Ambiguous terms in the deal notes that could cause interpretation disputes
- Expense caps that are at risk of being exceeded
- Missing expense categories that typically appear for this deal type
- Any terms referenced as "per deal memo" or "see email" that aren't captured in the system
- The suggestedAction should be specific and actionable, not generic

Return ONLY the JSON object, no other text.`;

      const response = await fetch("/api/settlement-brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });

      const data = await response.json();
      const text = data.content?.[0]?.text ?? "";
      const clean = text.replace(/```json|```/g, "").trim();
      const parsed: BriefResult = JSON.parse(clean);
      setBrief(parsed);
    } catch (e) {
      setError("Brief unavailable — check deal notes manually.");
    } finally {
      setLoading(false);
    }
  }

  if (!isUpcoming) return null;

  const severityColor = {
    high: "text-rose-700 bg-rose-50 ring-rose-200",
    medium: "text-amber-700 bg-amber-50 ring-amber-200",
    low: "text-blue-700 bg-blue-50 ring-blue-200",
  };

  const severityIcon = {
    high: <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />,
    medium: <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />,
    low: <Lightbulb className="h-3.5 w-3.5 shrink-0 mt-0.5" />,
  };

  const statusColor = {
    ready: "text-brand-700",
    missing: "text-rose-600",
    warning: "text-amber-600",
  };

  return (
    <div className="mb-8 rounded-lg ring-1 ring-ink-200/60 bg-white overflow-hidden">
      <div
        className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-canvas-soft transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2.5">
          <div className="h-6 w-6 rounded-full bg-brand-700 flex items-center justify-center">
            <Lightbulb className="h-3.5 w-3.5 text-white" />
          </div>
          <div>
            <div className="text-[13px] font-semibold text-ink-900">Pre-settlement brief</div>
            <div className="text-[11.5px] text-ink-400">
              {loading ? "Analyzing deal notes..." : brief ? `${brief.flags.length} flag${brief.flags.length === 1 ? "" : "s"} · ${daysUntilShow} days to show` : `${daysUntilShow} days to show`}
            </div>
          </div>
        </div>
        {expanded ? <ChevronUp className="h-4 w-4 text-ink-400" /> : <ChevronDown className="h-4 w-4 text-ink-400" />}
      </div>

      {expanded && (
        <div className="px-5 pb-5 border-t border-ink-100">
          {loading && (
            <div className="flex items-center gap-2 py-6 text-ink-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-[13px]">Analyzing deal notes for settlement risks...</span>
            </div>
          )}

          {error && (
            <div className="text-[12.5px] text-ink-400 py-4">{error}</div>
          )}

          {brief && (
            <div className="space-y-5 pt-4">
              <p className="text-[13px] text-ink-600 leading-relaxed">{brief.summary}</p>

              {brief.flags.length > 0 && (
                <div>
                  <div className="text-[10px] font-semibold text-ink-400 uppercase tracking-wider mb-2.5">Flags</div>
                  <div className="space-y-2">
                    {brief.flags.map((flag, i) => (
                      <div key={i} className={`flex items-start gap-2 text-[12.5px] px-3 py-2.5 rounded-md ring-1 ${severityColor[flag.severity]}`}>
                        {severityIcon[flag.severity]}
                        <span>{flag.text}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {brief.expenseReadiness.length > 0 && (
                <div>
                  <div className="text-[10px] font-semibold text-ink-400 uppercase tracking-wider mb-2.5">Expense readiness</div>
                  <div className="space-y-1.5">
                    {brief.expenseReadiness.map((item, i) => (
                      <div key={i} className="flex items-start justify-between gap-3 text-[12.5px]">
                        <div className="flex items-center gap-1.5">
                          {item.status === "ready"
                            ? <CheckCircle className="h-3.5 w-3.5 text-brand-600 shrink-0" />
                            : <AlertTriangle className={`h-3.5 w-3.5 shrink-0 ${item.status === "missing" ? "text-rose-500" : "text-amber-500"}`} />
                          }
                          <span className="text-ink-700">{item.label}</span>
                        </div>
                        <span className={`text-right text-[11.5px] ${statusColor[item.status]}`}>{item.note}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="rounded-md bg-brand-50 ring-1 ring-brand-200/60 px-4 py-3">
                <div className="text-[10px] font-semibold text-brand-700 uppercase tracking-wider mb-1">Suggested action</div>
                <div className="text-[13px] text-ink-800 leading-relaxed">{brief.suggestedAction}</div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}