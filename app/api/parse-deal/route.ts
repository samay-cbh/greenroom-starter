import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

export interface ParseDealRequest {
  dealNotes: string;
  artistName: string;
  grossBoxOffice: number;
  totalExpenses: number;
  venueCapacity?: number;
}

export interface ParsedDealTerms {
  dealType: "flat" | "percentage_of_gross" | "percentage_of_net" | "vs" | "door";
  guaranteeAmount: number | null;
  percentage: number | null;
  expenseCap: number | null;
  hospitalityCap: number | null;
  bonuses: (
    | { type: "gross_threshold"; label: string; threshold: number; amount: number }
    | { type: "sellout"; label: string; amount: number }
    | { type: "attendance_threshold"; label: string; threshold: number; amount: number }
    | { type: "gross_percentage_above_threshold"; label: string; threshold: number; percentage: number }
  )[];
  recoups: {
    category: string;
    amount: number;
    description: string;
  }[];
  confidence: "high" | "medium" | "low";
  aiNotes: string;
}

const SYSTEM_PROMPT = `You are a settlement assistant for live music venues. Your job is to extract structured deal terms from free-text deal notes written by a booker or copied from an agent's email.

Deal types:
- flat: Artist gets a fixed dollar guarantee regardless of ticket sales
- percentage_of_gross: Artist gets X% of total box office gross, no expense deductions
- percentage_of_net: Artist gets X% of net (gross minus approved expenses)
- vs: Artist gets the GREATER of (a flat guarantee) vs (a percentage of net) — common shorthand: "$X vs Y% of net"
- door: Artist gets all or most of the door minus a fixed venue fee

Rules:
- percentage values: return as a decimal (0.85 for 85%, 0.15 for 15%)
- guaranteeAmount: always in dollars, null if not present
- expenseCap: the maximum expenses the artist is responsible for, null if uncapped or not mentioned
- hospitalityCap: cap specifically on hospitality/catering spend, null if not mentioned
- bonuses: only include bonuses explicitly mentioned in the notes. Use "gross_percentage_above_threshold" (with a percentage field, e.g. 1.0 for 100%) when the deal says things like "walkout pot", "100% of gross above $X", or "artist gets all dollars above $X". Use "gross_threshold" only for flat dollar bonuses triggered when gross clears a threshold.
- recoups: deductions the venue takes off the top (marketing, prior advance, etc.) — include only if mentioned
- confidence: "high" if the terms are unambiguous, "medium" if you had to interpret something, "low" if the notes are vague or contradictory
- aiNotes: a 1-3 sentence plain-English summary of what you found, flagging any ambiguities the booker should verify

Respond ONLY with valid JSON matching the schema. No prose before or after.`;

export async function POST(req: NextRequest) {
  const body: ParseDealRequest = await req.json();
  const { dealNotes, artistName, grossBoxOffice, totalExpenses, venueCapacity } = body;

  if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY === "your-api-key-here") {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not configured. Add it to .env.local." },
      { status: 503 }
    );
  }

  if (!dealNotes?.trim()) {
    return NextResponse.json(
      { error: "No deal notes to parse." },
      { status: 400 }
    );
  }

  const client = new Anthropic();

  const userMessage = `Parse the deal terms from these notes for a show with ${artistName}.

Show context (for evaluating bonuses):
- Gross box office so far: $${grossBoxOffice.toLocaleString()}
- Total expenses: $${totalExpenses.toLocaleString()}${venueCapacity ? `\n- Venue capacity: ${venueCapacity}` : ""}

Deal notes:
${dealNotes}

Return the extracted terms as JSON matching this exact schema:
{
  "dealType": "flat" | "percentage_of_gross" | "percentage_of_net" | "vs" | "door",
  "guaranteeAmount": number | null,
  "percentage": number | null,
  "expenseCap": number | null,
  "hospitalityCap": number | null,
  "bonuses": [
    { "type": "gross_threshold", "label": string, "threshold": number, "amount": number } |
    { "type": "sellout", "label": string, "amount": number } |
    { "type": "attendance_threshold", "label": string, "threshold": number, "amount": number } |
    { "type": "gross_percentage_above_threshold", "label": string, "threshold": number, "percentage": number }
  ],
  "recoups": [{ "category": string, "amount": number, "description": string }],
  "confidence": "high" | "medium" | "low",
  "aiNotes": string
}`;

  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMessage }],
  });

  const rawText = message.content[0].type === "text" ? message.content[0].text : "";
  const jsonText = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

  let parsed: ParsedDealTerms;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return NextResponse.json(
      { error: "AI returned an unexpected response format. Try again." },
      { status: 500 }
    );
  }

  return NextResponse.json(parsed);
}
