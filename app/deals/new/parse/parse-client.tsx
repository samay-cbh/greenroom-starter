"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp, Sparkles, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

const DEAL_PATTERNS = [
  {
    group: "— Vs sub-variants (9) —",
    options: [
      { code: "V1", label: "Vs % of net, whichever greater" },
      { code: "V2", label: "Vs slash-split" },
      { code: "V3", label: "Vs slash-split with walkout above breakeven" },
      { code: "V4", label: "Guarantee vs % of net (compact form)" },
      { code: "V5", label: "Vs with escalator/ratchet over capacity" },
      { code: "V6", label: "Vs % of GROSS, whichever greater" },
      { code: "V7", label: "Vs % of gross (compact, with risk caveat)" },
      { code: "V8", label: "Vs with walkout pot (spelled out)" },
      { code: "V9", label: "Vs with inline capacity-ratchet" },
    ],
  },
  {
    group: "— Other (3) —",
    options: [
      { code: "N1", label: "% of net, no guarantee" },
      { code: "G1", label: "% of gross, simple split" },
      { code: "D1", label: "Door deal, DIY/experimental" },
    ],
  },
  {
    group: "— Flat —",
    options: [{ code: "Flat", label: "single guarantee, no upside" }],
  },
  {
    group: "— Off-system —",
    options: [
      {
        code: "OFF",
        label: "Bonus lives in email (3.8% of deals) — link only",
      },
    ],
  },
];

type FlagKey = "treatment" | "scope" | "others";
const FLAG_ORDER: FlagKey[] = ["treatment", "scope", "others"];

type Resolved = Record<FlagKey, string | null>;

type ContextParams = {
  showName?: string;
  showDate?: string;
  artistId?: string;
  agentId?: string;
  agencyId?: string;
};

export function ParseClient({
  demoEmail,
  contextParams,
}: {
  demoEmail: string;
  contextParams: ContextParams;
}) {
  const router = useRouter();
  const [classified, setClassified] = useState(false);
  const [dealCode, setDealCode] = useState("V1");
  const [emailOpen, setEmailOpen] = useState(false);
  const [openFlag, setOpenFlag] = useState<FlagKey | null>(null);
  const [resolved, setResolved] = useState<Resolved>({
    treatment: null,
    scope: null,
    others: null,
  });

  const unresolvedCount = FLAG_ORDER.filter((k) => !resolved[k]).length;
  const allResolved = unresolvedCount === 0;

  function handleResolve(flag: FlagKey, value: string) {
    const next: Resolved = { ...resolved, [flag]: value };
    setResolved(next);
    // Auto-advance to next unresolved flag, or close
    const remaining = FLAG_ORDER.find((k) => !next[k]);
    setOpenFlag(remaining ?? null);
  }

  function handleSave() {
    const params = new URLSearchParams();
    if (contextParams.showName) params.set("showName", contextParams.showName);
    if (contextParams.showDate) params.set("showDate", contextParams.showDate);
    if (contextParams.artistId) params.set("artistId", contextParams.artistId);
    if (contextParams.agentId) params.set("agentId", contextParams.agentId);
    if (contextParams.agencyId)
      params.set("agencyId", contextParams.agencyId);
    if (resolved.treatment) params.set("treatment", resolved.treatment);
    if (resolved.scope) params.set("scope", resolved.scope);
    if (resolved.others) params.set("others", resolved.others);
    router.push(`/deals/new/review?${params.toString()}`);
  }

  return (
    <>
      {/* Stage 1 — Classifier */}
      <div className="rounded-xl border border-ink-200/60 bg-white p-5 mb-5 shadow-[0_1px_2px_rgba(26,24,20,0.03)]">
        <div className="flex items-start gap-3">
          <div className="h-7 w-7 rounded-md bg-brand-50 flex items-center justify-center flex-shrink-0">
            <Sparkles className="h-4 w-4 text-brand-700" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <div className="text-[11px] uppercase tracking-wider text-ink-400 font-semibold">
                Step 1 · Deal type · AI-classified
              </div>
              <span className="px-2 py-0.5 rounded bg-brand-50 text-brand-700 text-[10px] uppercase tracking-wider font-semibold">
                High confidence
              </span>
            </div>

            <div className="text-[18px] text-ink-900 font-medium font-display mb-2">
              V1 — Vs % of net, whichever greater
            </div>

            <div className="text-[12.5px] text-ink-600 leading-relaxed mb-1">
              <span className="text-ink-400">Triggers from email:</span>{" "}
              <em className="text-ink-700">"vs 85% of net after expenses"</em>{" "}
              · <em className="text-ink-700">"expense cap $3,200"</em>
            </div>
            <div className="text-[11.5px] text-ink-500 leading-relaxed">
              Single LLM call with the 12-pattern taxonomy (V1–V9 + N1 + G1 +
              D1, plus Flat) front-loaded into the prompt. 0 unmatched on 328
              non-flat deals over 24 months.
            </div>

            {!classified && (
              <div className="mt-4 pt-4 border-t border-ink-100">
                <div className="text-[11px] text-ink-500 font-medium mb-2">
                  Override deal type
                </div>
                <select
                  value={dealCode}
                  onChange={(e) => setDealCode(e.target.value)}
                  className="w-full px-3 py-2 rounded-md border border-ink-200 bg-canvas-soft text-[13px] focus:outline-none focus:ring-2 focus:ring-brand-700 mb-3"
                >
                  {DEAL_PATTERNS.map((group) => (
                    <optgroup key={group.group} label={group.group}>
                      {group.options.map((opt) => (
                        <option key={opt.code} value={opt.code}>
                          {opt.code} · {opt.label}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <div className="flex items-center gap-3">
                  <Button
                    variant="brand"
                    onClick={() => setClassified(true)}
                  >
                    <Check className="h-4 w-4" />
                    Confirm classification
                  </Button>
                  <span className="text-[11px] text-ink-400">
                    Only V1 schema is built in this prototype.
                  </span>
                </div>
              </div>
            )}

            {classified && (
              <div className="mt-3 pt-3 border-t border-ink-100 flex items-center gap-2 text-[11.5px] text-brand-700">
                <Check className="h-3.5 w-3.5" />
                Classification confirmed · V1 schema applied below
                <button
                  onClick={() => setClassified(false)}
                  className="ml-auto text-ink-400 hover:text-ink-700 text-[11px] underline underline-offset-2"
                >
                  Change
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Stage 2 — only shown after classification confirmed */}
      {classified && (
        <div className="animate-in fade-in slide-in-from-top-2 duration-300">
          {/* Collapsible source email */}
          <div className="rounded-md border border-ink-200/60 bg-canvas-soft mb-3 overflow-hidden">
            <button
              onClick={() => setEmailOpen((v) => !v)}
              className="w-full px-4 py-2.5 flex items-center justify-between text-left hover:bg-ink-50/40"
            >
              <div className="text-[12px] text-ink-600">
                <span className="text-ink-400">📄</span> Source email from
                agent · pasted on step 2
              </div>
              {emailOpen ? (
                <ChevronUp className="h-3.5 w-3.5 text-ink-400" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5 text-ink-400" />
              )}
            </button>
            {emailOpen && (
              <pre className="px-4 pb-4 pt-1 text-[11.5px] text-ink-700 font-mono whitespace-pre-wrap leading-relaxed border-t border-ink-100">
                {demoEmail}
              </pre>
            )}
          </div>

          {/* Extracted fields */}
          <div className="rounded-xl border border-ink-200/60 bg-white shadow-[0_1px_2px_rgba(26,24,20,0.03)] mb-5">
            <div className="px-5 py-3 border-b border-ink-100 flex items-center justify-between">
              <div className="text-[11px] uppercase tracking-wider text-ink-400 font-semibold">
                Step 2 · Structured deal · AI-parsed
              </div>
              <span className="text-[11px] text-ink-500">
                V1 schema · 6 fields
              </span>
            </div>

            <div className="divide-y divide-ink-100">
              <FieldRow label="Deal type" value="V1 · standard vs net" tag="ok" />
              <FieldRow label="Guarantee" value="$4,500" tag="ok" mono />
              <FieldRow
                label="Artist split"
                value="85% (after expenses)"
                tag="ok"
              />
              <FieldRow label="Expense cap" value="$3,200" tag="ok" mono />

              {/* Recoups — structured list with 3 sub-flags */}
              <div className="px-5 py-3.5">
                <div className="flex items-center justify-between mb-2.5">
                  <div className="text-[13px] text-ink-700 font-medium">
                    Recoups
                  </div>
                  <div className="text-[11px] text-ink-400">
                    structured list · category + cap + treatment + scope
                  </div>
                </div>

                {/* Marketing line with 2 sub-flags */}
                <div className="rounded-md border border-amber-200 bg-amber-50/40 mb-2 overflow-hidden">
                  <div className="px-3 py-2 border-b border-amber-200/60 flex items-center justify-between">
                    <div className="text-[12.5px] text-ink-800 font-medium">
                      <span className="text-ink-400">↳</span> Marketing — cap{" "}
                      <span className="font-mono">$500</span>
                    </div>
                    <span className="text-[10px] text-amber-800 uppercase tracking-wider font-semibold">
                      2 questions
                    </span>
                  </div>
                  <SubFlagRow
                    label="Treatment"
                    question="in cap? on top of cap? from gross before net?"
                    resolved={resolved.treatment}
                    onClick={() => setOpenFlag("treatment")}
                  />
                  <SubFlagRow
                    label="Scope"
                    question="paid digital ads? local radio? flyer print only?"
                    resolved={resolved.scope}
                    onClick={() => setOpenFlag("scope")}
                    border
                  />
                </div>

                {/* Other-categories confirmation flag */}
                <div className="rounded-md border border-amber-200 bg-amber-50/40 overflow-hidden">
                  <SubFlagRow
                    label="Other categories"
                    question="email didn't mention specialty backline, hospitality overage, production overage — confirm none allowed"
                    resolved={resolved.others}
                    onClick={() => setOpenFlag("others")}
                    primary
                  />
                </div>
              </div>

              <FieldRow label="Walkout pot" value="$200" tag="ok" mono />
              <FieldRow
                label="Bonus"
                value="open · Mariana enters as freetext at intake (next-slice candidate)"
                tag="mute"
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="brand"
              disabled={!allResolved}
              onClick={allResolved ? handleSave : undefined}
            >
              Save deal
            </Button>
            {!allResolved && (
              <span className="text-[12px] text-amber-700">
                ▸ resolve {unresolvedCount}{" "}
                {unresolvedCount === 1 ? "flag" : "flags"} to continue
              </span>
            )}
            {allResolved && (
              <span className="text-[12px] text-brand-700">
                ✓ all flags resolved · ready to send for approval
              </span>
            )}
          </div>
        </div>
      )}

      {/* Disambiguation modal */}
      {openFlag && (
        <DisambiguationModal
          flag={openFlag}
          onResolve={(value) => handleResolve(openFlag, value)}
          onClose={() => setOpenFlag(null)}
          progressIndex={FLAG_ORDER.indexOf(openFlag) + 1}
          progressTotal={FLAG_ORDER.length}
          nextFlagLabel={
            FLAG_ORDER.find((k, i) => i > FLAG_ORDER.indexOf(openFlag) && !resolved[k])
              ? FLAG_LABEL[FLAG_ORDER.find((k, i) => i > FLAG_ORDER.indexOf(openFlag) && !resolved[k]) as FlagKey]
              : null
          }
        />
      )}
    </>
  );
}

const FLAG_LABEL: Record<FlagKey, string> = {
  treatment: "Marketing · Treatment",
  scope: "Marketing · Scope",
  others: "Other categories",
};

// ---------- Subcomponents ----------

function FieldRow({
  label,
  value,
  tag,
  mono,
}: {
  label: string;
  value: string;
  tag: "ok" | "warn" | "mute";
  mono?: boolean;
}) {
  return (
    <div className="px-5 py-3 grid grid-cols-[180px_1fr_auto] gap-4 items-center">
      <div className="text-[13px] text-ink-700 font-medium">{label}</div>
      <div
        className={`text-[13px] text-ink-900 ${mono ? "font-mono" : ""}`}
      >
        {value}
      </div>
      <TagPill tag={tag} />
    </div>
  );
}

function SubFlagRow({
  label,
  question,
  resolved,
  onClick,
  border,
  primary,
}: {
  label: string;
  question: string;
  resolved: string | null;
  onClick: () => void;
  border?: boolean;
  primary?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-2.5 grid grid-cols-[110px_1fr_auto] gap-3 items-center hover:bg-amber-50/80 transition-colors ${
        border ? "border-t border-amber-200/60" : ""
      }`}
    >
      <div
        className={`text-[12px] ${
          primary ? "text-ink-800 font-medium" : "text-ink-600"
        }`}
      >
        <span className="text-ink-400">·</span> {label}
      </div>
      <div className="text-[12px] text-ink-700 leading-snug">
        {resolved ? (
          <span className="text-brand-700">✓ {resolved}</span>
        ) : (
          <em>{question}</em>
        )}
      </div>
      {resolved ? (
        <TagPill tag="ok" label="resolved" />
      ) : (
        <TagPill tag="warn" label="resolve →" />
      )}
    </button>
  );
}

function TagPill({
  tag,
  label,
}: {
  tag: "ok" | "warn" | "mute";
  label?: string;
}) {
  const styles = {
    ok: "bg-brand-50 text-brand-700",
    warn: "bg-amber-100 text-amber-800",
    mute: "bg-ink-100 text-ink-500",
  };
  const text =
    label ?? (tag === "ok" ? "✓ ok" : tag === "warn" ? "resolve" : "—");
  return (
    <span
      className={`px-2 py-0.5 rounded text-[10.5px] uppercase tracking-wider font-semibold whitespace-nowrap ${styles[tag]}`}
    >
      {text}
    </span>
  );
}

// ---------- Modal ----------

function DisambiguationModal({
  flag,
  onResolve,
  onClose,
  progressIndex,
  progressTotal,
  nextFlagLabel,
}: {
  flag: FlagKey;
  onResolve: (value: string) => void;
  onClose: () => void;
  progressIndex: number;
  progressTotal: number;
  nextFlagLabel: string | null;
}) {
  const content = useMemo(() => buildModalContent(flag), [flag]);
  const [picked, setPicked] = useState<string | null>(null);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4 bg-ink-900/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl bg-white rounded-xl shadow-xl ring-1 ring-ink-200 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-3 border-b border-ink-100 bg-amber-50/40 flex items-center justify-between">
          <div className="flex items-center gap-2 text-[12px] text-amber-900 font-semibold">
            <span>⚠</span>
            Resolve ambiguity · {progressIndex} of {progressTotal} · {content.heading}
          </div>
          <button
            onClick={onClose}
            className="text-ink-400 hover:text-ink-700 text-[12px]"
          >
            close
          </button>
        </div>

        <div className="p-5">
          <div className="text-[11px] uppercase tracking-wider text-ink-400 font-semibold mb-2">
            The email says
          </div>
          <div className="rounded-md bg-canvas-soft border border-ink-200/60 px-3 py-2.5 text-[12.5px] text-ink-800 font-mono leading-relaxed mb-4">
            {content.source}
          </div>

          <div className="text-[14px] text-ink-900 font-medium mb-3">
            {content.question}
          </div>

          <div className="space-y-2">
            {content.options.map((opt) => {
              const isChosen = picked === opt.value;
              return (
                <button
                  key={opt.value}
                  onClick={() => setPicked(opt.value)}
                  className={`w-full text-left rounded-md border px-3 py-2.5 transition-colors ${
                    isChosen
                      ? "border-brand-600 bg-brand-50/60 ring-1 ring-brand-600"
                      : "border-ink-200 bg-white hover:bg-ink-50/30"
                  }`}
                >
                  <div className="text-[13px] text-ink-900 font-medium">
                    <span className="text-ink-400 mr-1">
                      {String.fromCharCode(65 + content.options.indexOf(opt))} ·
                    </span>
                    {opt.title}
                  </div>
                  {opt.detail && (
                    <div className="text-[12px] text-ink-600 mt-1 leading-snug">
                      {opt.detail}
                    </div>
                  )}
                  {opt.tag && (
                    <div className="text-[10.5px] text-ink-400 mt-1.5 uppercase tracking-wider font-medium">
                      {opt.tag}
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {nextFlagLabel && (
            <div className="mt-4 text-[11.5px] text-ink-500">
              Next after this: <strong>{nextFlagLabel}</strong>
            </div>
          )}

          <div className="flex items-center gap-3 mt-5 pt-4 border-t border-ink-100">
            <Button
              variant="brand"
              disabled={!picked}
              onClick={() => picked && onResolve(content.summarize(picked))}
            >
              Confirm choice
            </Button>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function buildModalContent(flag: FlagKey): {
  heading: string;
  source: string;
  question: string;
  options: { value: string; title: string; detail?: string; tag?: string }[];
  summarize: (value: string) => string;
} {
  if (flag === "treatment") {
    return {
      heading: "Marketing · Treatment",
      source: "expense cap $3,200\nmarketing recoup not to exceed $500",
      question: "How is the $500 marketing recoup treated?",
      options: [
        {
          value: "in_cap",
          title: "In the cap",
          detail:
            "Marketing is part of the $3,200 cap. Total recoupable = $3,200.",
        },
        {
          value: "on_top",
          title: "On top of the cap",
          detail:
            "Marketing is $500 above the $3,200 cap. Total recoupable = $3,700.",
          tag: "this is what Mariana picks for the demo",
        },
        {
          value: "from_gross",
          title: "From gross, before net is calculated",
          detail:
            "Marketing comes off gross before the 85% split is applied.",
        },
        {
          value: "variant_review",
          title: "None of these — flag for variant review",
          detail:
            "Pushes to Mariana's taxonomy-extension queue. The slice treats Mariana as design partner for new patterns.",
        },
      ],
      summarize: (v) =>
        ({
          in_cap: "in cap",
          on_top: "on top of cap",
          from_gross: "from gross",
          variant_review: "flagged for review",
        } as Record<string, string>)[v] ?? v,
    };
  }

  if (flag === "scope") {
    return {
      heading: "Marketing · Scope",
      source:
        "marketing recoup not to exceed $500\n(no scope specified in email)",
      question: "What counts as recoupable marketing?",
      options: [
        {
          value: "flyer_only",
          title: "Flyer print only",
          detail:
            "Physical printed flyer run, pre-agreed. Digital ads NOT recoupable.",
        },
        {
          value: "paid_ads",
          title: "Paid digital ads + flyer",
          detail:
            "Instagram, Facebook, search ads + physical flyer. NOT radio or influencer fees.",
          tag: "this is what Mariana picks for the demo",
        },
        {
          value: "all_marketing",
          title: "All marketing activity",
          detail:
            "Anything venue counts as promoting the show. Broadest interpretation — risky.",
        },
        {
          value: "variant_review",
          title: "None of these — flag for variant review",
          detail: "Mariana defines a new scope template.",
        },
      ],
      summarize: (v) =>
        ({
          flyer_only: "flyer print only",
          paid_ads: "paid digital ads + flyer",
          all_marketing: "all marketing activity",
          variant_review: "flagged for review",
        } as Record<string, string>)[v] ?? v,
    };
  }

  // others
  return {
    heading: "Other recoup categories",
    source:
      "(email mentions marketing only — no specialty backline, hospitality overage, or production overage)",
    question: "Confirm: are any other recoup categories allowed in this deal?",
    options: [
      {
        value: "none",
        title: "No — marketing is the only allowed recoup",
        detail:
          "Locks the deal to one recoup category. Hwang-pattern prevention — venue can't slip in other recoups at settlement.",
        tag: "this is what Mariana picks for the demo",
      },
      {
        value: "add_backline",
        title: "Add specialty backline",
        detail: "Drum riser, specialty amps, anything beyond standard backline.",
      },
      {
        value: "add_hospitality",
        title: "Add hospitality overage",
        detail: "Costs above the rider amount.",
      },
      {
        value: "ask_agent",
        title: "Ask agent before locking",
        detail: "Pushes the question into the approval email for agent to clarify.",
      },
    ],
    summarize: (v) =>
      ({
        none: "no other categories",
        add_backline: "+ specialty backline",
        add_hospitality: "+ hospitality overage",
        ask_agent: "asking agent",
      } as Record<string, string>)[v] ?? v,
  };
}
