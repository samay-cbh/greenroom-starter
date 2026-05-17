/**
 * Settlement lifecycle helpers.
 *
 * The settlement state machine:
 *
 *   draft → submitted → in_review → signed → finalized → paid
 *                              \→ disputed → revised ↗
 *
 *   voided is a terminal off-ramp (cancelled show / scrapped settlement)
 */

import type { Settlement } from "@/db/schema";

/**
 * Returns true when the signoff text reads as an approval.
 * Used to distinguish TM-night sign-off from a post-signoff dispute
 * raised later by the agent or management.
 */
export function isPositiveSignoff(text: string | null | undefined): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();
  return !["no ", "dispute", "question", "hold", "problem", "issue", "wrong", "not "].some(
    (w) => lower.includes(w)
  );
}

/** Returns the stages this settlement has been through, in order, with timestamps. */
export function stageHistory(s: Settlement) {
  const history: { stage: string; at: Date }[] = [];
  if (s.draftedAt) history.push({ stage: "draft", at: s.draftedAt });
  if (s.submittedAt) history.push({ stage: "submitted", at: s.submittedAt });
  if (s.reviewStartedAt) history.push({ stage: "in_review", at: s.reviewStartedAt });
  if (s.disputedAt) history.push({ stage: "disputed", at: s.disputedAt });
  if (s.revisedAt) history.push({ stage: "revised", at: s.revisedAt });
  if (s.signedAt) history.push({ stage: "signed", at: s.signedAt });
  if (s.finalizedAt) history.push({ stage: "finalized", at: s.finalizedAt });
  if (s.paidAt) history.push({ stage: "paid", at: s.paidAt });
  return history.sort((a, b) => a.at.getTime() - b.at.getTime());
}
