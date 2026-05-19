import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { deals } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getShowById } from "@/lib/queries";
import { extractAndStoreNotes } from "@/lib/notesExtractor";
import type { Deal } from "@/db/schema";

type DealPatch = Partial<Pick<Deal,
  | "dealType" | "guaranteeAmount" | "percentage" | "percentageBasis"
  | "expenseCap" | "hospitalityCap" | "recoupBasis" | "dealNotesFreetext"
  | "hospitalityBasis" | "shadowDismissalsJson"
>>;

const PATCHABLE: Array<keyof DealPatch> = [
  "dealType", "guaranteeAmount", "percentage", "percentageBasis",
  "expenseCap", "hospitalityCap", "recoupBasis", "dealNotesFreetext",
  "hospitalityBasis", "shadowDismissalsJson",
];

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();

  const update: DealPatch = {};
  for (const field of PATCHABLE) {
    if (field in body) (update as Record<string, unknown>)[field] = body[field];
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  // Clear the extraction cache whenever a structured field changes so the
  // badge doesn't re-surface stale contradictions after a fix is applied.
  // Re-extraction runs on the next "Check now" click or notes save.
  if (!("dealNotesFreetext" in update) || Object.keys(update).length > 1) {
    (update as Record<string, unknown>).notesExtractionJson = null;
  }

  // When notes are saved, clear dismissals upfront so the fresh extraction
  // surfaces contradictions the user previously dismissed against old notes.
  if ("dealNotesFreetext" in update) {
    (update as Record<string, unknown>).shadowDismissalsJson = null;
  }

  const result = await db.update(deals).set(update).where(eq(deals.showId, id));
  if (!result.rowsAffected) {
    return NextResponse.json({ error: "No deal found for this show" }, { status: 404 });
  }

  // Re-run extraction after a notes save so the badge reflects the new text.
  if ("dealNotesFreetext" in update) {
    const updated = await getShowById(id);
    if (updated?.deal) await extractAndStoreNotes(updated.deal);
  }

  return NextResponse.json({ ok: true });
}
