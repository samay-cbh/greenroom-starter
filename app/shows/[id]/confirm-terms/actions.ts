"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { deals } from "@/db/schema";
import { DEAL_TERMS_VERSION, type DealTermsV1 } from "@/lib/dealTerms";

export async function confirmDealTerms(
  showId: string,
  terms: DealTermsV1,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!terms || terms.deal_terms_version !== DEAL_TERMS_VERSION) {
    return {
      ok: false,
      error: "Deal terms payload is not Deal Terms Schema v1.",
    };
  }
  if (terms.deal_type !== "vs_deal") {
    return { ok: false, error: "Only vs deals can be confirmed here." };
  }
  if (!(terms.guarantee_amount > 0)) {
    return { ok: false, error: "Guarantee must be greater than $0." };
  }
  if (!(terms.artist_percent > 0 && terms.artist_percent <= 1)) {
    return {
      ok: false,
      error: "Artist percentage must be between 0% and 100%.",
    };
  }
  if (
    terms.expense_cap.exists &&
    (terms.expense_cap.cap_amount == null || terms.expense_cap.cap_amount < 0)
  ) {
    return {
      ok: false,
      error: "Expense cap must be a non-negative amount when present.",
    };
  }
  for (const d of terms.deductions) {
    if (!(d.amount > 0)) {
      return {
        ok: false,
        error: `Deduction "${d.label}" must have a positive amount.`,
      };
    }
    if (d.basis !== "gross" && d.basis !== "net") {
      return {
        ok: false,
        error: `Deduction "${d.label}" is missing a valid basis.`,
      };
    }
    if (d.cap_scope !== "inside_cap" && d.cap_scope !== "outside_cap") {
      return {
        ok: false,
        error: `Deduction "${d.label}" cap scope must be resolved before saving.`,
      };
    }
  }

  const updated = await db
    .update(deals)
    .set({ dealTermsJson: JSON.stringify(terms) })
    .where(eq(deals.showId, showId))
    .returning({ id: deals.id });

  if (updated.length === 0) {
    return { ok: false, error: "No deal found for this show." };
  }

  revalidatePath(`/shows/${showId}/settle`);
  revalidatePath(`/shows/${showId}/confirm-terms`);
  return { ok: true };
}
