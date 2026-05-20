"use server";

import { redirect } from "next/navigation";
import { db } from "@/db";
import { settlementInterpretations } from "@/db/schema";
import type {
  AmbiguityImpact,
  Divergence,
  ExtractedDealTerms,
  SavedAmbiguityResolution,
  SavedDivergenceResolution,
} from "@/lib/interpretation-types";

const CONFIRMED_BY = "Mariana Reyes";

export async function confirmInterpretationAction(formData: FormData) {
  const showId = String(formData.get("showId") ?? "");
  if (!showId) throw new Error("Missing show id");

  const extraction = readJson<ExtractedDealTerms>(formData, "extraction");
  const divergences = readJson<Divergence[]>(formData, "divergences");
  const impacts = readJson<AmbiguityImpact[]>(formData, "ambiguityImpacts");
  const structuredSnapshot = readJson<Record<string, unknown>>(
    formData,
    "structuredSnapshot",
  );

  const divergenceLog: SavedDivergenceResolution[] = divergences.map(
    (divergence) => ({
      ...divergence,
      selectedSource:
        formData.get(`divergence_${divergence.id}`) === "structured"
          ? "structured"
          : "prose",
    }),
  );

  const ambiguityResolutions: SavedAmbiguityResolution[] = impacts.flatMap(
    (impact) => {
      const chosen = String(formData.get(`ambiguity_${impact.ambiguityId}`) ?? "");
      if (!chosen) return [];
      const option = impact.options.find(
        (candidate) => candidate.interpretationId === chosen,
      );
      if (!option) return [];
      return [
        {
          ambiguityId: impact.ambiguityId,
          field: impact.ambiguityId,
          sourceQuote: impact.sourceQuote,
          chosenInterpretationId: option.interpretationId,
          chosenLabel: option.label,
          chosenDescription: option.description,
          chosenPayout: option.payout,
          payoutDelta: impact.delta,
        },
      ];
    },
  );

  const confirmedDealTerms = {
    extraction,
    structuredSnapshot,
    fieldSelections: divergenceLog.map((item) => ({
      field: item.field,
      selectedSource: item.selectedSource,
      confirmedValue:
        item.selectedSource === "structured"
          ? item.structuredValue
          : item.proseValue,
      sourceQuote: item.sourceQuote,
    })),
  };

  const id = `interp_${showId}_${Date.now()}`;
  await db.insert(settlementInterpretations).values({
    id,
    showId,
    confirmedDealTermsJson: JSON.stringify(confirmedDealTerms),
    divergenceLogJson: JSON.stringify(divergenceLog),
    ambiguityResolutionsJson: JSON.stringify(ambiguityResolutions),
    confirmedBy: CONFIRMED_BY,
    confirmedAt: new Date(),
  });

  redirect(`/shows/${showId}/interpret?artifact=${id}`);
}

function readJson<T>(formData: FormData, key: string): T {
  const value = formData.get(key);
  if (typeof value !== "string") {
    throw new Error(`Missing ${key}`);
  }
  return JSON.parse(value) as T;
}
