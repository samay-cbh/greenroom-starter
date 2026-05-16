import { NextRequest, NextResponse } from "next/server";
import { getShowById } from "@/lib/queries";
import { extractAndStoreNotes } from "@/lib/notesExtractor";

// POST /api/shows/[id]/extract
// Triggers first-time notes extraction for shows where notesExtractionJson is null.
// Called by NotesExtractionBadge on mount when no cached result exists.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const data = await getShowById(id);
  if (!data?.deal) return NextResponse.json({ result: null });

  const result = await extractAndStoreNotes(data.deal);
  return NextResponse.json({ result });
}
