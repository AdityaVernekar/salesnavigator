import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { buildRuntimeAgent } from "@/lib/agents/build-runtime-agent";

const requestSchema = z.object({
  prompt: z.string().trim().min(8, "Prompt must be at least 8 characters long."),
});

const generatedCampaignSchema = z.object({
  name: z.string().min(1),
  icp_description: z.string().min(1),
  scoring_rubric: z.string().min(1),
  hot_threshold: z.number(),
  warm_threshold: z.number(),
  value_prop: z.string().min(1),
  daily_send_limit: z.number(),
  lead_target: z.number(),
});

function clampInt(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

export async function POST(request: NextRequest) {
  const parsed = requestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.message }, { status: 400 });
  }

  try {
    const runtime = await buildRuntimeAgent("cold_email");
    const generation = await runtime.agent.generate(
      runtime.preparePrompt(
        [
          "Generate outbound campaign strategy details from the user prompt.",
          "Return only realistic B2B defaults that are immediately usable.",
          "Name should be concise (max 80 chars).",
          "Scoring rubric should be brief bullet-style plain text criteria.",
          "Use integer thresholds and limits.",
          `User request: ${parsed.data.prompt}`,
        ].join("\n"),
      ),
      {
        structuredOutput: { schema: generatedCampaignSchema },
      },
    );

    const draft = generation.object;
    const payload = {
      name: draft.name.slice(0, 80).trim(),
      icp_description: draft.icp_description.trim(),
      scoring_rubric: draft.scoring_rubric.trim(),
      hot_threshold: clampInt(draft.hot_threshold, 1, 100),
      warm_threshold: clampInt(draft.warm_threshold, 1, 100),
      value_prop: draft.value_prop.trim(),
      daily_send_limit: clampInt(draft.daily_send_limit, 1, 1000),
      lead_target: clampInt(draft.lead_target, 1, 100),
    };

    return NextResponse.json({ ok: true, draft: payload });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to generate campaign strategy",
      },
      { status: 400 },
    );
  }
}
