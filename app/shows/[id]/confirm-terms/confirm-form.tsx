"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, FileText, Sparkles } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  DEAL_TERMS_VERSION,
  type CapScope,
  type DealTermsV1,
  type ParsedDealTerms,
} from "@/lib/dealTerms";
import { confirmDealTerms } from "./actions";

const MARKETING_RECOUP_ID = "marketing_recoup";
const MARKETING_RECOUP_LABEL = "Marketing Recoup";
const MARKETING_RECOUP_ORDERING_PRIORITY = 10;
// why: stable id duplicated across the parser (`Ambiguity.field` in
// lib/dealParser.ts) and the form (the resolutions[] map key). Renaming
// one without the other silently breaks the forced-choice wiring — the
// ambiguity card would render but submission would never accept it.
const RECOUP_AMBIGUITY_FIELD = "deductions.marketing_recoup.cap_scope" as const;

type Props = {
  showId: string;
  sourceText: string;
  parsed: ParsedDealTerms;
};

export function ConfirmForm({ showId, sourceText, parsed }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const parsedRecoup = parsed.extracted.deductions?.find(
    (d) => d.id === MARKETING_RECOUP_ID,
  );

  // Form state. Strings so we can show empty inputs cleanly; parse on submit.
  const [guarantee, setGuarantee] = useState(
    parsed.extracted.guarantee_amount != null
      ? String(parsed.extracted.guarantee_amount)
      : "",
  );
  const [percentage, setPercentage] = useState(
    parsed.extracted.artist_percent != null
      ? String(Math.round(parsed.extracted.artist_percent * 100))
      : "",
  );
  const [expenseCap, setExpenseCap] = useState(
    parsed.extracted.expense_cap?.exists &&
      parsed.extracted.expense_cap.cap_amount != null
      ? String(parsed.extracted.expense_cap.cap_amount)
      : "",
  );
  const [recoupAmount, setRecoupAmount] = useState(
    parsedRecoup?.amount != null ? String(parsedRecoup.amount) : "",
  );

  // Ambiguity resolutions, keyed by ambiguity field path.
  const [resolutions, setResolutions] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    if (parsedRecoup?.cap_scope) {
      initial[RECOUP_AMBIGUITY_FIELD] = parsedRecoup.cap_scope;
    }
    return initial;
  });

  const guaranteeNum = parseFloat(guarantee);
  const percentageNum = parseFloat(percentage);
  const expenseCapNum = expenseCap.trim() === "" ? null : parseFloat(expenseCap);
  const recoupAmountNum = recoupAmount.trim() === "" ? 0 : parseFloat(recoupAmount);
  const hasRecoup = !isNaN(recoupAmountNum) && recoupAmountNum > 0;

  const recoupAmbiguity = parsed.ambiguities.find(
    (a) => a.field === RECOUP_AMBIGUITY_FIELD,
  );
  const recoupCapScopeResolved =
    resolutions[RECOUP_AMBIGUITY_FIELD] === "outside_cap" ||
    resolutions[RECOUP_AMBIGUITY_FIELD] === "inside_cap";

  const isValid =
    !isNaN(guaranteeNum) &&
    guaranteeNum > 0 &&
    !isNaN(percentageNum) &&
    percentageNum > 0 &&
    percentageNum <= 100 &&
    (expenseCapNum === null || (!isNaN(expenseCapNum) && expenseCapNum >= 0)) &&
    (!hasRecoup || recoupCapScopeResolved);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const terms: DealTermsV1 = {
      deal_terms_version: DEAL_TERMS_VERSION,
      deal_type: "vs_deal",
      guarantee_amount: guaranteeNum,
      artist_percent: percentageNum / 100,
      expense_cap: {
        exists: expenseCapNum !== null,
        cap_amount: expenseCapNum,
      },
      deductions: hasRecoup
        ? [
            {
              id: MARKETING_RECOUP_ID,
              label: MARKETING_RECOUP_LABEL,
              amount: recoupAmountNum,
              basis: "gross",
              cap_scope: resolutions[RECOUP_AMBIGUITY_FIELD] as CapScope,
              ordering_priority: MARKETING_RECOUP_ORDERING_PRIORITY,
            },
          ]
        : [],
      // why: v1 doesn't surface tier editing in the form — bonus tiers
      // come straight from the parser. F3 (PRD §8) will give bookers a
      // structured editor for these. Passing through preserves whatever
      // the parser extracted (label, threshold, basis, flat_amount).
      bonus_tiers: parsed.extracted.bonus_tiers ?? [],
      source_text: sourceText,
      confirmed_at: new Date().toISOString(),
    };

    startTransition(async () => {
      const result = await confirmDealTerms(showId, terms);
      if (result.ok) {
        router.push(`/shows/${showId}/settle`);
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {/* Original deal email — preserved verbatim (F0 AC #4). */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle className="flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5 text-ink-500" />
              Deal notes (original, preserved)
            </CardTitle>
            <CardDescription>
              The free-text email the agent sent. Stays attached to the deal
              forever; the structured fields below are derived from it.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-[12.5px] text-ink-800 bg-canvas-soft rounded-lg p-4 ring-1 ring-ink-200/60 leading-relaxed whitespace-pre-wrap">
            {sourceText || <span className="text-ink-400">No deal notes recorded.</span>}
          </div>
        </CardContent>
      </Card>

      {/* Extracted fields */}
      <Card accent="brand">
        <CardHeader>
          <div>
            <CardTitle className="flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-brand-700" />
              Parsed deal terms
            </CardTitle>
            <CardDescription>
              Extracted from the deal email by the deterministic parser.
              Override anything that&apos;s wrong; fill in anything that&apos;s
              missing.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="divide-y divide-ink-100/80">
          <FieldRow
            label="Guarantee"
            required
            confidence={parsed.confidence.guarantee_amount}
            extractedHint={
              parsed.extracted.guarantee_amount != null
                ? `Extracted: $${parsed.extracted.guarantee_amount.toLocaleString()}`
                : "Not found — manual entry required"
            }
          >
            <MoneyInput
              value={guarantee}
              onChange={setGuarantee}
              placeholder="5000"
            />
          </FieldRow>

          <FieldRow
            label="Artist percentage"
            required
            confidence={parsed.confidence.artist_percent}
            extractedHint={
              parsed.extracted.artist_percent != null
                ? `Extracted: ${(parsed.extracted.artist_percent * 100).toFixed(0)}%`
                : "Not found — manual entry required"
            }
          >
            <PercentInput
              value={percentage}
              onChange={setPercentage}
              placeholder="80"
            />
          </FieldRow>

          <FieldRow
            label="Expense cap"
            confidence={parsed.confidence.expense_cap}
            extractedHint={
              parsed.extracted.expense_cap?.exists &&
              parsed.extracted.expense_cap.cap_amount != null
                ? `Extracted: $${parsed.extracted.expense_cap.cap_amount.toLocaleString()}`
                : "Leave blank for no cap"
            }
          >
            <MoneyInput
              value={expenseCap}
              onChange={setExpenseCap}
              placeholder="Leave blank for no cap"
            />
          </FieldRow>

          <FieldRow
            label="Marketing recoup"
            confidence={parsed.confidence["deductions.marketing_recoup.cap_scope"]}
            extractedHint={
              parsedRecoup
                ? `Extracted: $${parsedRecoup.amount.toLocaleString()}${
                    parsedRecoup.cap_scope
                      ? " (cap scope resolved)"
                      : " (cap scope needs a decision below)"
                  }`
                : "Leave blank if there is no recoup"
            }
          >
            <MoneyInput
              value={recoupAmount}
              onChange={setRecoupAmount}
              placeholder="Leave blank if none"
            />
          </FieldRow>

          {parsed.extracted.bonus_tiers && parsed.extracted.bonus_tiers.length > 0 && (
            <div className="py-4">
              <div className="eyebrow text-[10px] text-ink-500 mb-2">
                Bonus tiers (extracted)
              </div>
              <ul className="space-y-1.5">
                {parsed.extracted.bonus_tiers.map((b, i) => (
                  <li
                    key={i}
                    className="text-[13px] text-ink-800 font-mono tabular"
                  >
                    {b.label ??
                      `$${(b.flat_amount ?? 0).toLocaleString()} over $${b.threshold_amount.toLocaleString()} ${b.basis}`}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Ambiguities — forced choice */}
      {hasRecoup && recoupAmbiguity && (
        <Card accent="amber">
          <CardHeader>
            <div>
              <CardTitle className="flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-700" />
                Needs your decision
              </CardTitle>
              <CardDescription>
                One phrase in the deal email can be read more than one way.
                Pick the reading that matches what was negotiated — this is
                the choice that resolves the Coastal Spell-type dispute at
                deal entry, not settlement.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <div className="eyebrow text-[10px] text-ink-500 mb-2">
              Source phrase
            </div>
            <blockquote className="text-[12.5px] text-ink-800 bg-canvas-soft rounded-lg p-4 ring-1 ring-ink-200/60 leading-relaxed italic mb-5">
              &ldquo;{recoupAmbiguity.sourcePhrase}&rdquo;
            </blockquote>

            <div className="space-y-3">
              {recoupAmbiguity.options.map((opt) => {
                const selected = resolutions[RECOUP_AMBIGUITY_FIELD] === opt.value;
                return (
                  <label
                    key={opt.value}
                    className={cn(
                      "block rounded-lg border p-4 cursor-pointer transition-colors",
                      selected
                        ? "border-brand-500 bg-brand-50/40 ring-1 ring-brand-500/30"
                        : "border-ink-200/80 bg-white hover:border-ink-300",
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="radio"
                        name={RECOUP_AMBIGUITY_FIELD}
                        value={opt.value}
                        checked={selected}
                        onChange={() =>
                          setResolutions((r) => ({
                            ...r,
                            [RECOUP_AMBIGUITY_FIELD]: opt.value,
                          }))
                        }
                        className="mt-0.5 h-4 w-4 accent-brand-700"
                      />
                      <div className="min-w-0">
                        <div className="text-[13px] font-medium text-ink-900 leading-snug">
                          {opt.label}
                        </div>
                        <div className="text-[12px] text-ink-500 mt-1 leading-relaxed">
                          {opt.rationale}
                        </div>
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Submit */}
      <div className="flex items-center justify-between gap-4 pt-2">
        <div className="text-[12px] text-ink-500 max-w-md leading-relaxed">
          {isValid ? (
            <span className="inline-flex items-center gap-1.5 text-brand-700">
              <Check className="h-3.5 w-3.5" />
              All required fields confirmed. The engine can settle this show
              once you save.
            </span>
          ) : (
            <span className="text-ink-500">
              Fill in the required fields and resolve any forced choices to
              enable save.
            </span>
          )}
        </div>
        <Button
          type="submit"
          variant="brand"
          size="lg"
          disabled={!isValid || pending}
        >
          {pending ? "Saving…" : "Confirm deal terms"}
        </Button>
      </div>

      {error && (
        <div className="text-[12.5px] text-rose-700 bg-rose-50 ring-1 ring-rose-200/80 rounded-lg p-3">
          {error}
        </div>
      )}
    </form>
  );
}

// ----- Sub-components -----

function FieldRow({
  label,
  required,
  confidence,
  extractedHint,
  children,
}: {
  label: string;
  required?: boolean;
  confidence?: "high" | "medium" | "low";
  extractedHint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="py-4 grid grid-cols-1 sm:grid-cols-[1fr_240px] gap-3 sm:items-start">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[12px] font-medium text-ink-900">
            {label}
            {required && <span className="text-rose-500 ml-0.5">*</span>}
          </span>
          {confidence && <ConfidenceBadge confidence={confidence} />}
        </div>
        {extractedHint && (
          <div className="text-[11.5px] text-ink-500 leading-snug">
            {extractedHint}
          </div>
        )}
      </div>
      <div>{children}</div>
    </div>
  );
}

function ConfidenceBadge({ confidence }: { confidence: "high" | "medium" | "low" }) {
  const styles = {
    high: "bg-brand-50 text-brand-800 ring-brand-200/80",
    medium: "bg-amber-50 text-amber-800 ring-amber-200/80",
    low: "bg-ink-100 text-ink-600 ring-ink-200/80",
  } as const;
  const labels = { high: "High confidence", medium: "Medium", low: "Low / missing" };
  return (
    <span
      className={cn(
        "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ring-1 ring-inset",
        styles[confidence],
      )}
    >
      {labels[confidence]}
    </span>
  );
}

const inputClass =
  "w-full h-9 px-3 rounded-lg text-[13px] text-ink-900 bg-white ring-1 ring-inset ring-ink-200/80 focus:outline-none focus:ring-2 focus:ring-brand-700 font-mono tabular";

function MoneyInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[12.5px] text-ink-400 font-mono tabular pointer-events-none">
        $
      </span>
      <input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(inputClass, "pl-7")}
      />
    </div>
  );
}

function PercentInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="relative">
      <input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(inputClass, "pr-7")}
      />
      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12.5px] text-ink-400 font-mono tabular pointer-events-none">
        %
      </span>
    </div>
  );
}
