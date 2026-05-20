"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ReviewActions({
  agentName,
  agentEmail,
  artistName,
  showDate,
  sendBackHref,
  approveHref,
}: {
  agentName: string;
  agentEmail: string;
  artistName: string;
  showDate: string;
  sendBackHref: string;
  approveHref: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="flex items-center gap-3">
        <Button variant="brand" onClick={() => setOpen(true)}>
          <Send className="h-4 w-4" />
          Send to {agentName} for approval
        </Button>
        <Button variant="ghost" disabled>
          Save draft
        </Button>
        <span className="text-[11.5px] text-ink-400 ml-2">
          State: <code>DRAFT → SENT TO AGENT</code>
        </span>
      </div>

      {open && (
        <AgentEmailPreview
          agentName={agentName}
          agentEmail={agentEmail}
          artistName={artistName}
          showDate={showDate}
          onClose={() => setOpen(false)}
          onSendBack={() => router.push(sendBackHref)}
          onApprove={() => router.push(approveHref)}
        />
      )}
    </>
  );
}

function AgentEmailPreview({
  agentName,
  agentEmail,
  artistName,
  showDate,
  onClose,
  onSendBack,
  onApprove,
}: {
  agentName: string;
  agentEmail: string;
  artistName: string;
  showDate: string;
  onClose: () => void;
  onSendBack: () => void;
  onApprove: () => void;
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
        {/* Modal frame header — explicitly not part of Greenroom UI */}
        <div className="px-5 py-2.5 border-b border-ink-100 bg-canvas-soft flex items-center justify-between">
          <div className="text-[11px] uppercase tracking-wider text-ink-500 font-semibold flex items-center gap-2">
            <span>📨</span> What {agentName} sees in their inbox
            <span className="text-[10px] text-ink-400 normal-case tracking-normal font-normal">
              · preview only · agent product not built here
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-ink-400 hover:text-ink-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Email body */}
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
              <span className="text-ink-400">Subject:</span> Deal terms — {artistName} @ The Crescent, {showDate}
            </div>
          </div>

          <p className="mb-3">
            Hi {agentName.split(" ")[0]} — here's the structured deal for{" "}
            {artistName}, parsed from your email. Approve if it matches your
            intent, or send back with a note.
          </p>

          <div className="rounded-md border border-ink-200 bg-canvas-soft px-3 py-3 text-[11.5px] font-mono leading-relaxed mb-4">
            <div>DEAL TYPE     :  V1 · standard vs net</div>
            <div>SHOW          :  {artistName} @ The Crescent, {showDate}</div>
            <div>GUARANTEE     :  $4,500</div>
            <div>ARTIST SPLIT  :  85% of net after expenses</div>
            <div>EXPENSE CAP   :  $3,200</div>
            <div>RECOUPS       :</div>
            <div className="pl-4">
              · Marketing — cap $500 — ON TOP OF cap — paid digital ads +
              flyer
            </div>
            <div className="pl-4">
              · (no other categories — confirmed not allowed)
            </div>
            <div>WALKOUT POT   :  $200</div>
            <div>BONUS         :  —</div>
          </div>

          <p className="text-[11.5px] text-ink-500 italic mb-1">
            Approving locks both sides to these terms. If terms change later
            (phone call, amendment), you'll get a drift notice with the diff.
          </p>
        </div>

        {/* Agent action buttons */}
        <div className="px-5 py-4 border-t border-ink-100 bg-canvas-soft flex items-center gap-3">
          <Button variant="brand" onClick={onApprove}>
            ✓ Approve & lock
          </Button>
          <Button variant="outline" onClick={onSendBack}>
            ↺ Send back
          </Button>
          <span className="text-[11px] text-ink-400 ml-auto">
            Canonical demo: Send back →
          </span>
        </div>
      </div>
    </div>
  );
}
