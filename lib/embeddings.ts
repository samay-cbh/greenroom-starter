/**
 * Local embeddings via @xenova/transformers. No API key, no network at
 * inference time, ~50ms per embedding after the first model load.
 *
 * Model: Xenova/all-MiniLM-L6-v2 — 384-dim sentence embeddings, ~30MB.
 * Downloaded once to ~/.cache/transformers on first call.
 *
 * Used for two things, both cheap:
 *   1. Near-duplicate detection: if a new email is ≥0.95 similar to a
 *      prior confirmed brief, clone that brief's extraction (Tier 1 hit).
 *   2. Few-shot example retrieval: top-3 most similar confirmed briefs
 *      become in-context examples in the LLM prompt (Tier 2 quality boost).
 *
 * At 540 deals × 1.5KB per 384-float vector = ~800KB of vectors. SQLite
 * holds them as BLOBs in deal_briefs.embedding_blob — no vector DB
 * required at this scale; cosine similarity over ~500 rows is sub-ms.
 */

import { db } from "@/db";
import { dealBriefs } from "@/db/schema";
import { eq } from "drizzle-orm";
import { parseDealBrief, type DealBrief } from "./dealBrief";

const MODEL_ID = "Xenova/all-MiniLM-L6-v2";

// Module-scope singleton. Loaded lazily on first use.
type EmbedderFn = (
  text: string,
  options?: { pooling?: "mean"; normalize?: boolean },
) => Promise<{ data: Float32Array }>;
let embedderPromise: Promise<EmbedderFn> | null = null;

async function getEmbedder(): Promise<EmbedderFn> {
  if (!embedderPromise) {
    embedderPromise = (async () => {
      // Dynamic import: keep the heavy package out of the cold path of any
      // module that imports `lib/embeddings.ts` but never calls embed().
      const transformers = await import("@xenova/transformers");
      // Tell the runtime not to look for local model files first — go straight
      // to the cached download (avoids a "file not found" warning loop).
      transformers.env.allowLocalModels = false;
      const fn = await transformers.pipeline("feature-extraction", MODEL_ID);
      return fn as unknown as EmbedderFn;
    })();
  }
  return embedderPromise;
}

/** Embed a string into a 384-dim Float32Array. ~50ms after warmup. */
export async function embed(text: string): Promise<Float32Array> {
  const embedder = await getEmbedder();
  const result = await embedder(text, { pooling: "mean", normalize: true });
  return result.data;
}

// -------- Serialization (Float32Array ↔ Buffer for SQLite BLOB) --------

export function serializeEmbedding(arr: Float32Array): Buffer {
  return Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength);
}

export function deserializeEmbedding(
  blob: Buffer | Uint8Array | ArrayBuffer,
): Float32Array {
  if (blob instanceof ArrayBuffer) {
    return new Float32Array(blob);
  }
  return new Float32Array(blob.buffer, blob.byteOffset, blob.byteLength / 4);
}

// -------- Similarity --------

/** Cosine similarity between two L2-normalized vectors → dot product. */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}

// -------- Top-K search across confirmed briefs --------

export interface SimilarBrief {
  briefId: string;
  similarity: number;
  sourceEmailText: string;
  extracted: DealBrief;
}

/**
 * Find the top-K confirmed briefs most similar to `queryEmbedding`.
 * Excludes the deal we're working on (so we don't echo prior versions of
 * the same deal back as "examples").
 */
export async function findSimilarConfirmedBriefs(
  queryEmbedding: Float32Array,
  excludeDealId: string,
  k = 3,
): Promise<SimilarBrief[]> {
  const candidates = await db
    .select({
      id: dealBriefs.id,
      dealId: dealBriefs.dealId,
      sourceEmailText: dealBriefs.sourceEmailText,
      extractedJson: dealBriefs.extractedJson,
      embeddingBlob: dealBriefs.embeddingBlob,
    })
    .from(dealBriefs)
    .where(eq(dealBriefs.status, "confirmed"));

  const scored: SimilarBrief[] = [];
  for (const c of candidates) {
    if (c.dealId === excludeDealId) continue;
    if (!c.embeddingBlob) continue;
    const blob = c.embeddingBlob as unknown as Buffer | Uint8Array;
    let candidateEmbedding: Float32Array;
    try {
      candidateEmbedding = deserializeEmbedding(blob);
    } catch {
      continue;
    }
    if (candidateEmbedding.length !== queryEmbedding.length) continue;
    const sim = cosineSimilarity(queryEmbedding, candidateEmbedding);
    const extracted = parseDealBrief(c.extractedJson);
    if (!extracted) continue;
    scored.push({
      briefId: c.id,
      similarity: sim,
      sourceEmailText: c.sourceEmailText,
      extracted,
    });
  }

  scored.sort((a, b) => b.similarity - a.similarity);
  return scored.slice(0, k);
}

export const NEAR_DUPLICATE_THRESHOLD = 0.95;
