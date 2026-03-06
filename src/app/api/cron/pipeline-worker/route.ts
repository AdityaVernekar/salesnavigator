import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/config/env";
import { runBurstWithCronLog, runPipelineWorkerBurst } from "@/lib/pipeline/worker-runtime";

function assertCronSecret(request: NextRequest) {
  const secret = request.headers.get("x-cron-secret");
  if (!secret || secret !== env.CRON_SECRET) {
    throw new Error("Unauthorized cron request");
  }
}

export async function POST(request: NextRequest) {
  try {
    assertCronSecret(request);
    const url = new URL(request.url);
    const maxJobs = Math.min(Number(url.searchParams.get("maxJobs") ?? "1"), 10);
    const concurrency = Math.max(1, Math.min(Number(url.searchParams.get("concurrency") ?? "2"), maxJobs, 5));
    const result = await runBurstWithCronLog("pipeline-worker", { maxJobs, concurrency }, () =>
      runPipelineWorkerBurst({ maxJobs, concurrency }),
    );

    return NextResponse.json({
      ok: true,
      ...result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Cron pipeline worker failed";
    return NextResponse.json(
      {
        ok: false,
        error: message,
      },
      { status: 401 },
    );
  }
}
