"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ShieldAlert, ChevronDown, ChevronUp, Loader2, CheckCircle, X } from "lucide-react";
import type { NotesExtractionResult, FieldContradiction, FieldAmbiguity, ShadowDeal } from "@/lib/notesExtractor";

export function NotesExtractionBadge({
  showId,
  hasNotes,
  shadowDeal,
  cached,
  liveContradictions,
  liveAmbiguities,
  dismissedFields,
  rateLimited = false,
  rateLimitRetryAfter,
}: {
  showId: string;
  hasNotes: boolean;
  shadowDeal: ShadowDeal | null;
  cached: NotesExtractionResult | null;
  liveContradictions: FieldContradiction[];
  liveAmbiguities: FieldAmbiguity[];
  dismissedFields: string[];
  rateLimited?: boolean;
  rateLimitRetryAfter?: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [fixing, setFixing] = useState<string | null>(null);
  const [syncDone, setSyncDone] = useState(false);
  // Client-side dismissed sets for instant UX — server pre-filters on next refresh
  const [resolvedContradictions, setResolvedContradictions] = useState<Set<string>>(new Set());
  const [resolvedAmbiguities, setResolvedAmbiguities] = useState<Set<string>>(new Set());

  async function persistDismissal(field: string) {
    const updated = [...new Set([...dismissedFields, field])];
    await fetch(`/api/shows/${showId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shadowDismissalsJson: JSON.stringify(updated) }),
    });
  }

  function dismissContradiction(field: string) {
    setResolvedContradictions((prev) => new Set(prev).add(field));
    persistDismissal(field);
  }

  function dismissAmbiguity(field: string) {
    setResolvedAmbiguities((prev) => new Set(prev).add(field));
    persistDismissal(field);
  }

  async function runCheck() {
    setLoading(true);
    try {
      await fetch(`/api/shows/${showId}/extract`, { method: "POST" });
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  async function applyFix(field: string, value: string | number | null) {
    if (value === null) return;
    setFixing(field);
    await fetch(`/api/shows/${showId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value }),
    });
    setFixing(null);
    dismissContradiction(field);
    setTimeout(() => router.refresh(), 300);
  }

  async function applyRecoupBasis(basis: "inside_cap" | "outside_cap") {
    setFixing("recoupBasis");
    await fetch(`/api/shows/${showId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recoupBasis: basis }),
    });
    setFixing(null);
    dismissAmbiguity("recoupBasis");
    setTimeout(() => router.refresh(), 300);
  }

  async function applyHospitalityBasis(basis: "inside_cap" | "outside_cap") {
    setFixing("hospitalityBasis");
    await fetch(`/api/shows/${showId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hospitalityBasis: basis }),
    });
    setFixing(null);
    dismissAmbiguity("hospitalityBasis");
    setTimeout(() => router.refresh(), 300);
  }

  async function syncAll() {
    const pending = liveContradictions.filter((c) => !resolvedContradictions.has(c.field));
    if (pending.length === 0) return;
    setFixing("all");
    const updates = pending.reduce(
      (acc, c) => ({ ...acc, [c.field]: c.suggestedValue }),
      {}
    );
    await fetch(`/api/shows/${showId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    setFixing(null);
    setResolvedContradictions(new Set(liveContradictions.map((c) => c.field)));
    setSyncDone(true);
    setTimeout(() => router.refresh(), 300);
  }

  if (loading) {
    return (
      <div className="mt-3 flex items-center gap-2 text-[12px] text-ink-400">
        <Loader2 className="h-3 w-3 animate-spin" />
        Checking notes against deal fields…
      </div>
    );
  }

  // No shadow deal yet — show extraction trigger or rate limit state
  if (!shadowDeal) {
    if (!hasNotes) return null;
    if (rateLimited) {
      const retryDate = rateLimitRetryAfter ? new Date(rateLimitRetryAfter) : null;
      const canRetry = retryDate == null || retryDate <= new Date();
      if (!canRetry) {
        const retryTime = retryDate!.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        return (
          <div className="mt-3 text-[11.5px] text-ink-400 flex items-center gap-1.5">
            <Loader2 className="h-3 w-3 text-ink-300" />
            AI check quota exceeded · retry after {retryTime}
          </div>
        );
      }
    }
    return (
      <button
        onClick={runCheck}
        className="mt-3 inline-flex items-center gap-1.5 text-[11.5px] text-ink-400 hover:text-ink-700 transition-colors"
      >
        <AlertTriangle className="h-3 w-3" />
        Check notes against deal fields
      </button>
    );
  }

  const visibleContradictions = liveContradictions.filter(
    (c) => !resolvedContradictions.has(c.field)
  );
  const visibleAmbiguities = liveAmbiguities.filter(
    (a) => !resolvedAmbiguities.has(String(a.field))
  );
  const totalVisible = visibleContradictions.length + visibleAmbiguities.length;

  // Shadow exists but no issues (or all resolved client-side)
  if (totalVisible === 0) {
    if (syncDone || resolvedContradictions.size > 0 || resolvedAmbiguities.size > 0) {
      return (
        <div className="mt-3 text-[11.5px] text-ink-400 flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 inline-block" />
          All issues resolved
          <span className="text-ink-300 ml-1">· page will refresh shortly</span>
        </div>
      );
    }
    return (
      <div className="mt-3 text-[11.5px] text-ink-400 flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 inline-block" />
        Notes match structured fields
        {cached?.extractedAt && (
          <span className="text-ink-300 ml-1">
            · checked {new Date(cached.extractedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
        )}
      </div>
    );
  }

  const allContradictionsResolved = visibleContradictions.length === 0;

  return (
    <div className="mt-3 rounded-lg border border-amber-200/70 bg-amber-50/40 overflow-hidden">
      <button
        onClick={() => setExpanded((x) => !x)}
        className="w-full flex items-center justify-between px-3 py-2.5 text-left"
      >
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
          <span className="text-[12.5px] font-medium text-amber-900">
            {totalVisible} issue{totalVisible !== 1 ? "s" : ""} found in deal notes
          </span>
        </div>
        {expanded
          ? <ChevronUp className="h-3.5 w-3.5 text-amber-600" />
          : <ChevronDown className="h-3.5 w-3.5 text-amber-600" />
        }
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-2.5 border-t border-amber-200/50 pt-2.5">

          {/* Shadow Deal — AI Negotiated Truth */}
          <div className="bg-amber-100/30 rounded-md p-3 ring-1 ring-amber-200/50 mb-3">
            <div className="eyebrow text-[9px] text-amber-600 mb-2 font-bold uppercase tracking-wider">
              AI Negotiated Truth (Shadow Deal)
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[11px]">
              {Object.entries(shadowDeal).map(([k, v]) => {
                if (k === "justifications" || v === null || v === undefined) return null;
                return (
                  <div key={k} className="flex justify-between items-baseline border-b border-amber-200/20 pb-1">
                    <span className="text-amber-800/70 capitalize">{k.replace(/([A-Z])/g, " $1")}</span>
                    <span className="font-mono font-medium text-amber-900">
                      {typeof v === "number" ? v.toLocaleString() : String(v)}
                    </span>
                  </div>
                );
              })}
            </div>
            {/* Sync all button */}
            {visibleContradictions.length > 0 && !allContradictionsResolved && !syncDone && (
              <button
                onClick={syncAll}
                disabled={fixing !== null}
                className="w-full mt-3 py-1.5 rounded bg-amber-600 text-white text-[11px] font-bold uppercase hover:bg-amber-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {fixing === "all" ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle className="h-3 w-3" />}
                Sync Fields to Negotiated Intent
              </button>
            )}
          </div>

          {/* Contradictions */}
          {visibleContradictions.map((c) => (
            <div key={c.field} className="bg-white/70 rounded-md p-3 ring-1 ring-amber-100 space-y-1.5">
              <div className="flex items-start gap-2">
                <ShieldAlert className="h-3.5 w-3.5 text-rose-600 mt-0.5 shrink-0" />
                <div className="flex-1">
                  <div className="text-[12.5px] font-medium text-rose-800">{c.label}</div>
                  <div className="text-[12px] text-ink-600 mt-0.5 leading-relaxed">
                    Field says <span className="font-mono bg-ink-100 px-1 rounded text-[11px]">{c.currentValue}</span>
                    {" · "}notes say <span className="font-mono bg-amber-100 px-1 rounded text-[11px]">{c.notesSay}</span>
                  </div>
                  {c.excerpt && (
                    <div className="text-[11.5px] text-ink-400 italic mt-1">&ldquo;{c.excerpt}&rdquo;</div>
                  )}
                </div>
                <button
                  onClick={() => dismissContradiction(c.field)}
                  className="shrink-0 text-ink-400 hover:text-ink-700 transition-colors mt-0.5 p-0.5 rounded hover:bg-ink-100"
                  title="Dismiss suggestion"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              {c.suggestedValue !== null && (
                <button
                  disabled={fixing === c.field}
                  onClick={() => applyFix(c.field, c.suggestedValue)}
                  className="ml-5 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11.5px] font-medium bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50 transition-colors"
                >
                  {fixing === c.field && <Loader2 className="h-3 w-3 animate-spin" />}
                  Update {c.label} to {c.notesSay}
                </button>
              )}
            </div>
          ))}

          {/* Ambiguities */}
          {visibleAmbiguities.map((a) => {
            const fieldKey = String(a.field);
            return (
              <div key={fieldKey} className="bg-white/70 rounded-md p-3 ring-1 ring-amber-100 space-y-2">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-600 mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <div className="text-[12.5px] font-medium text-amber-900">{a.question}</div>
                    {a.excerpt && (
                      <div className="text-[11.5px] text-ink-400 italic mt-0.5">&ldquo;{a.excerpt}&rdquo;</div>
                    )}
                  </div>
                  <button
                    onClick={() => dismissAmbiguity(fieldKey)}
                    className="shrink-0 text-ink-400 hover:text-ink-700 transition-colors mt-0.5 p-0.5 rounded hover:bg-ink-100"
                    title="Dismiss"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* recoupBasis choices */}
                {fieldKey === "recoupBasis" && (
                  <div className="ml-5 flex gap-2">
                    <button
                      disabled={fixing === "recoupBasis"}
                      onClick={() => applyRecoupBasis("inside_cap")}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11.5px] font-medium bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50 transition-colors"
                    >
                      {fixing === "recoupBasis" && <Loader2 className="h-3 w-3 animate-spin" />}
                      Inside cap
                    </button>
                    <button
                      disabled={fixing === "recoupBasis"}
                      onClick={() => applyRecoupBasis("outside_cap")}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11.5px] font-medium bg-white text-amber-800 ring-1 ring-amber-300 hover:bg-amber-50 disabled:opacity-50 transition-colors"
                    >
                      Outside cap (gross deduction)
                    </button>
                  </div>
                )}

                {/* hospitalityBasis choices */}
                {fieldKey === "hospitalityBasis" && (
                  <div className="ml-5 flex gap-2">
                    <button
                      disabled={fixing === "hospitalityBasis"}
                      onClick={() => applyHospitalityBasis("inside_cap")}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11.5px] font-medium bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50 transition-colors"
                    >
                      {fixing === "hospitalityBasis" && <Loader2 className="h-3 w-3 animate-spin" />}
                      Inside expense cap
                    </button>
                    <button
                      disabled={fixing === "hospitalityBasis"}
                      onClick={() => applyHospitalityBasis("outside_cap")}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11.5px] font-medium bg-white text-amber-800 ring-1 ring-amber-300 hover:bg-amber-50 disabled:opacity-50 transition-colors"
                    >
                      Separate deduction (outside cap)
                    </button>
                  </div>
                )}
              </div>
            );
          })}

          <div className="text-[10.5px] text-ink-300 pt-1 flex items-center justify-between">
            <span>Compared against AI-extracted deal intent on every page load</span>
            <button
              onClick={runCheck}
              className="text-ink-400 hover:text-ink-700 transition-colors underline underline-offset-2"
            >
              Re-run AI check
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
