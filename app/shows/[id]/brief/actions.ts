"use server";

import { createHash, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { dealBriefs, deals } from "@/db/schema";
import { getAIProvider, hasLLMProvider } from "@/lib/aiProvider";
import {
  DealBriefSchema,
  briefIsEmpty,
  parseAmbiguities,
  parseContradictions,
  type DealBrief,
  type Ambiguity,
  type Contradiction,
} from "@/lib/dealBrief";
import {
  parseDealEmailTier0,
  mergeAmbiguities,
  TIER0_CONFIDENCE_THRESHOLD,
} from "@/lib/tierZeroParser";
import { runContradictionChecks } from "@/lib/contradictionChecks";
import {
  embed,
  findSimilarConfirmedBriefs,
  serializeEmbedding,
  NEAR_DUPLICATE_THRESHOLD,
} from "@/lib/embeddings";
import type { FewShotExample } from "@/lib/aiProvider";

const CURRENT_USER_ID = "user_mariana";

function hashEmail(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}


export type ExtractResult =
  | {
      ok: true;
      briefId: string;
      extracted: DealBrief;
      ambiguities: Ambiguity[];
      contradictions: Contradiction[];
      providerName: string;
      cached: boolean;
    }
  | {
      ok: false;
      error: string;
    };

/**
 * The main extraction action.
 *
 * Runs the full 4-tier pipeline:
 *   Tier 0 — deterministic regex parse (always)
 *   Tier 1 — local embeddings + near-duplicate clone OR few-shot retrieval
 *   Tier 2 — Gemini LLM with structured output (only when needed)
 *   Tier 3 — manual entry if everything fails (handled in actions/UI below)
 *
 * Also runs contradiction checks (pure SQL) and persists the embedding
 * for future few-shot lookups. Idempotent for the same email body
 * (content-hash cache), supersedes prior versions on re-extract.
 */
export async function extractBriefForShow(
  showId: string,
  emailText: string,
): Promise<ExtractResult> {
  if (!emailText.trim()) {
    return { ok: false, error: "Email text is empty." };
  }

  // Resolve the deal for this show — every brief is anchored to a deal row.
  const dealRow = await db
    .select({ id: deals.id })
    .from(deals)
    .where(eq(deals.showId, showId))
    .limit(1);
  if (dealRow.length === 0) {
    return {
      ok: false,
      error: "No deal exists for this show yet. Create the deal first.",
    };
  }
  const dealId = dealRow[0].id;

  const emailHash = hashEmail(emailText);

  // Cheap cache: if the same email text was already extracted for this
  // deal, return the existing draft instead of paying for a fresh LLM call.
  const existing = await db
    .select()
    .from(dealBriefs)
    .where(eq(dealBriefs.dealId, dealId));
  const cacheHit = existing.find(
    (b) => b.sourceEmailHash === emailHash && b.status !== "superseded",
  );
  if (cacheHit) {
    const extracted = DealBriefSchema.safeParse(
      JSON.parse(cacheHit.extractedJson),
    );
    if (extracted.success) {
      // Use the same zod-validating helpers the page-level reader uses,
      // so a cache hit and a fresh page load return identically-shaped
      // data even if the stored JSON ever drifts from the schema.
      return {
        ok: true,
        briefId: cacheHit.id,
        extracted: extracted.data,
        ambiguities: parseAmbiguities(cacheHit.ambiguitiesJson),
        contradictions: parseContradictions(cacheHit.contradictionsJson),
        providerName: "cache",
        cached: true,
      };
    }
    // Stored extractedJson failed validation — silently fall through to
    // a fresh extraction. The bad cache entry will be superseded below.
  }

  // Tier 0 — deterministic parse. Always runs. If it's confident enough
  // and no ambiguity triggers fired, we skip every higher tier entirely.
  const tier0 = parseDealEmailTier0(emailText);
  const skipLLM =
    tier0.overallConfidence >= TIER0_CONFIDENCE_THRESHOLD &&
    tier0.triggers.length === 0;

  const provider = getAIProvider();
  let extracted: DealBrief;
  let ambiguities: Ambiguity[] = [];
  let providerLabel: string;
  let embedding: Float32Array | null = null;

  if (skipLLM) {
    // Happy path: Tier 0 owns the extraction. Free, ~5ms, no LLM cost.
    extracted = tier0.brief;
    ambiguities = tier0.ambiguities;
    providerLabel = "tier0_parser";
    // Still embed for future few-shot retrieval. ~50ms, free, local.
    try {
      embedding = await embed(emailText);
    } catch (err) {
      console.warn("[brief] embedding failed:", err);
    }
  } else {
    // Tier 1 — local embeddings + few-shot retrieval. Tries to either
    // clone a near-duplicate prior brief (no LLM) or supply the LLM with
    // the top-3 most-similar confirmed briefs as few-shot examples.
    let tier1Clone: { brief: DealBrief; similarity: number } | null = null;
    let fewShotExamples: FewShotExample[] = [];
    try {
      embedding = await embed(emailText);
      const similar = await findSimilarConfirmedBriefs(embedding, dealId, 3);
      const top = similar[0];
      if (top && top.similarity >= NEAR_DUPLICATE_THRESHOLD) {
        // Clone path: this email is essentially the same as a prior
        // confirmed brief. Reuse the extraction; no LLM call needed.
        tier1Clone = { brief: top.extracted, similarity: top.similarity };
      } else {
        fewShotExamples = similar.map((s) => ({
          email: s.sourceEmailText,
          brief: s.extracted,
        }));
      }
    } catch (err) {
      // Embeddings are best-effort. Failure just means we skip Tier 1
      // and let Tier 2 do its job without examples.
      console.warn("[brief] embedding/search failed:", err);
    }

    if (tier1Clone) {
      // Cloned briefs inherit the prior brief's ambiguities (the email is
      // near-identical) plus any Tier 0 findings.
      extracted = {
        ...tier1Clone.brief,
        extractedBy: "tier1_clone",
      };
      ambiguities = tier0.ambiguities;
      providerLabel = `tier1_clone (sim ${tier1Clone.similarity.toFixed(2)})`;
    } else if (!hasLLMProvider()) {
      // No LLM available (manual mode). Don't call the provider at all —
      // its "extract" returns an empty shell anyway. Keep Tier 0's best
      // effort + Tier 0's ambiguities; the UI surfaces "Build manually"
      // as the next step if the user wants to flesh it out.
      extracted = tier0.brief;
      ambiguities = tier0.ambiguities;
      providerLabel = "tier0_parser (manual mode)";
    } else {
      // Tier 2 — real LLM call with few-shot examples. Tier 0 ambiguities
      // merged in so deterministic findings (e.g. Coastal Spell recoup
      // placement) survive any LLM flakiness.
      try {
        extracted = await provider.extractBrief(emailText, fewShotExamples);
        // Ambiguity pass is independent — if it fails (zod or network),
        // fall back to Tier 0's deterministic ambiguities rather than
        // throwing away the successful extraction.
        try {
          const llmAmbiguities = await provider.detectAmbiguities(emailText);
          ambiguities = mergeAmbiguities(tier0.ambiguities, llmAmbiguities);
        } catch (ambErr) {
          console.warn("[brief] ambiguity pass failed:", ambErr);
          ambiguities = tier0.ambiguities;
        }
        providerLabel =
          fewShotExamples.length > 0
            ? `${provider.name} + ${fewShotExamples.length}-shot`
            : provider.name;
      } catch (err) {
        // LLM extraction blew up (network, schema drift, rate limit).
        // Fall back to Tier 0's best-effort extraction rather than dead-
        // ending the user. They still get the deterministic parse + the
        // ambiguity triggers Tier 0 detected. They can edit or re-extract.
        const message = err instanceof Error ? err.message : String(err);
        console.warn(
          "[brief] Tier 2 extraction failed, falling back to Tier 0:",
          message,
        );
        extracted = tier0.brief;
        ambiguities = tier0.ambiguities;
        providerLabel = "tier0_parser (LLM output rejected by schema)";
      }
    }
  }

  // Short-circuit on empty extractions. If neither Tier 0 nor Tier 2
  // found anything in the email, persisting the empty brief produces
  // misleading downstream signals (false-positive deal_type_mismatch,
  // empty clarification draft, etc.). Better to fail clearly and route
  // the user to either fix the email or build manually.
  if (briefIsEmpty(extracted)) {
    return {
      ok: false,
      error:
        "Couldn't pull any deal terms out of this email. It might not be a deal email, or the format is unfamiliar. Try pasting a different email or build the brief manually.",
    };
  }

  // Persist as a draft. Mariana confirms or edits in the next step.
  const briefId = `brief_${randomUUID()}`;

  // Contradiction checks — pure SQL against the existing DB. Runs on
  // every brief save. Surfaces the planted breadcrumbs + the cross-show
  // agent pattern (e.g. Daniel Hwang's marketing-recoup history).
  let contradictions: Contradiction[] = [];
  try {
    contradictions = await runContradictionChecks(showId, extracted);
  } catch (err) {
    // Don't fail the whole extraction if a check throws — log and continue.
    console.warn("[brief] contradiction checks failed:", err);
  }

  // All writes wrapped together so a stale file-handle (e.g. after
  // `npm run db:reset` while dev server was running) returns a friendly
  // recovery message instead of a raw 500.
  try {
    // Mark prior briefs for this deal as superseded so the lifecycle
    // stays clean (works whether prior was draft or confirmed).
    await db
      .update(dealBriefs)
      .set({ status: "superseded" })
      .where(eq(dealBriefs.dealId, dealId));

    const priorVersions = existing.length;
    await db.insert(dealBriefs).values({
      id: briefId,
      dealId,
      version: priorVersions + 1,
      status: "draft",
      sourceEmailText: emailText,
      sourceEmailHash: emailHash,
      extractedJson: JSON.stringify(extracted),
      ambiguitiesJson:
        ambiguities.length > 0 ? JSON.stringify(ambiguities) : null,
      contradictionsJson:
        contradictions.length > 0 ? JSON.stringify(contradictions) : null,
      embeddingBlob: embedding ? serializeEmbedding(embedding) : null,
      createdAt: new Date(),
      createdByUserId: CURRENT_USER_ID,
    });
  } catch (err) {
    return { ok: false, error: describeDbError(err) };
  }

  revalidatePath(`/shows/${showId}/brief`);
  return {
    ok: true,
    briefId,
    extracted,
    ambiguities,
    contradictions,
    providerName: providerLabel,
    cached: false,
  };
}

/**
 * Map low-level libsql/SQLite errors to user-actionable messages.
 * The big one is SQLITE_READONLY_DBMOVED — happens when the DB file is
 * recreated (e.g. by `npm run db:reset`) while a dev-server process holds
 * the old file handle. Restart the server and the new client opens fresh.
 */
function describeDbError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  const code =
    err && typeof err === "object" && "code" in err
      ? String((err as { code: unknown }).code)
      : "";
  const cause =
    err && typeof err === "object" && "cause" in err
      ? (err as { cause: unknown }).cause
      : null;
  const causeCode =
    cause && typeof cause === "object" && "code" in cause
      ? String((cause as { code: unknown }).code)
      : "";

  if (
    code === "SQLITE_READONLY" ||
    code === "SQLITE_READONLY_DBMOVED" ||
    causeCode === "SQLITE_READONLY" ||
    causeCode === "SQLITE_READONLY_DBMOVED" ||
    /readonly/i.test(message)
  ) {
    return "Database file changed underneath the running server (this usually means `npm run db:reset` was run while `npm run dev` was still going). Restart the dev server: stop it with Ctrl+C, then run `npm run dev` again.";
  }
  return `Database write failed: ${message}`;
}

/**
 * Save Mariana's edits to a draft brief. No confirmation yet.
 */
export async function saveBriefEdits(
  briefId: string,
  showId: string,
  edited: DealBrief,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = DealBriefSchema.safeParse(edited);
  if (!parsed.success) {
    return { ok: false, error: "Invalid brief shape." };
  }
  // Mark as manual once she's edited — tracks provenance honestly.
  const next: DealBrief = { ...parsed.data, extractedBy: "manual" };
  try {
    await db
      .update(dealBriefs)
      .set({ extractedJson: JSON.stringify(next) })
      .where(eq(dealBriefs.id, briefId));
  } catch (err) {
    return { ok: false, error: describeDbError(err) };
  }
  revalidatePath(`/shows/${showId}/brief`);
  return { ok: true };
}

/**
 * Mark a draft as awaiting the agent's confirmation reply. Called when
 * Mariana sends the clarification email (or copy/pastes its body into
 * her own client). The brief stays editable on this side until the
 * agent replies; this status mostly signals "ball is in the agent's court."
 */
export async function markAwaitingConfirmation(
  briefId: string,
  showId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await db
      .update(dealBriefs)
      .set({ status: "awaiting_confirmation" })
      .where(eq(dealBriefs.id, briefId));
  } catch (err) {
    return { ok: false, error: describeDbError(err) };
  }
  revalidatePath(`/shows/${showId}/brief`);
  return { ok: true };
}

/**
 * Tier 3 escape hatch: create an empty brief that Mariana fills in by
 * hand. Used when the LLM is down, the email is too unusual to extract,
 * or there's simply no email to paste (deal was negotiated by phone).
 */
export async function createManualBrief(
  showId: string,
  sourceText: string,
): Promise<
  | { ok: true; briefId: string; extracted: DealBrief }
  | { ok: false; error: string }
> {
  const dealRow = await db
    .select({ id: deals.id })
    .from(deals)
    .where(eq(deals.showId, showId))
    .limit(1);
  if (dealRow.length === 0) {
    return { ok: false, error: "No deal exists for this show yet." };
  }
  const dealId = dealRow[0].id;

  // Empty shell — Mariana fills it from the UI.
  const emptyBrief: DealBrief = {
    dealType: "flat",
    guaranteeAmount: null,
    percentage: null,
    percentageBasis: null,
    expenseCap: null,
    hospitalityCap: null,
    bonuses: [],
    recoups: [],
    confidence: {},
    extractedBy: "manual",
  };

  const briefId = `brief_${randomUUID()}`;
  try {
    // Supersede any prior briefs (draft or confirmed).
    await db
      .update(dealBriefs)
      .set({ status: "superseded" })
      .where(eq(dealBriefs.dealId, dealId));

    const existing = await db
      .select({ version: dealBriefs.version })
      .from(dealBriefs)
      .where(eq(dealBriefs.dealId, dealId));

    await db.insert(dealBriefs).values({
      id: briefId,
      dealId,
      version: existing.length + 1,
      status: "draft",
      sourceEmailText: sourceText || "(no source email — entered manually)",
      sourceEmailHash: hashEmail(sourceText || "manual"),
      extractedJson: JSON.stringify(emptyBrief),
      ambiguitiesJson: null,
      contradictionsJson: null,
      embeddingBlob: null,
      createdAt: new Date(),
      createdByUserId: CURRENT_USER_ID,
    });
  } catch (err) {
    return { ok: false, error: describeDbError(err) };
  }

  revalidatePath(`/shows/${showId}/brief`);
  return { ok: true, briefId, extracted: emptyBrief };
}

/**
 * Move a draft to confirmed. Two paths:
 *   - email_reply: Mariana pastes the agent's "confirmed" reply.
 *   - manual_override: Mariana takes responsibility without an email.
 */
export async function confirmBrief(
  briefId: string,
  showId: string,
  via: "email_reply" | "manual_override",
  agentReplyText?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await db
      .update(dealBriefs)
      .set({
        status: "confirmed",
        confirmedAt: new Date(),
        confirmedVia: via,
        agentReplyText: agentReplyText ?? null,
      })
      .where(eq(dealBriefs.id, briefId));
  } catch (err) {
    return { ok: false, error: describeDbError(err) };
  }
  revalidatePath(`/shows/${showId}/brief`);
  revalidatePath(`/shows/${showId}/settle`);
  revalidatePath(`/shows/${showId}`);
  return { ok: true };
}
