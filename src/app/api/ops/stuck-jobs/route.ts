import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/lib/config/env";
import {
  countStuckSendJobs,
  countStuckStageJobs,
  listStuckSendJobs,
  listStuckStageJobs,
} from "@/lib/pipeline/job-store";

const querySchema = z.object({
  runId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  staleProcessingMinutes: z.coerce.number().int().min(1).max(180).default(10),
});

function assertCronSecret(request: NextRequest) {
  const secret = request.headers.get("x-cron-secret");
  if (!secret || secret !== env.CRON_SECRET) {
    throw new Error("Unauthorized ops request");
  }
}

export async function GET(request: NextRequest) {
  try {
    assertCronSecret(request);
    const url = new URL(request.url);
    const parsed = querySchema.parse({
      runId: url.searchParams.get("runId") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
      staleProcessingMinutes: url.searchParams.get("staleProcessingMinutes") ?? undefined,
    });

    const [stageCount, sendCount, stageSample, sendSample] = await Promise.all([
      countStuckStageJobs({
        runId: parsed.runId,
        staleProcessingMinutes: parsed.staleProcessingMinutes,
      }),
      countStuckSendJobs({
        runId: parsed.runId,
        staleProcessingMinutes: parsed.staleProcessingMinutes,
      }),
      listStuckStageJobs({
        runId: parsed.runId,
        staleProcessingMinutes: parsed.staleProcessingMinutes,
        limit: parsed.limit,
      }),
      listStuckSendJobs({
        runId: parsed.runId,
        staleProcessingMinutes: parsed.staleProcessingMinutes,
        limit: parsed.limit,
      }),
    ]);

    return NextResponse.json({
      ok: true,
      params: parsed,
      stage: {
        stuckCount: stageCount,
        sample: stageSample,
      },
      send: {
        stuckCount: sendCount,
        sample: sendSample,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown stuck-jobs error",
      },
      { status: 401 },
    );
  }
}

