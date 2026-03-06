import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/lib/config/env";
import { finishCronRun, startCronRun } from "@/lib/cron/run-logs";
import {
  recoverStuckSendJobs,
  recoverStuckStageJobs,
} from "@/lib/pipeline/job-store";
import { getQueueAndWorkerMetrics } from "@/lib/pipeline/metrics";

const bodySchema = z.object({
  runId: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(200).default(50),
  staleProcessingMinutes: z.number().int().min(1).max(180).default(10),
});

function assertCronSecret(request: NextRequest) {
  const secret = request.headers.get("x-cron-secret");
  if (!secret || secret !== env.CRON_SECRET) {
    throw new Error("Unauthorized ops request");
  }
}

export async function POST(request: NextRequest) {
  let cronRunId: string | null = null;
  let startedAt = new Date().toISOString();
  try {
    assertCronSecret(request);
    const body = bodySchema.parse(await request.json().catch(() => ({})));
    const started = await startCronRun("ops-stuck-jobs-recover", {
      runId: body.runId ?? null,
      limit: body.limit,
      staleProcessingMinutes: body.staleProcessingMinutes,
    });
    cronRunId = started.id;
    startedAt = started.startedAt;

    const [stageRecovery, sendRecovery] = await Promise.all([
      recoverStuckStageJobs({
        runId: body.runId,
        limit: body.limit,
        staleProcessingMinutes: body.staleProcessingMinutes,
      }),
      recoverStuckSendJobs({
        runId: body.runId,
        limit: body.limit,
        staleProcessingMinutes: body.staleProcessingMinutes,
      }),
    ]);

    const metrics = await getQueueAndWorkerMetrics();
    const result = {
      ok: true,
      recovered: {
        stage: {
          count: stageRecovery.recoveredIds.length,
          ids: stageRecovery.recoveredIds,
          queueDepthAfterEnqueue: stageRecovery.enqueued,
        },
        send: {
          count: sendRecovery.recoveredIds.length,
          ids: sendRecovery.recoveredIds,
          queueDepthAfterEnqueue: sendRecovery.enqueued,
        },
      },
      metrics,
    };

    await finishCronRun(cronRunId, startedAt, "success", result);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown stuck job recovery error";
    await finishCronRun(cronRunId, startedAt, "failed", {}, message);
    return NextResponse.json({ ok: false, error: message }, { status: 401 });
  }
}

