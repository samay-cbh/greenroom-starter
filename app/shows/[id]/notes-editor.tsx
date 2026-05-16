"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, Check } from "lucide-react";

export function NotesEditor({
  showId,
  currentNotes,
}: {
  showId: string;
  currentNotes: string | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(currentNotes ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await fetch(`/api/shows/${showId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dealNotesFreetext: value }),
      });
      setSaved(true);
      setEditing(false);
      setTimeout(() => router.refresh(), 300);
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="inline-flex items-center gap-1 text-[11px] text-ink-400 hover:text-ink-700 transition-colors mt-2"
      >
        <Pencil className="h-3 w-3" />
        {currentNotes ? "Edit notes" : "Add deal notes"}
        {saved && <Check className="h-3 w-3 text-emerald-600 ml-1" />}
      </button>
    );
  }

  return (
    <div className="mt-3 space-y-2">
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={4}
        autoFocus
        placeholder="Enter deal terms as received from the agent — guarantee, percentage, expense cap, recoup language…"
        className="w-full rounded-lg border border-ink-200/80 bg-white px-3 py-2.5 text-[13px] text-ink-800 leading-relaxed focus:outline-none focus:ring-2 focus:ring-brand-500/40 resize-none"
      />
      <div className="flex items-center gap-2">
        <button
          onClick={save}
          disabled={saving || !value.trim()}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50 transition-colors"
        >
          {saving && <Loader2 className="h-3 w-3 animate-spin" />}
          {saving ? "Saving…" : "Save notes"}
        </button>
        <button
          onClick={() => { setEditing(false); setValue(currentNotes ?? ""); }}
          className="text-[12px] text-ink-400 hover:text-ink-700 transition-colors"
        >
          Cancel
        </button>
        <span className="text-[11px] text-ink-300 ml-auto">
          AI validation runs on save
        </span>
      </div>
    </div>
  );
}
