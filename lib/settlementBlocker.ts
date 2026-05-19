import type { SettlementBlocker, SettlementCalculation } from "@/lib/dealMath";

/** UI-only: stored terms exist but failed schema parse / migration. */
export type SettlementBlockerUi = SettlementBlocker | "terms_invalid";

export function resolveSettlementBlocker(
  calc: Extract<SettlementCalculation, { supported: false }>,
  opts: { termsParseFailed: boolean },
): SettlementBlockerUi {
  if (
    opts.termsParseFailed &&
    calc.blocker === "confirm_terms"
  ) {
    return "terms_invalid";
  }
  return calc.blocker;
}

const DEAL_TYPE_LABEL: Record<string, string> = {
  flat: "flat guarantee",
  percentage_of_gross: "percentage of gross",
  percentage_of_net: "percentage of net",
  vs: "vs deal",
  door: "door deal",
};

export function dealTypeLabel(dealType: string): string {
  return DEAL_TYPE_LABEL[dealType] ?? dealType;
}

export type BlockerPresentation = {
  accent: "brand" | "amber" | "rose";
  icon: "confirm" | "warning" | "error";
  title: string;
  description: string;
  detail?: string;
  primaryAction?: {
    label: string;
    href: string;
  };
  secondaryAction?: {
    label: string;
    href: string;
  };
  inputsHeading: string;
  inputsDescription: string;
  offPlatformTitle: string;
  offPlatformDescription: string;
};

export function getBlockerPresentation(
  blocker: SettlementBlockerUi,
  ctx: {
    dealType: string;
    showId: string;
    reason: string;
    hasSignedSettlement: boolean;
  },
): BlockerPresentation {
  const typeLabel = dealTypeLabel(ctx.dealType);
  const confirmHref = `/shows/${ctx.showId}/confirm-terms`;
  const reconfirmHref = `${confirmHref}?reconfirm=1`;
  const showHref = `/shows/${ctx.showId}`;

  const signedNote = ctx.hasSignedSettlement
    ? " This show already has a signed settlement record in Greenroom — confirming terms enables in-platform math without resetting that history."
    : "";

  switch (blocker) {
    case "confirm_terms":
      return {
        accent: "brand",
        icon: "confirm",
        title: "Confirm deal terms to run settlement",
        description: `This show is a ${typeLabel}. The settlement engine needs structured terms — guarantee, artist percentage, expense cap, and recoup position — confirmed from the deal email before it can calculate.${signedNote}`,
        primaryAction: {
          label: "Confirm deal terms",
          href: confirmHref,
        },
        inputsHeading: "Show inputs (ready for settlement)",
        inputsDescription:
          "Ticket sales and expenses are already in Greenroom. Once terms are confirmed, the engine runs end-to-end with a traceable worksheet.",
        offPlatformTitle: "Previously settled off-platform",
        offPlatformDescription:
          "A total was logged from a spreadsheet before structured terms were confirmed. After you confirm terms, compare the in-app calculation to this number.",
      };

    case "terms_invalid":
      return {
        accent: "amber",
        icon: "warning",
        title: "Saved deal terms couldn't be loaded",
        description:
          "This deal has confirmed terms on file, but they don't match the current schema and couldn't be parsed. Re-confirm from the deal email to refresh what the engine reads.",
        primaryAction: {
          label: "Re-confirm deal terms",
          href: reconfirmHref,
        },
        inputsHeading: "Show inputs",
        inputsDescription:
          "Ticket and expense data are unchanged. Re-confirming terms unblocks settlement math.",
        offPlatformTitle: "Previously settled off-platform",
        offPlatformDescription:
          "A spreadsheet total may still be on the settlement record until terms are fixed and the engine runs.",
      };

    case "terms_not_supported":
      return {
        accent: "amber",
        icon: "warning",
        title: "Confirmed terms aren't supported yet",
        description:
          "Deal terms are confirmed, but one or more fields use a configuration the v1 engine can't calculate. Update the terms or settle off-platform for now.",
        detail: ctx.reason,
        primaryAction: {
          label: "Re-confirm deal terms",
          href: reconfirmHref,
        },
        secondaryAction: {
          label: "Back to show",
          href: showHref,
        },
        inputsHeading: "Show inputs",
        inputsDescription:
          "Inputs are available below. Settlement math stays blocked until terms are within engine support.",
        offPlatformTitle: "Previously settled off-platform",
        offPlatformDescription:
          "The logged spreadsheet total won't match in-app math until terms are within engine support.",
      };

    case "missing_deal_field":
      return {
        accent: "amber",
        icon: "warning",
        title: "Complete the deal setup first",
        description: `This ${typeLabel} is missing required fields on the deal record. Add them on the show page before settlement can run.`,
        detail: ctx.reason,
        primaryAction: {
          label: "Back to show",
          href: showHref,
        },
        inputsHeading: "Show inputs",
        inputsDescription:
          "Ticket and expense data are shown for context. Settlement math runs once the deal record is complete.",
        offPlatformTitle: "Previously settled off-platform",
        offPlatformDescription:
          "A total may have been logged manually while the deal record was still incomplete.",
      };

    case "unsupported_deal_type":
      return {
        accent: "amber",
        icon: "error",
        title: `The in-app tool can't settle a ${typeLabel} yet`,
        description:
          "Mariana would run this in a Google Sheet tonight. The inputs are below — but this deal type isn't supported by the engine yet.",
        detail: ctx.reason,
        inputsHeading: "What the system has",
        inputsDescription:
          "The inputs Mariana would pull together to settle this show. They're here — but disconnected from supported deal math.",
        offPlatformTitle: "Actually settled (off-platform)",
        offPlatformDescription:
          "Mariana ran this in a spreadsheet. Here's the result that was logged back into Greenroom afterward.",
      };
  }
}
