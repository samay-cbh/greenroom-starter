"use client";

import { useState, useTransition } from "react";
import {
  AlertTriangle,
  Sparkles,
  CheckCircle2,
  Loader2,
  Pencil,
  Send,
  FileText,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  Field,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PlainBadge, DealTypeBadge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/format";
import type {
  DealBrief,
  Ambiguity,
  Contradiction,
} from "@/lib/dealBrief";
import {
  extractBriefForShow,
  confirmBrief,
  markAwaitingConfirmation,
  createManualBrief,
} from "./actions";

type BriefSnapshot = {
  id: string;
  version: number;
  status: "draft" | "awaiting_confirmation" | "confirmed" | "superseded";
  sourceEmailText: string;
  confirmedAt: string | null;
  confirmedVia: "email_reply" | "manual_override" | null;
  agentReplyText: string | null;
  createdAt: string;
};

const STATUS_LABEL: Record<BriefSnapshot["status"], string> = {
  draft: "draft",
  awaiting_confirmation: "awaiting agent reply",
  confirmed: "confirmed",
  superseded: "superseded",
};

type LegacyDeal = {
  dealType: string;
  guaranteeAmount: number | null;
  percentage: number | null;
  expenseCap: number | null;
  hospitalityCap: number | null;
  dealNotesFreetext: string | null;
};

interface Props {
  showId: string;
  legacyDeal: LegacyDeal;
  brief: BriefSnapshot | null;
  extracted: DealBrief | null;
  ambiguities: Ambiguity[];
  contradictions: Contradiction[];
  hasLLMProvider: boolean;
}

export function BriefClient({
  showId,
  legacyDeal,
  brief,
  extracted: initialExtracted,
  ambiguities: initialAmbiguities,
  contradictions: initialContradictions,
  hasLLMProvider,
}: Props) {
  const [pasted, setPasted] = useState(brief?.sourceEmailText ?? "");
  const [error, setError] = useState<string | null>(null);
  const [extracted, setExtracted] = useState<DealBrief | null>(
    initialExtracted,
  );
  const [ambiguities, setAmbiguities] = useState<Ambiguity[]>(
    initialAmbiguities,
  );
  const [contradictions, setContradictions] = useState<Contradiction[]>(
    initialContradictions,
  );
  const [briefId, setBriefId] = useState<string | null>(brief?.id ?? null);
  const [status, setStatus] = useState<BriefSnapshot["status"]>(
    brief?.status ?? "draft",
  );
  const [providerNote, setProviderNote] = useState<string | null>(null);
  const [isExtracting, startExtracting] = useTransition();
  const [isConfirming, startConfirming] = useTransition();
  const [agentReply, setAgentReply] = useState("");

  const isConfirmed = status === "confirmed";

  function handleExtract() {
    setError(null);
    startExtracting(async () => {
      const res = await extractBriefForShow(showId, pasted);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setExtracted(res.extracted);
      setAmbiguities(res.ambiguities);
      setContradictions(res.contradictions);
      setBriefId(res.briefId);
      setStatus("draft");
      setProviderNote(
        res.cached
          ? "Reused prior extraction (same email content)."
          : `Extracted via ${res.providerName}.`,
      );
    });
  }

  function handleConfirm(via: "email_reply" | "manual_override") {
    if (!briefId) return;
    setError(null);
    startConfirming(async () => {
      const res = await confirmBrief(
        briefId,
        showId,
        via,
        via === "email_reply" ? agentReply : undefined,
      );
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setStatus("confirmed");
    });
  }

  function handleMarkAwaiting() {
    if (!briefId) return;
    setError(null);
    startConfirming(async () => {
      const res = await markAwaitingConfirmation(briefId, showId);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setStatus("awaiting_confirmation");
    });
  }

  function handleBuildManually() {
    setError(null);
    startExtracting(async () => {
      const res = await createManualBrief(showId, pasted);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setExtracted(res.extracted);
      setAmbiguities([]);
      setContradictions([]);
      setBriefId(res.briefId);
      setStatus("draft");
      setProviderNote("Started a manual brief — fill in the fields below.");
    });
  }

  /**
   * Reset the form to start a new version of the brief. Existing confirmed
   * brief stays in the DB (as a prior version); the next extract call
   * supersedes it server-side via the action's standard supersede logic.
   */
  function handleStartNewVersion() {
    setPasted("");
    setExtracted(null);
    setAmbiguities([]);
    setContradictions([]);
    setBriefId(null);
    setStatus("draft");
    setError(null);
    setProviderNote(null);
    setAgentReply("");
  }

  const clarificationDraft = extracted
    ? buildClarificationDraft(extracted)
    : null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
      {/* LEFT COLUMN — paste + extracted view */}
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>The deal email</CardTitle>
              <CardDescription>
                Paste the agent&apos;s email or the negotiated terms exactly
                as written. The extractor reads the prose, not the structured
                fields — same as Mariana would.
              </CardDescription>
            </div>
            {hasLLMProvider ? (
              <PlainBadge variant="brand">AI ready</PlainBadge>
            ) : (
              <PlainBadge variant="amber">Manual</PlainBadge>
            )}
          </CardHeader>
          <CardContent>
            <textarea
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
              disabled={isConfirmed}
              placeholder={
                legacyDeal.dealNotesFreetext ??
                "Paste the deal email here. Example: '$5,000 vs 80% of net after expenses, whichever greater. Expenses capped $2,500. Hospitality cap $500. Marketing recoup of $900 against gross.'"
              }
              className="w-full min-h-[180px] font-mono text-[12.5px] text-ink-800 bg-canvas-soft ring-1 ring-ink-200/60 rounded-md px-3.5 py-3 leading-relaxed focus:outline-none focus:ring-brand-700/60 focus:ring-2"
            />
            <div className="mt-3 flex items-center justify-between gap-3">
              <div className="text-[11.5px] text-ink-400">
                {pasted.length > 0 && (
                  <>{pasted.length} chars · {pasted.split(/\s+/).filter(Boolean).length} words</>
                )}
              </div>
              <div className="flex items-center gap-2">
                {providerNote && (
                  <span className="text-[11px] text-ink-400">
                    {providerNote}
                  </span>
                )}
                <Button
                  variant="brand"
                  size="sm"
                  onClick={handleExtract}
                  disabled={isExtracting || pasted.trim().length < 40 || isConfirmed}
                  title={
                    pasted.trim().length < 40
                      ? "Paste at least 40 characters of email text"
                      : undefined
                  }
                >
                  {isExtracting ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Extracting…
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-3.5 w-3.5" />
                      {extracted ? "Re-extract" : "Extract deal"}
                    </>
                  )}
                </Button>
              </div>
            </div>
            {error && (
              <div className="mt-3 rounded-md bg-rose-50/60 ring-1 ring-rose-200/60 px-3 py-2.5 flex items-start justify-between gap-3">
                <div className="text-[12px] text-rose-800 leading-relaxed min-w-0">
                  {error}
                </div>
                <button
                  onClick={handleBuildManually}
                  className="text-[11.5px] font-medium text-rose-900 underline hover:no-underline shrink-0 self-start mt-0.5"
                >
                  Build manually
                </button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Loading skeleton — visible while the LLM extraction is running */}
        {isExtracting && !extracted && (
          <Card>
            <CardHeader>
              <CardTitle>Extracting deal…</CardTitle>
              <CardDescription>
                Reading the email, finding structured terms, scanning for
                ambiguity. Usually takes 2-3 seconds.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[...Array(4)].map((_, i) => (
                  <div key={i}>
                    <div className="h-2 w-16 bg-ink-100 rounded animate-pulse mb-2" />
                    <div className="h-4 w-24 bg-ink-100 rounded animate-pulse" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {extracted && (
          <Card accent="brand">
            <CardHeader>
              <div>
                <CardTitle>Extracted deal</CardTitle>
                <CardDescription>
                  What the system read out of the email. Edit any field that&apos;s wrong before confirming.
                </CardDescription>
              </div>
              <div className="flex items-center gap-1.5">
                <DealTypeBadge type={extracted.dealType} />
                {extracted.vsFlavor && (
                  <PlainBadge variant="default">
                    {extracted.vsFlavor}
                  </PlainBadge>
                )}
                <PlainBadge variant="default">
                  via {extracted.extractedBy.replace("_", " ")}
                </PlainBadge>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <Field
                  label="Guarantee"
                  mono
                  value={
                    extracted.guaranteeAmount != null
                      ? formatMoney(extracted.guaranteeAmount)
                      : "—"
                  }
                />
                <Field
                  label="Percentage"
                  mono
                  value={
                    extracted.percentage != null
                      ? `${(extracted.percentage * 100).toFixed(0)}%${
                          extracted.percentageBasis
                            ? ` of ${extracted.percentageBasis}`
                            : ""
                        }`
                      : "—"
                  }
                />
                <Field
                  label="Expense cap"
                  mono
                  value={
                    extracted.expenseCap != null
                      ? formatMoney(extracted.expenseCap)
                      : "—"
                  }
                />
                <Field
                  label="Hospitality cap"
                  mono
                  value={
                    extracted.hospitalityCap != null
                      ? formatMoney(extracted.hospitalityCap)
                      : "—"
                  }
                />
              </div>

              {extracted.bonuses.length > 0 && (
                <div>
                  <div className="eyebrow text-[10px] text-ink-500 mb-2">
                    Bonuses
                  </div>
                  <ul className="space-y-1.5">
                    {extracted.bonuses.map((b, i) => (
                      <li
                        key={i}
                        className="text-[12.5px] text-ink-800 flex items-start gap-2"
                      >
                        <span className="inline-flex shrink-0 items-center px-1.5 py-px rounded text-[9px] font-mono uppercase tracking-wider bg-white ring-1 ring-brand-200/50 text-brand-800 mt-px">
                          {b.type.replace("_", " ")}
                        </span>
                        <span>{b.label}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {extracted.recoups.length > 0 && (
                <div>
                  <div className="eyebrow text-[10px] text-ink-500 mb-2">
                    Recoups
                  </div>
                  <ul className="space-y-1.5">
                    {extracted.recoups.map((r, i) => (
                      <li
                        key={i}
                        className="text-[12.5px] text-ink-800 grid grid-cols-[auto_1fr_auto] items-center gap-2"
                      >
                        <span className="text-ink-500 capitalize">
                          {r.category.replace("_", " ")}
                        </span>
                        <span className="text-ink-800">{r.label}</span>
                        <span className="font-mono tabular text-ink-900 flex items-center gap-2">
                          {formatMoney(r.amount)}
                          <PlainBadge
                            variant={
                              r.placement === "inside_cap" ? "amber" : "default"
                            }
                          >
                            {r.placement.replace("_", " ")}
                          </PlainBadge>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Compare against the legacy structured fields, when they exist */}
        {extracted && hasStructuredDealFields(legacyDeal) && (
          <Card>
            <CardHeader>
              <CardTitle>What was already in the system</CardTitle>
              <CardDescription>
                The structured fields previously entered for this deal —
                useful when the email and the structured form disagree.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <Field
                  label="Deal type"
                  value={legacyDeal.dealType.replace("_", " ")}
                />
                <Field
                  label="Guarantee"
                  mono
                  value={
                    legacyDeal.guaranteeAmount != null
                      ? formatMoney(legacyDeal.guaranteeAmount)
                      : "—"
                  }
                />
                <Field
                  label="Percentage"
                  mono
                  value={
                    legacyDeal.percentage != null
                      ? `${(legacyDeal.percentage * 100).toFixed(0)}%`
                      : "—"
                  }
                />
                <Field
                  label="Expense cap"
                  mono
                  value={
                    legacyDeal.expenseCap != null
                      ? formatMoney(legacyDeal.expenseCap)
                      : "—"
                  }
                />
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* RIGHT RAIL — intelligence + confirm */}
      <div className="space-y-5">
        {/* Empty-state hint before extraction has run */}
        {!extracted && !isExtracting && (
          <Card>
            <CardHeader>
              <CardTitle>What appears here</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-[12px] text-ink-600 leading-relaxed">
              <div className="flex items-start gap-2">
                <span className="inline-flex h-1.5 w-1.5 rounded-full bg-amber-500 mt-1.5 shrink-0" />
                <span>
                  <strong>Ambiguities</strong> — sentences in the email that
                  could be read two ways, with their dollar impact.
                </span>
              </div>
              <div className="flex items-start gap-2">
                <span className="inline-flex h-1.5 w-1.5 rounded-full bg-rose-500 mt-1.5 shrink-0" />
                <span>
                  <strong>Contradictions</strong> — where the brief disagrees
                  with prior data (percentage drift, hospitality overruns,
                  stale records, cross-show agent patterns).
                </span>
              </div>
              <div className="flex items-start gap-2">
                <span className="inline-flex h-1.5 w-1.5 rounded-full bg-brand-500 mt-1.5 shrink-0" />
                <span>
                  <strong>Confirm panel</strong> — drafted clarification
                  email + confirmation actions.
                </span>
              </div>
              {!hasLLMProvider && (
                <button
                  onClick={handleBuildManually}
                  className="mt-2 text-[12px] text-brand-700 font-medium hover:underline"
                >
                  Or build the brief manually →
                </button>
              )}
            </CardContent>
          </Card>
        )}

        {ambiguities.length > 0 && (
          <Card accent="amber">
            <CardHeader>
              <div>
                <CardTitle>Ambiguities</CardTitle>
                <CardDescription>
                  Sentences that could be read two ways. Resolve before the show.
                </CardDescription>
              </div>
              <PlainBadge variant="amber">{ambiguities.length}</PlainBadge>
            </CardHeader>
            <CardContent className="space-y-4">
              {ambiguities.map((a) => (
                <div key={a.id} className="space-y-2">
                  <div className="text-[12px] text-ink-800 bg-amber-50/40 ring-1 ring-amber-200/50 rounded-md px-3 py-2 leading-relaxed font-mono">
                    &ldquo;{a.span.excerpt}&rdquo;
                  </div>
                  <div className="text-[11.5px] text-ink-700 grid grid-cols-[18px_1fr] gap-2 items-start">
                    <span className="font-mono text-amber-800 mt-0.5">A.</span>
                    <span>{a.readingA}</span>
                  </div>
                  <div className="text-[11.5px] text-ink-700 grid grid-cols-[18px_1fr] gap-2 items-start">
                    <span className="font-mono text-amber-800 mt-0.5">B.</span>
                    <span>{a.readingB}</span>
                  </div>
                  {a.dollarImpact != null && (
                    <div className="text-[11.5px] text-rose-700 font-medium">
                      Dollar swing: {formatMoney(Math.abs(a.dollarImpact))}
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {contradictions.length > 0 && (
          <Card
            accent={
              contradictions.some((c) => c.severity === "high")
                ? "rose"
                : contradictions.some((c) => c.severity === "warn")
                  ? "amber"
                  : undefined
            }
          >
            <CardHeader>
              <div>
                <CardTitle>Contradictions</CardTitle>
                <CardDescription>
                  Findings from cross-checking against existing data.
                </CardDescription>
              </div>
              <PlainBadge
                variant={
                  contradictions.some((c) => c.severity === "high")
                    ? "rose"
                    : "amber"
                }
              >
                {contradictions.length}
              </PlainBadge>
            </CardHeader>
            <CardContent className="space-y-3">
              {contradictions.map((c) => {
                const iconColor =
                  c.severity === "high"
                    ? "text-rose-700"
                    : c.severity === "warn"
                      ? "text-amber-700"
                      : "text-ink-500";
                return (
                  <div
                    key={c.id}
                    className="text-[12px] text-ink-800 leading-relaxed"
                  >
                    <div className="flex items-start gap-2">
                      <AlertTriangle
                        className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${iconColor}`}
                      />
                      <span>{c.message}</span>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}

        {extracted && !isConfirmed && (
          <Card accent={status === "awaiting_confirmation" ? "amber" : undefined}>
            <CardHeader>
              <div>
                <CardTitle>
                  {status === "awaiting_confirmation"
                    ? "Awaiting agent reply"
                    : "Confirm with the agent"}
                </CardTitle>
                <CardDescription>
                  {status === "awaiting_confirmation"
                    ? "Marked as sent. Paste the agent's reply below to lock the brief."
                    : "Send a clarification email and lock the brief once they reply."}
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {clarificationDraft && status !== "awaiting_confirmation" && (
                <div>
                  <div className="eyebrow text-[10px] text-ink-500 mb-2 flex items-center gap-1">
                    <Send className="h-3 w-3" />
                    Drafted clarification
                  </div>
                  <div className="text-[12.5px] text-ink-800 bg-canvas-soft ring-1 ring-ink-200/60 rounded-md px-3 py-2.5 leading-relaxed whitespace-pre-wrap font-mono">
                    {clarificationDraft}
                  </div>
                </div>
              )}

              <div>
                <div className="eyebrow text-[10px] text-ink-500 mb-2">
                  Agent reply (paste their &ldquo;confirmed&rdquo;)
                </div>
                <textarea
                  value={agentReply}
                  onChange={(e) => setAgentReply(e.target.value)}
                  placeholder="Confirmed — looks right."
                  className="w-full min-h-[60px] text-[12.5px] text-ink-800 bg-canvas-soft ring-1 ring-ink-200/60 rounded-md px-3 py-2 leading-relaxed focus:outline-none focus:ring-brand-700/60 focus:ring-2"
                />
              </div>

              <div className="grid grid-cols-1 gap-2 pt-1">
                {status !== "awaiting_confirmation" && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleMarkAwaiting}
                    disabled={isConfirming}
                  >
                    <Send className="h-3.5 w-3.5" />
                    I&apos;ve sent the email — awaiting reply
                  </Button>
                )}
                <Button
                  variant="brand"
                  size="sm"
                  onClick={() => handleConfirm("email_reply")}
                  disabled={isConfirming || agentReply.trim().length < 2}
                >
                  {isConfirming ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  )}
                  Confirm with agent reply
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleConfirm("manual_override")}
                  disabled={isConfirming}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Mark as confirmed (manual override)
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {isConfirmed && brief && (
          <Card accent="brand">
            <CardHeader>
              <div>
                <CardTitle>Brief confirmed</CardTitle>
                <CardDescription>
                  The settlement page will use this as the source of truth.
                </CardDescription>
              </div>
              <CheckCircle2 className="h-4 w-4 text-brand-700" />
            </CardHeader>
            <CardContent>
              <Field
                label="Confirmed"
                value={
                  brief.confirmedAt
                    ? new Date(brief.confirmedAt).toLocaleString()
                    : "—"
                }
              />
              {brief.agentReplyText && (
                <div className="mt-4">
                  <div className="eyebrow text-[10px] text-ink-500 mb-2">
                    Agent reply
                  </div>
                  <div className="text-[12.5px] text-ink-800 bg-canvas-soft ring-1 ring-ink-200/60 rounded-md px-3 py-2 leading-relaxed">
                    &ldquo;{brief.agentReplyText}&rdquo;
                  </div>
                </div>
              )}
              <div className="mt-5 pt-4 border-t border-ink-100/80">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleStartNewVersion}
                  className="w-full"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Create new version
                </Button>
                <p className="text-[11px] text-ink-400 mt-2 leading-snug">
                  Use this when the deal changes after confirmation. The
                  current version stays on file as v{brief.version}.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {extracted && (
          <div className="text-[11px] text-ink-400 leading-relaxed flex items-start gap-1.5 px-1">
            <FileText className="h-3 w-3 mt-0.5 shrink-0" />
            <span>
              Brief v{brief?.version ?? 1} · {STATUS_LABEL[status]}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function hasStructuredDealFields(d: LegacyDeal): boolean {
  return (
    d.guaranteeAmount != null ||
    d.percentage != null ||
    d.expenseCap != null ||
    d.hospitalityCap != null
  );
}

/**
 * Builds a clarification email body Mariana can edit & send. Deterministic
 * template (no LLM) — this is Mariana's tool, not the AI's.
 */
function buildClarificationDraft(b: DealBrief): string {
  const lines: string[] = [
    "Hi —",
    "",
    "Confirming for our records before the show:",
    "",
  ];

  if (b.dealType === "vs" && b.guaranteeAmount != null && b.percentage != null) {
    lines.push(
      `  • $${b.guaranteeAmount.toLocaleString()} vs ${(b.percentage * 100).toFixed(0)}% of ${b.percentageBasis ?? "net"}, whichever greater`,
    );
  } else if (b.dealType === "flat" && b.guaranteeAmount != null) {
    lines.push(`  • Flat $${b.guaranteeAmount.toLocaleString()} guarantee`);
  } else if (b.dealType === "percentage_of_net" && b.percentage != null) {
    lines.push(
      `  • ${(b.percentage * 100).toFixed(0)}% of net after expenses`,
    );
  } else if (b.dealType === "percentage_of_gross" && b.percentage != null) {
    lines.push(`  • ${(b.percentage * 100).toFixed(0)}% of gross`);
  } else if (b.dealType === "door") {
    lines.push("  • Door deal: ticket revenue minus expenses");
  }

  if (b.expenseCap != null) {
    lines.push(`  • Expense cap: $${b.expenseCap.toLocaleString()}`);
  }
  if (b.hospitalityCap != null) {
    lines.push(`  • Hospitality cap: $${b.hospitalityCap.toLocaleString()}`);
  }

  for (const r of b.recoups) {
    const place =
      r.placement === "inside_cap"
        ? "inside the expense cap"
        : "separate from the expense cap";
    lines.push(
      `  • ${r.label}: $${r.amount.toLocaleString()} (${place})`,
    );
  }

  for (const bonus of b.bonuses) {
    lines.push(`  • ${bonus.label}`);
  }

  lines.push("", "Reply 'confirmed' if that matches your read.", "", "Thanks,", "Mariana");
  return lines.join("\n");
}
