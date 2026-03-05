import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/config/env";
import { finishCronRun, startCronRun } from "@/lib/cron/run-logs";
import { processNextPipelineJob } from "@/lib/pipeline/worker";

function assertCronSecret(request: NextRequest) {
  const secret = request.headers.get("x-cron-secret");
  if (!secret || secret !== env.CRON_SECRET) {
    throw new Error("Unauthorized cron request");
  }
}

export async function POST(request: NextRequest) {
  let cronRunId: string | null = null;
  let startedAt = new Date().toISOString();
  try {
    assertCronSecret(request);
    const url = new URL(request.url);
    const maxJobs = Math.min(Number(url.searchParams.get("maxJobs") ?? "1"), 10);
    const concurrency = Math.max(1, Math.min(Number(url.searchParams.get("concurrency") ?? "2"), maxJobs, 5));
    const started = await startCronRun("pipeline-worker", { maxJobs });
    cronRunId = started.id;
    startedAt = started.startedAt;
    const results: unknown[] = [];
    let shouldStop = false;
    let processedCount = 0;

    const workerLoop = async () => {
      while (!shouldStop && processedCount < maxJobs) {
        processedCount += 1;
        const result = await processNextPipelineJob();
        results.push(result);
        if (!result.processed) {
          shouldStop = true;
          break;
        }
      }
    };

    await Promise.all(Array.from({ length: concurrency }, () => workerLoop()));

    await finishCronRun(cronRunId, startedAt, "success", {
      maxJobs,
      concurrency,
      processed: results.length,
    });

    return NextResponse.json({
      ok: true,
      processed: results.length,
      concurrency,
      results,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Cron pipeline worker failed";
    await finishCronRun(cronRunId, startedAt, "failed", {}, message);
    return NextResponse.json(
      {
        ok: false,
        error: message,
      },
      { status: 401 },
    );
  }
}
