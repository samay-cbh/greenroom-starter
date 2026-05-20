"use client";

import {
  FileText,
  DollarSign,
  Send,
  AlertTriangle,
  RefreshCw,
  Check,
  CreditCard,
  MessageSquare,
} from "lucide-react";
import type { DealVersion } from "@/lib/types";

const CHANGE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  deal_terms_updated: FileText,
  expense_added: DollarSign,
  expense_removed: DollarSign,
  note_updated: MessageSquare,
  settlement_submitted: Send,
  settlement_disputed: AlertTriangle,
  settlement_revised: RefreshCw,
  settlement_signed: Check,
  settlement_paid: CreditCard,
  recoup_disputed: AlertTriangle,
  comment_added: MessageSquare,
  email_update: Send,
  phone_call: MessageSquare,
};

const CHANGE_COLORS: Record<string, string> = {
  deal_terms_updated: "bg-ink-100 text-ink-600 ring-ink-200/60",
  expense_added: "bg-ink-100 text-ink-600 ring-ink-200/60",
  settlement_submitted: "bg-sky-50 text-sky-700 ring-sky-200/60",
  settlement_disputed: "bg-rose-50 text-rose-700 ring-rose-200/60",
  settlement_revised: "bg-amber-50 text-amber-700 ring-amber-200/60",
  settlement_signed: "bg-brand-50 text-brand-700 ring-brand-200/60",
  settlement_paid: "bg-brand-50 text-brand-700 ring-brand-200/60",
};

export function DealTimeline({ versions }: { versions: DealVersion[] }) {
  if (versions.length === 0) {
    return (
      <div className="text-[13px] text-ink-400 py-4">
        No version history available.
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="absolute left-[13px] top-6 bottom-4 w-px bg-ink-200/60" />
      <div className="space-y-0">
        {versions.map((v, i) => {
          const Icon = CHANGE_ICONS[v.changeType] ?? FileText;
          const color = CHANGE_COLORS[v.changeType] ?? "bg-ink-100 text-ink-600 ring-ink-200/60";
          return (
            <div key={v.id} className="relative flex gap-3 py-2.5 pl-0">
              <div className={`relative z-10 w-[27px] h-[27px] rounded-full ring-1 flex items-center justify-center shrink-0 ${color}`}>
                <Icon className="h-3 w-3" />
              </div>
              <div className="min-w-0 pt-0.5">
                <div className="text-[12.5px] font-medium text-ink-900 leading-tight">
                  {v.summary}
                </div>
                {v.detail && (
                  <div className="text-[11.5px] text-ink-500 mt-0.5 leading-snug">
                    {v.detail}
                  </div>
                )}
                {v.comment && (
                  <div className="text-[11.5px] text-ink-600 mt-1.5 bg-ink-50/50 rounded px-2.5 py-1.5 ring-1 ring-ink-200/40 italic leading-snug">
                    &ldquo;{v.comment}&rdquo;
                  </div>
                )}
                <div className="text-[10px] text-ink-400 mt-1 font-mono tabular">
                  {v.changedBy} · {new Date(v.changedAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
