import Link from "next/link";
import { Plus, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

const COASTAL_SPELL_DEMO_HREF =
  "/deals/new/sent-back?showName=Coastal+Spell+%40+The+Crescent&showDate=2026-06-14&artistId=art_coastal_spell&agentId=agent_daniel_hwang&agencyId=agcy_wme&treatment=on+top+of+cap&scope=paid+digital+ads+%2B+flyer&others=no+other+categories";

const STATUS_NAV = [
  { label: "All deals", count: 33, key: "all" },
  { label: "Drafts", count: 3, key: "drafts" },
  { label: "Awaiting agent", count: 5, key: "awaiting" },
  { label: "Sent back to me", count: 1, key: "sentback", alert: true },
  { label: "Locked", count: 24, key: "locked" },
  { label: "Drifted", count: 0, key: "drifted" },
];

const FILTER_NAV = [
  { label: "High-risk agent", count: 3 },
  { label: "Non-V1 deal types", count: 7 },
];

const RECENT_ROWS = [
  {
    show: "Frost Choir",
    dealType: "V1 · standard vs net",
    agent: "Maya Okafor",
    agency: "Wasserman",
    flagged: true,
    status: "awaiting",
    when: "yesterday · 6pm",
  },
  {
    show: "Halfmoon Drive",
    dealType: "Flat",
    agent: "Lara Bose",
    agency: "CAA",
    flagged: false,
    status: "locked",
    when: "2026-05-17",
  },
  {
    show: "Brass Hours",
    dealType: "V1 · standard vs net",
    agent: "Tom Neary",
    agency: "Wasserman",
    flagged: true,
    status: "locked",
    when: "2026-05-15",
  },
  {
    show: "Petal Knife",
    dealType: "V1 (draft, AI-parsed)",
    agent: "Sarah Kim",
    agency: "WME",
    flagged: false,
    status: "draft",
    when: "2026-05-19 · 8pm",
  },
];

export default function DealsPage() {
  return (
    <div className="px-12 py-10 max-w-7xl">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <p className="eyebrow">Deals</p>
          <h1 className="font-display text-[48px] text-ink-900 leading-tight">
            Deals
          </h1>
          <p className="text-[14px] text-ink-500 max-w-xl mt-1">
            Capture, disambiguate, and lock deal terms before show night.
          </p>
        </div>
        <Link href="/deals/new">
          <Button variant="brand">
            <Plus className="h-4 w-4" />
            New deal
          </Button>
        </Link>
      </div>

      {/* Prototype banner */}
      <div className="rounded-md border border-ink-200/60 bg-canvas-soft px-4 py-2.5 mb-8 text-[12px] text-ink-600 leading-relaxed">
        <span className="text-ink-800 font-medium">Prototype · </span>
        Synthetic data. Click{" "}
        <span className="text-ink-800 font-medium">+ New deal</span> to walk
        the full capture flow, or open the{" "}
        <span className="text-ink-800 font-medium">Sent back to me</span> row
        to jump into the canonical Coastal Spell dispute. Other rows are
        display-only.
      </div>

      {/* Two-column: status nav + content */}
      <div className="grid grid-cols-[200px_1fr] gap-8">
        {/* Status sub-nav */}
        <aside>
          <div className="text-[10px] uppercase tracking-wider text-ink-400 font-semibold mb-2 px-2">
            Status
          </div>
          <ul className="space-y-0.5 mb-6">
            {STATUS_NAV.map((item) => (
              <li
                key={item.key}
                className={`px-2.5 py-1.5 rounded-md flex items-center justify-between text-[12.5px] cursor-default ${
                  item.alert
                    ? "bg-amber-50 text-amber-900 font-medium ring-1 ring-amber-200"
                    : "text-ink-500"
                }`}
              >
                <span>{item.label}</span>
                <span
                  className={`text-[11px] ${
                    item.alert ? "text-amber-700 font-semibold" : "text-ink-400"
                  }`}
                >
                  {item.count}
                </span>
              </li>
            ))}
          </ul>

          <div className="border-t border-ink-100 pt-3 mb-2 px-2">
            <div className="text-[10px] uppercase tracking-wider text-ink-400 font-semibold">
              Filter
            </div>
          </div>
          <ul className="space-y-0.5">
            {FILTER_NAV.map((item) => (
              <li
                key={item.label}
                className="px-2.5 py-1.5 rounded-md flex items-center justify-between text-[12.5px] text-ink-500 cursor-default"
              >
                <span>{item.label}</span>
                <span className="text-[11px] text-ink-400">{item.count}</span>
              </li>
            ))}
          </ul>
        </aside>

        {/* Main content */}
        <main>
          {/* Sent back to me — clickable */}
          <section className="mb-8">
            <div className="text-[10px] uppercase tracking-wider text-ink-400 font-semibold mb-2">
              Sent back to me
            </div>
            <div className="rounded-lg border border-amber-200 bg-white overflow-hidden shadow-[0_1px_2px_rgba(26,24,20,0.03)]">
              <ListHeader />
              <Link
                href={COASTAL_SPELL_DEMO_HREF}
                className="block bg-amber-50/30 hover:bg-amber-50/60 transition-colors"
              >
                <div className="px-5 py-3.5 grid grid-cols-[1.6fr_1.4fr_120px_180px_24px] gap-4 items-center">
                  <div>
                    <div className="text-[13.5px] text-ink-900 font-medium">
                      Coastal Spell{" "}
                      <span className="text-ink-400 font-normal">
                        @ The Crescent
                      </span>
                    </div>
                    <div className="text-[11.5px] text-ink-500">
                      V1 · standard vs net
                    </div>
                  </div>
                  <div>
                    <div className="text-[13px] text-ink-800">
                      Daniel Hwang ·{" "}
                      <span className="text-ink-500">WME</span>
                    </div>
                    <div className="text-[11px] text-rose-600 mt-0.5">
                      flagged counterparty
                    </div>
                  </div>
                  <div>
                    <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 text-[10.5px] uppercase tracking-wider font-semibold">
                      sent back
                    </span>
                  </div>
                  <div>
                    <div className="text-[12.5px] text-ink-700">
                      9:14am today
                    </div>
                    <div className="text-[11px] text-ink-500 italic mt-0.5">
                      "marketing recoup…"
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-ink-400" />
                </div>
              </Link>
            </div>
          </section>

          {/* Recent — not clickable, display only */}
          <section>
            <div className="text-[10px] uppercase tracking-wider text-ink-400 font-semibold mb-2">
              Recent · all statuses
            </div>
            <div className="rounded-lg border border-ink-200/60 bg-white overflow-hidden shadow-[0_1px_2px_rgba(26,24,20,0.03)]">
              <ListHeader />
              <div className="divide-y divide-ink-100">
                {RECENT_ROWS.map((row, i) => (
                  <RecentRow key={i} {...row} />
                ))}
              </div>
            </div>
            <div className="mt-3 text-[11px] text-ink-400 italic">
              Display-only rows · the demo focuses on Coastal Spell.
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}

function ListHeader() {
  return (
    <div className="px-5 py-2 bg-ink-50/40 border-b border-ink-100 grid grid-cols-[1.6fr_1.4fr_120px_180px_24px] gap-4 text-[10px] uppercase tracking-wider text-ink-400 font-semibold">
      <div>Show</div>
      <div>Counterparty</div>
      <div>Status</div>
      <div>When</div>
      <div></div>
    </div>
  );
}

function RecentRow({
  show,
  dealType,
  agent,
  agency,
  flagged,
  status,
  when,
}: {
  show: string;
  dealType: string;
  agent: string;
  agency: string;
  flagged: boolean;
  status: string;
  when: string;
}) {
  const statusStyle =
    status === "locked"
      ? "bg-brand-50 text-brand-700"
      : status === "draft"
        ? "bg-ink-100 text-ink-600"
        : status === "awaiting"
          ? "bg-sky-50 text-sky-700"
          : "bg-ink-100 text-ink-600";
  return (
    <div className="px-5 py-3 grid grid-cols-[1.6fr_1.4fr_120px_180px_24px] gap-4 items-center cursor-default">
      <div>
        <div className="text-[13px] text-ink-700">{show}</div>
        <div className="text-[11px] text-ink-500">{dealType}</div>
      </div>
      <div>
        <div className="text-[12.5px] text-ink-700">
          {agent} · <span className="text-ink-500">{agency}</span>
        </div>
        {flagged && (
          <div className="text-[11px] text-rose-600 mt-0.5">
            flagged counterparty
          </div>
        )}
      </div>
      <div>
        <span
          className={`px-2 py-0.5 rounded text-[10.5px] uppercase tracking-wider font-semibold ${statusStyle}`}
        >
          {status}
        </span>
      </div>
      <div className="text-[12px] text-ink-500">{when}</div>
      <div />
    </div>
  );
}
