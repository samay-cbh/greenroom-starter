"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

type Artist = { id: string; name: string; agentId: string | null };
type Agent = {
  id: string;
  name: string;
  email: string;
  agencyId: string | null;
};
type Agency = { id: string; name: string };

export function NewDealForm({
  artists,
  agents,
  agencies,
}: {
  artists: Artist[];
  agents: Agent[];
  agencies: Agency[];
}) {
  const router = useRouter();

  const defaultArtist =
    artists.find((a) => a.name === "Coastal Spell") ?? artists[0];
  const defaultAgent = agents.find((a) => a.name === "Daniel Hwang");
  const defaultAgency = agencies.find((c) => c.name === "WME");

  const [showName, setShowName] = useState("Coastal Spell @ The Crescent");
  const [showDate, setShowDate] = useState("2026-06-14");
  const [artistId, setArtistId] = useState<string>(defaultArtist?.id ?? "");
  const [agentId, setAgentId] = useState<string>(defaultAgent?.id ?? "");
  const [agencyId, setAgencyId] = useState<string>(defaultAgency?.id ?? "");

  // Default agent/agency from picked artist (if not user-overridden)
  const picked = useMemo(() => {
    const artist = artists.find((a) => a.id === artistId);
    const agent = artist
      ? agents.find((g) => g.id === artist.agentId)
      : undefined;
    const agency = agent
      ? agencies.find((c) => c.id === agent.agencyId)
      : undefined;
    return { artist, agent, agency };
  }, [artistId, artists, agents, agencies]);

  const resolvedAgentId = agentId || picked.agent?.id || "";
  const resolvedAgencyId = agencyId || picked.agency?.id || "";
  const resolvedAgentEmail =
    agents.find((a) => a.id === resolvedAgentId)?.email ?? "";

  const canContinue =
    showName.trim() && showDate && artistId && resolvedAgentId;

  function handleContinue() {
    const params = new URLSearchParams({
      showName,
      showDate,
      artistId,
      agentId: resolvedAgentId,
      agencyId: resolvedAgencyId,
    });
    router.push(`/deals/new/capture?${params.toString()}`);
  }

  return (
    <>
      <div className="rounded-lg border border-ink-200/60 bg-canvas-soft p-4 text-[12px] text-ink-500 mb-6 leading-relaxed">
        <span className="text-ink-700 font-medium">Prototype note · </span>
        Dropdowns pull real artists, agents, and agencies from the seeded DB.
        Continue does not write to the DB — the demo walks one example
        (Coastal Spell).
      </div>

      <div className="rounded-xl border border-ink-200/60 bg-white shadow-[0_1px_2px_rgba(26,24,20,0.03)] divide-y divide-ink-100">
        <FormRow label="Show name" required>
          <input
            type="text"
            value={showName}
            onChange={(e) => setShowName(e.target.value)}
            className="w-full px-3 py-2 rounded-md border border-ink-200 bg-canvas-soft text-[13.5px] focus:outline-none focus:ring-2 focus:ring-brand-700 focus:border-transparent"
            placeholder="e.g. Coastal Spell at The Crescent"
          />
          <FieldMeta>Free text — show may not yet exist in Greenroom.</FieldMeta>
        </FormRow>

        <FormRow label="Show date" required>
          <input
            type="date"
            value={showDate}
            onChange={(e) => setShowDate(e.target.value)}
            className="px-3 py-2 rounded-md border border-ink-200 bg-canvas-soft text-[13.5px] focus:outline-none focus:ring-2 focus:ring-brand-700 focus:border-transparent"
          />
        </FormRow>

        <FormRow label="Artist" required>
          <select
            value={artistId}
            onChange={(e) => {
              setArtistId(e.target.value);
              setAgentId("");
              setAgencyId("");
            }}
            className="w-full px-3 py-2 rounded-md border border-ink-200 bg-canvas-soft text-[13.5px] focus:outline-none focus:ring-2 focus:ring-brand-700 focus:border-transparent"
          >
            <option value="">— Pick from your artists —</option>
            {artists.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <FieldMeta>
            <SrcPill>db</SrcPill> from <code>artists</code> table
          </FieldMeta>
        </FormRow>

        <FormRow label="Agent" required>
          <select
            value={resolvedAgentId}
            onChange={(e) => setAgentId(e.target.value)}
            className="w-full px-3 py-2 rounded-md border border-ink-200 bg-canvas-soft text-[13.5px] focus:outline-none focus:ring-2 focus:ring-brand-700 focus:border-transparent"
          >
            <option value="">— Pick from your agents —</option>
            {agents.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
          <FieldMeta>
            <SrcPill>db</SrcPill> default from artist record
          </FieldMeta>
        </FormRow>

        <FormRow label="Agency">
          <select
            value={resolvedAgencyId}
            onChange={(e) => setAgencyId(e.target.value)}
            className="w-full px-3 py-2 rounded-md border border-ink-200 bg-canvas-soft text-[13.5px] focus:outline-none focus:ring-2 focus:ring-brand-700 focus:border-transparent"
          >
            <option value="">— Pick from agencies —</option>
            {agencies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <FieldMeta>
            <SrcPill>db</SrcPill> from <code>agencies</code> · used for reports
          </FieldMeta>
        </FormRow>

        <FormRow label="Agent email">
          <input
            type="email"
            value={resolvedAgentEmail}
            readOnly
            className="w-full px-3 py-2 rounded-md border border-ink-200 bg-ink-50/40 text-[13.5px] text-ink-600"
          />
          <FieldMeta>Pre-filled from agent record.</FieldMeta>
        </FormRow>
      </div>

      <div className="flex items-center gap-3 mt-6">
        <Button
          variant="brand"
          disabled={!canContinue}
          onClick={handleContinue}
        >
          Continue to deal capture →
        </Button>
        <Button variant="ghost" onClick={() => router.push("/deals")}>
          Cancel
        </Button>
      </div>
    </>
  );
}

function FormRow({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[180px_1fr] gap-6 px-5 py-4 items-start">
      <div className="text-[12.5px] text-ink-600 pt-2 font-medium">
        {label}
        {required && <span className="text-rose-500 ml-0.5">*</span>}
      </div>
      <div>{children}</div>
    </div>
  );
}

function FieldMeta({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] text-ink-400 mt-1.5 flex items-center gap-1.5">
      {children}
    </div>
  );
}

function SrcPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="px-1.5 py-0.5 rounded bg-brand-50 text-brand-700 text-[9.5px] uppercase tracking-wider font-medium">
      {children}
    </span>
  );
}
