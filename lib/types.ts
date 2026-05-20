/**
 * Extended domain types for the Greenroom relationship intelligence
 * and settlement operating system.
 *
 * These types are designed for front-end use today and are structured
 * to be persistence-ready when backend support is added.
 */

import type { Deal, Settlement, Expense } from "@/db/schema";

// -------- Artist Intelligence --------

export type ArtistDealMix = {
  dealType: Deal["dealType"];
  count: number;
  percentage: number;
};

export type ArtistHealthSummary = {
  score: number; // 0–5
  factors: HealthFactor[];
  statements: string[];
  recommendedDealStructure: string | null;
};

export type HealthFactor = {
  label: string;
  score: number; // 0–1
  weight: number;
};

export type AgentRelationshipSummary = {
  agentId: string;
  agentName: string;
  agencyName: string | null;
  disputeCount: number;
  lastDisputedAmount: number | null;
  notes: string | null;
};

export type ArtistBookingProfile = {
  artistId: string;
  artistName: string;
  genre: string | null;
  agentName: string | null;
  agencyName: string | null;
  showCount: number;
  lastShowDate: string | null;
  firstShowDate: string | null;
  avgPayout: number | null;
  totalRevenue: number;
  dealMix: ArtistDealMix[];
  expenseComplianceRate: number; // 0–1
  disputeCount: number;
  disputedAmount: number;
  health: ArtistHealthSummary;
  agent: AgentRelationshipSummary | null;
  lastDeal: {
    dealType: Deal["dealType"];
    guaranteeAmount: number | null;
    percentage: number | null;
    expenseCap: number | null;
    hospitalityCap: number | null;
  } | null;
};

// -------- Show Triage --------

export type TriageReason =
  | "this_weekend"
  | "overdue_signature"
  | "revised_offer"
  | "pending_confirmation"
  | "dispute_action"
  | "stale_followup"
  | "open_dispute"
  | "unresolved_settlement"
  | "blocked_payout"
  | "unsigned_settlement";

export type ShowTriageItem = {
  showId: string;
  artistName: string;
  showDate: string;
  dateFormatted: string;
  dateRelative: string;
  dealType: string | null;
  dealAmount: string | null;
  settlementStatus: string | null;
  settlementTotal: string | null;
  triageReason: TriageReason;
  triageLabel: string;
  daysOld: number;
  dealNote: string | null;
};

// -------- Deal Versioning --------

export type DealVersionChangeType =
  | "deal_terms_updated"
  | "expense_added"
  | "expense_removed"
  | "note_updated"
  | "settlement_submitted"
  | "settlement_disputed"
  | "settlement_revised"
  | "settlement_signed"
  | "settlement_paid"
  | "recoup_disputed"
  | "comment_added"
  | "email_update"
  | "phone_call";

export type DealVersion = {
  id: string;
  showId: string;
  version: number;
  changeType: DealVersionChangeType;
  summary: string;
  detail: string | null;
  changedBy: string;
  changedAt: Date;
  comment: string | null;
};

export type DealComment = {
  id: string;
  showId: string;
  versionId: string | null;
  author: string;
  content: string;
  createdAt: Date;
};

// -------- Expense Proof --------

export type ExpenseWithProof = Expense & {
  proofUrl: string | null;
  proofType: "receipt" | "invoice" | "email" | null;
  hasProof: boolean;
};

// -------- Box Office Breakdown --------

export type BoxOfficeBreakdown = {
  reportedGross: number;
  ticketRevenue: number;
  fees: number;
  compFaceValue: number;
  compsCountingTowardGross: number;
  adjustedGross: number;
  deductions: { label: string; amount: number }[];
  netResult: number;
};

// -------- Settlement Review --------

export type SettlementReviewStatus =
  | "pending"
  | "approved"
  | "needs_changes"
  | "disputed";

export type SettlementReview = {
  id: string;
  settlementId: string;
  reviewer: string;
  status: SettlementReviewStatus;
  comment: string | null;
  createdAt: Date;
};

export type SettlementCalculationSnapshot = {
  id: string;
  showId: string;
  version: number;
  grossBoxOffice: number;
  netBoxOffice: number;
  totalExpenses: number;
  totalToArtist: number;
  formula: string;
  steps: { label: string; value: number; note?: string }[];
  createdAt: Date;
  createdBy: string;
};
