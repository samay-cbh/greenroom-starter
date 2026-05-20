import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import {
  getArtistsList,
  getAgentsList,
  getAgenciesList,
} from "@/lib/queries";
import { NewDealForm } from "./new-deal-form";

export default async function NewDealPage() {
  const [artists, agents, agencies] = await Promise.all([
    getArtistsList(),
    getAgentsList(),
    getAgenciesList(),
  ]);

  return (
    <div className="px-12 py-10 max-w-3xl">
      <Link
        href="/deals"
        className="inline-flex items-center gap-1.5 text-[12px] text-ink-400 hover:text-ink-600 mb-6"
      >
        <ArrowLeft className="h-3 w-3" />
        Back to deals
      </Link>

      <div className="mb-10">
        <p className="eyebrow">New deal · step 1 of 2</p>
        <h1 className="font-display text-[40px] text-ink-900 leading-tight">
          Start a new deal
        </h1>
        <p className="text-[13.5px] text-ink-500 max-w-xl mt-1">
          Pick the show, artist, and agent. Next step pastes the deal email and
          parses terms.
        </p>
      </div>

      <NewDealForm artists={artists} agents={agents} agencies={agencies} />
    </div>
  );
}
