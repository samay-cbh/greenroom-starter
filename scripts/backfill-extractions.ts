/**
 * Backfill shadow deal extractions for shows that have deal notes but have
 * never been run through the AI extractor.
 *
 * Usage:
 *   GEMINI_API_KEY=<key> npx tsx scripts/backfill-extractions.ts
 *
 * The script:
 *   - Queries all deals where deal_notes_freetext is set and
 *     notes_extraction_json is null/empty.
 *   - Calls extractAndStoreNotes() for each — which writes the result
 *     (or a rate-limit marker) directly to the DB.
 *   - Waits DELAY_MS between calls to avoid burst rate limiting.
 *   - Stops cleanly on the first 429 (the function writes a rate-limit
 *     marker and returns null). Re-running later will skip already-
 *     extracted shows automatically.
 *
 * Free Gemini quota is ~15 req/min and ~1,500/day. At 3 s delay this
 * script runs comfortably within the per-minute cap; for large backlogs
 * split across multiple days.
 */

import { db } from "../db";
import { deals } from "../db/schema";
import { isNull, or, eq } from "drizzle-orm";
import { extractAndStoreNotes, isRateLimited } from "../lib/notesExtractor";

const DELAY_MS = 3_000;

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === "your_api_key_here") {
    console.error("GEMINI_API_KEY is not set. Export it before running this script.");
    process.exit(1);
  }

  // Fetch all deals that have notes but no extraction yet.
  const pending = await db.query.deals.findMany({
    where: (d, { isNull, isNotNull, or, sql }) =>
      sql`${d.dealNotesFreetext} IS NOT NULL AND ${d.dealNotesFreetext} != '' AND (${d.notesExtractionJson} IS NULL OR ${d.notesExtractionJson} = '')`,
  });

  const total = pending.length;
  if (total === 0) {
    console.log("Nothing to backfill — all shows with notes already have an extraction.");
    return;
  }

  console.log(`Found ${total} show(s) to backfill.\n`);

  let done = 0;
  let rateLimitedAt: string | null = null;

  for (const deal of pending) {
    process.stdout.write(`[${done + 1}/${total}] show_${deal.showId} — extracting…`);

    const result = await extractAndStoreNotes(deal);

    // Check if extraction wrote a rate-limit marker (result will be null on 429)
    if (result === null) {
      // Re-read the DB row to see if a rate-limit marker was stored
      const refreshed = await db.query.deals.findFirst({
        where: (d, { eq }) => eq(d.showId, deal.showId),
        columns: { notesExtractionJson: true },
      });
      const { limited, retryAfter } = isRateLimited(refreshed?.notesExtractionJson);
      if (limited) {
        rateLimitedAt = retryAfter ?? null;
        console.log(" RATE LIMITED");
        break;
      }
      // Null for other reasons (e.g. empty notes after trim) — skip silently
      console.log(" skipped (no extractable content)");
    } else {
      const issueCount = result.contradictions.length + result.ambiguities.length;
      console.log(` done — ${issueCount} issue(s) found`);
      done++;
    }

    if (done < total) await sleep(DELAY_MS);
  }

  console.log(`\nBackfill complete: ${done} of ${total} extracted.`);
  if (rateLimitedAt) {
    const retryTime = new Date(rateLimitedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    console.log(`Rate limited — re-run after ${retryTime}. Already-extracted shows will be skipped automatically.`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
