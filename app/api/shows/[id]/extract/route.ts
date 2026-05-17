import { NextRequest, NextResponse } from "next/server";
import { getShowById } from "@/lib/queries";
import { extractAndStoreNotes } from "@/lib/notesExtractor";

// POST /api/shows/[id]/extract
// Triggers a fresh AI extraction run. Called when the user clicks "Re-run AI check"
// in the NotesExtractionBadge. Writes result to notesExtractionJson and shadowDealJson.
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
