"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Send, Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const TREATMENT_OPTIONS = [
  { value: "in cap", label: "In the cap", detail: "Marketing is part of the $3,200 cap. Total recoupable = $3,200." },
  { value: "on top of cap", label: "On top of the cap", detail: "Marketing is $500 above the $3,200 cap. Total recoupable = $3,700." },
  { value: "from gross", label: "From gross, before net is calculated", detail: "Marketing comes off gross before the 85% split is applied." },
];

export function SentBackClient({
  agentName,
  agentEmail,
  agencyName,
  showName,
  showDate,
  artistName,
  originalTreatment,
  scope,
  others,
  lockedHrefBase,
}: {
  agentName: string;
  agentEmail: string;
  agencyName: string;
  showName: string;
  showDate: string;
  artistName: string;
  originalTreatment: string;
  scope: string;
  others: string;
  lockedHrefBase: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  // The pending edit (what reviewer picks in the modal but hasn't yet confirmed)
  const [pendingTreatment, setPendingTreatment] = useState<string>("in cap");
  // The applied edit (after Confirm); null if not yet edited
  const [appliedTreatment, setAppliedTreatment] = useState<string | null>(null);
  const [sendOpen, setSendOpen] = useState(false);

  const currentTreatment = appliedTreatment ?? originalTreatment;
  const isEdited = appliedTreatment !== null;
  const canResend = isEdited;

  function handleApplyEdit() {
    setAppliedTreatment(pendingTreatment);
    setEditing(false);
  }

  function buildLockedHref() {
    const sep = lockedHrefBase.endsWith("?") ? "" : "&";
    return `${lockedHrefBase}${sep}treatment=${encodeURIComponent(currentTreatment)}`;
  }

  return (
    <>
      {/* Status banner */}
      <div className="rounded-md border border-amber-200 bg-amber-50/40 px-4 py-2.5 mb-5 flex items-center gap-3">
        <span className="px-2 py-0.5 rounded bg-white text-amber-800 text-[10px] uppercase tracking-wider font-bold ring-1 ring-amber-200">
          sent back
        </span>
        <span className="text-[12.5px] text-ink-700">
          by {agentName} · 9:14am today
        </span>
      </div>

      {/* Agent's note */}
      <div className="rounded-xl border border-amber-200 bg-amber-50/30 p-5 mb-5">
        <div className="text-[11px] uppercase tracking-wider text-amber-800 font-semibold mb-2">
          {agentName}'s note
        </div>
        <p className="text-[14px] text-ink-800 italic leading-relaxed">
          "Marketing recoup should be <strong>in the cap</strong>, not on top.
          My fault — email was unclear."
        </p>
      </div>

      {/* Counterparty card */}
      <div className="rounded-xl border border-ink-200/60 bg-white p-5 mb-5 shadow-[0_1px_2px_rgba(26,24,20,0.03)]">
        <div className="grid grid-cols-2 gap-6">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-ink-400 font-medium mb-1">
              Show
            </div>
            <div className="text-[13.5px] text-ink-900 font-medium">
              {showName}
            </div>
            <div className="text-[11.5px] text-ink-500 mt-0.5">{showDate}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-ink-400 font-medium mb-1">
              Will re-send to
            </div>
            <div className="text-[13.5px] text-ink-900 font-medium">
              {agentName}
              {agencyName && (
                <span className="text-ink-500 font-normal"> · {agencyName}</span>
              )}
            </div>
            <div className="text-[11.5px] text-ink-500 mt-0.5">{agentEmail}</div>
          </div>
        </div>
      </div>

      {/* Full deal terms — editable */}
      <div className="rounded-xl border border-ink-200/60 bg-white shadow-[0_1px_2px_rgba(26,24,20,0.03)] mb-6">
        <div className="px-5 py-3 border-b border-ink-100 flex items-center justify-between">
          <div className="text-[11px] uppercase tracking-wider text-ink-400 font-semibold">
            Deal terms
          </div>
          {!isEdited && (
            <div className="text-[11px] text-amber-700 font-medium">
              1 line needs your edit
            </div>
          )}
          {isEdited && (
            <div className="text-[11px] text-brand-700 font-medium">
              ✓ ready to re-send
            </div>
          )}
        </div>

        <div className="divide-y divide-ink-100">
          <StaticRow label="Deal type" value="V1 · standard vs net" />
          <StaticRow label="Guarantee" value="$4,500" mono />
          <StaticRow label="Artist split" value="85% of net after expenses" />
          <StaticRow label="Expense cap" value="$3,200" mono />

          {/* Recoups */}
          <div
            className={`px-5 py-4 ${
              isEdited ? "bg-brand-50/20" : "bg-amber-50/30"
            }`}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="text-[13px] text-ink-700 font-medium">
                Recoups
              </div>
              {!isEdited && (
                <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 text-[10.5px] uppercase tracking-wider font-semibold">
                  agent requested change
                </span>
              )}
              {isEdited && (
                <span className="px-2 py-0.5 rounded bg-brand-50 text-brand-700 text-[10.5px] uppercase tracking-wider font-semibold">
                  edited
                </span>
              )}
            </div>

            <div
              className={`rounded-lg border overflow-hidden mb-3 ${
                isEdited
                  ? "border-brand-200 bg-white"
                  : "border-amber-300 bg-white ring-2 ring-amber-200/60"
              }`}
            >
              <div className="px-4 py-2 border-b border-ink-100 bg-ink-50/30 flex items-center justify-between">
                <div className="text-[13px] text-ink-900 font-semibold">
                  ↳ Marketing
                </div>
                <div className="text-[11.5px] text-ink-600">
                  cap <span className="font-mono font-medium">$500</span>
                </div>
              </div>
              <div className="divide-y divide-ink-100">
                {/* Treatment — the editable line */}
                <div className="px-4 py-3 grid grid-cols-[110px_1fr_auto] gap-3 items-center">
                  <div className="text-[11.5px] uppercase tracking-wider text-ink-400 font-medium">
                    Treatment
                  </div>
                  <div>
                    {!isEdited && (
                      <div className="text-[12.5px] text-ink-700">
                        {originalTreatment}
                      </div>
                    )}
                    {isEdited && (
                      <>
                        <div className="text-[12.5px] text-rose-500 line-through">
                          {originalTreatment}
                        </div>
                        <div className="text-[12.5px] text-brand-700 font-medium mt-0.5">
                          → {currentTreatment}
                        </div>
                      </>
                    )}
                  </div>
                  <button
                    onClick={() => {
                      setPendingTreatment(
                        isEdited ? currentTreatment : "in cap",
                      );
                      setEditing(true);
                    }}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11.5px] text-ink-600 hover:text-ink-900 hover:bg-ink-100/60"
                  >
                    <Pencil className="h-3 w-3" />
                    Edit
                  </button>
                </div>
                {/* Scope — unchanged */}
                <div className="px-4 py-3 grid grid-cols-[110px_1fr_auto] gap-3 items-center bg-ink-50/20">
                  <div className="text-[11.5px] uppercase tracking-wider text-ink-400 font-medium">
                    Scope
                  </div>
                  <div className="text-[12.5px] text-ink-600">
                    {scope}{" "}
                    <span className="text-ink-400 text-[11px]">· unchanged</span>
                  </div>
                  <span className="text-ink-300 text-[11px]">—</span>
                </div>
              </div>
            </div>

            <div className="text-[11.5px] text-ink-500 italic px-1">
              ↳ Other categories: {others}{" "}
              <span className="text-ink-400">· unchanged</span>
            </div>
          </div>

          <StaticRow label="Walkout pot" value="$200" mono />
          <StaticRow label="Bonus" value="— not specified" muted />
        </div>
      </div>

      {/* Re-send actions */}
      <div className="flex items-center gap-3">
        <Button
          variant="brand"
          disabled={!canResend}
          onClick={() => setSendOpen(true)}
        >
          <Send className="h-4 w-4" />
          Re-send to {agentName} for approval
        </Button>
        <Button variant="ghost" disabled>
          Save and finish later
        </Button>
        {!canResend && (
          <span className="text-[12px] text-amber-700">
            ▸ apply 1 edit to continue
          </span>
        )}
      </div>

      <div className="mt-6 text-[11.5px] text-ink-400 leading-relaxed border-t border-ink-100 pt-4">
        <span className="text-ink-600 font-medium">State transition · </span>
        <code className="text-[11px]">SENT TO AGENT → SENT BACK → DRAFT
        (editing) → SENT TO AGENT</code>
        . Same loop until Approve.
      </div>

      {/* Edit modal */}
      {editing && (
        <EditTreatmentModal
          originalTreatment={originalTreatment}
          pending={pendingTreatment}
          onPick={setPendingTreatment}
          onConfirm={handleApplyEdit}
          onClose={() => setEditing(false)}
        />
      )}

      {/* Re-send email preview modal */}
      {sendOpen && (
        <AgentEmailPreview
          agentName={agentName}
          agentEmail={agentEmail}
          artistName={artistName}
          showDate={showDate}
          treatment={currentTreatment}
          scope={scope}
          onClose={() => setSendOpen(false)}
          onApprove={() => router.push(buildLockedHref())}
          onSendBack={() => setSendOpen(false)}
        />
      )}
    </>
  );
}

// ---------- Components ----------

function StaticRow({
  label,
  value,
  mono,
  muted,
}: {
  label: string;
  value: string;
  mono?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="px-5 py-3 grid grid-cols-[180px_1fr_auto] gap-4 items-center">
      <div className="text-[13px] text-ink-700 font-medium">{label}</div>
      <div
        className={`text-[13px] ${
          muted ? "text-ink-400 italic" : "text-ink-900"
        } ${mono ? "font-mono" : ""}`}
      >
        {value}
      </div>
      <span className="text-ink-300 text-[11px]">—</span>
    </div>
  );
}

function EditTreatmentModal({
  originalTreatment,
  pending,
  onPick,
  onConfirm,
  onClose,
}: {
  originalTreatment: string;
  pending: string;
  onPick: (v: string) => void;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4 bg-ink-900/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-white rounded-xl shadow-xl ring-1 ring-ink-200 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-3 border-b border-ink-100 bg-amber-50/40 flex items-center justify-between">
          <div className="text-[12px] text-amber-900 font-semibold">
            ✏ Edit · Marketing recoup · Treatment
          </div>
          <button
            onClick={onClose}
            className="text-ink-400 hover:text-ink-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5">
          <div className="text-[11.5px] text-ink-500 mb-3">
            <span className="text-ink-700 font-medium">Current:</span>{" "}
            {originalTreatment}
            <span className="ml-2 text-amber-700 italic">
              · agent asked for "in the cap"
            </span>
          </div>

          <div className="text-[13px] text-ink-900 font-medium mb-3">
            Update treatment
          </div>

          <div className="space-y-2">
            {TREATMENT_OPTIONS.map((opt) => {
              const isPicked = pending === opt.value;
              return (
                <button
                  key={opt.value}
                  onClick={() => onPick(opt.value)}
                  className={`w-full text-left rounded-md border px-3 py-2.5 transition-colors ${
                    isPicked
                      ? "border-brand-600 bg-brand-50/60 ring-1 ring-brand-600"
                      : "border-ink-200 bg-white hover:bg-ink-50/30"
                  }`}
                >
                  <div className="text-[13px] text-ink-900 font-medium">
                    {opt.label}
                  </div>
                  <div className="text-[12px] text-ink-600 mt-1 leading-snug">
                    {opt.detail}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-3 mt-5 pt-4 border-t border-ink-100">
            <Button variant="brand" onClick={onConfirm}>
              Apply change
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

function AgentEmailPreview({
  agentName,
  agentEmail,
  artistName,
  showDate,
  treatment,
  scope,
  onClose,
  onApprove,
  onSendBack,
}: {
  agentName: string;
  agentEmail: string;
  artistName: string;
  showDate: string;
  treatment: string;
  scope: string;
  onClose: () => void;
  onApprove: () => void;
  onSendBack: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-12 px-4 pb-12 bg-ink-900/40 backdrop-blur-sm overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl bg-white rounded-xl shadow-xl ring-1 ring-ink-200 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-2.5 border-b border-ink-100 bg-canvas-soft flex items-center justify-between">
          <div className="text-[11px] uppercase tracking-wider text-ink-500 font-semibold flex items-center gap-2">
            <span>📨</span> What {agentName} sees in their inbox · v2
            <span className="text-[10px] text-ink-400 normal-case tracking-normal font-normal">
              · preview only
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-ink-400 hover:text-ink-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-4 text-[12.5px] text-ink-700 leading-relaxed">
          <div className="text-[11px] text-ink-500 mb-3 border-b border-ink-100 pb-2 space-y-0.5">
            <div>
              <span className="text-ink-400">From:</span> Mariana Reyes via
              Greenroom &lt;noreply@greenroom.app&gt;
            </div>
            <div>
              <span className="text-ink-400">To:</span> {agentName} &lt;
              {agentEmail}&gt;
            </div>
            <div>
              <span className="text-ink-400">Subject:</span> Re: Deal terms — {artistName} @ The Crescent, {showDate}
            </div>
          </div>

          <p className="mb-3">
            Hi {agentName.split(" ")[0]} — updated per your note. Marketing
            treatment is now <strong>{treatment}</strong>. Everything else is
            the same.
          </p>

          <div className="rounded-md border border-ink-200 bg-canvas-soft px-3 py-3 text-[11.5px] font-mono leading-relaxed mb-4">
            <div>DEAL TYPE     :  V1 · standard vs net</div>
            <div>SHOW          :  {artistName} @ The Crescent, {showDate}</div>
            <div>GUARANTEE     :  $4,500</div>
            <div>ARTIST SPLIT  :  85% of net after expenses</div>
            <div>EXPENSE CAP   :  $3,200</div>
            <div>RECOUPS       :</div>
            <div className="pl-4">
              · Marketing — cap $500 — {treatment.toUpperCase()} — {scope}
            </div>
            <div className="pl-4">
              · (no other categories — confirmed not allowed)
            </div>
            <div>WALKOUT POT   :  $200</div>
            <div>BONUS         :  —</div>
          </div>

          <p className="text-[11.5px] text-ink-500 italic mb-1">
            Approving locks both sides to these terms.
          </p>
        </div>

        <div className="px-5 py-4 border-t border-ink-100 bg-canvas-soft flex items-center gap-3">
          <Button variant="brand" onClick={onApprove}>
            ✓ Approve & lock
          </Button>
          <Button variant="outline" onClick={onSendBack}>
            ↺ Send back again
          </Button>
          <span className="text-[11px] text-ink-400 ml-auto">
            Canonical demo: Approve →
          </span>
        </div>
      </div>
    </div>
  );
}
