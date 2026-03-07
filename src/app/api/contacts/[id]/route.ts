import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRouteContext } from "@/lib/auth/route-context";

const contactPatchSchema = z
  .object({
    name: z.string().optional(),
    email: z.string().email().or(z.literal("")).optional(),
    headline: z.string().optional(),
    linkedin_url: z.string().url().or(z.literal("")).optional(),
    company_name: z.string().optional(),
    score: z.number().int().min(0).max(100).nullable().optional(),
    tier: z.enum(["hot", "warm", "cold", "disqualified"]).nullable().optional(),
    reasoning: z.string().nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "At least one field is required");

function cleanString(value: string | undefined) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const contextResult = await requireRouteContext();
    if (!contextResult.ok) return contextResult.response;
    const { supabase, companyId } = contextResult.context;

    const { id } = await params;
    const parsed = contactPatchSchema.parse(await request.json());
    const scorePayloadProvided =
      typeof parsed.score !== "undefined" ||
      typeof parsed.tier !== "undefined" ||
      typeof parsed.reasoning !== "undefined";

    const payload = {
      name: cleanString(parsed.name),
      email:
        typeof parsed.email === "string"
          ? (cleanString(parsed.email)?.toLowerCase() ?? null)
          : undefined,
      headline: cleanString(parsed.headline),
      linkedin_url: cleanString(parsed.linkedin_url),
      company_name: cleanString(parsed.company_name),
    };

    const { data: contactData, error } = await supabase
      .from("contacts")
      .update(payload)
      .eq("company_id", companyId)
      .eq("id", id)
      .select("id,name,email,headline,linkedin_url,company_name")
      .single();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }

    let scoreData: { score: number | null; tier: string | null; reasoning: string | null } | null = null;

    if (scorePayloadProvided) {
      const { data: existingScores, error: existingScoreError } = await supabase
        .from("icp_scores")
        .select("id,score,tier,reasoning")
        .eq("company_id", companyId)
        .eq("contact_id", id)
        .order("scored_at", { ascending: false })
        .limit(1);

      if (existingScoreError) {
        return NextResponse.json({ ok: false, error: existingScoreError.message }, { status: 400 });
      }

      const existingScore = existingScores?.[0] ?? null;
      const nextScore = typeof parsed.score === "number" ? parsed.score : existingScore?.score;
      const nextTier = typeof parsed.tier === "string" ? parsed.tier : existingScore?.tier;
      const nextReasoning =
        typeof parsed.reasoning !== "undefined"
          ? (parsed.reasoning?.trim() ? parsed.reasoning.trim() : null)
          : existingScore?.reasoning ?? null;

      if (typeof nextScore === "number" && typeof nextTier === "string") {
        if (existingScore?.id) {
          const { error: updateScoreError } = await supabase
            .from("icp_scores")
            .update({
              score: nextScore,
              tier: nextTier,
              reasoning: nextReasoning,
            })
            .eq("company_id", companyId)
            .eq("id", existingScore.id);
          if (updateScoreError) {
            return NextResponse.json({ ok: false, error: updateScoreError.message }, { status: 400 });
          }
        } else {
          const { error: insertScoreError } = await supabase
            .from("icp_scores")
            .insert({
              company_id: companyId,
              contact_id: id,
              score: nextScore,
              tier: nextTier,
              reasoning: nextReasoning,
            });
          if (insertScoreError) {
            return NextResponse.json({ ok: false, error: insertScoreError.message }, { status: 400 });
          }
        }
        scoreData = { score: nextScore, tier: nextTier, reasoning: nextReasoning };
      } else if (existingScore) {
        scoreData = {
          score: existingScore.score ?? null,
          tier: existingScore.tier ?? null,
          reasoning: existingScore.reasoning ?? null,
        };
      }
    } else {
      const { data: existingScores } = await supabase
        .from("icp_scores")
        .select("score,tier,reasoning")
        .eq("company_id", companyId)
        .eq("contact_id", id)
        .order("scored_at", { ascending: false })
        .limit(1);
      const existingScore = existingScores?.[0] ?? null;
      scoreData = existingScore
        ? {
            score: existingScore.score ?? null,
            tier: existingScore.tier ?? null,
            reasoning: existingScore.reasoning ?? null,
          }
        : null;
    }

    return NextResponse.json({
      ok: true,
      contact: {
        ...contactData,
        score: scoreData?.score ?? null,
        tier: scoreData?.tier ?? null,
        reasoning: scoreData?.reasoning ?? null,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Invalid contact payload" },
      { status: 400 },
    );
  }
}
