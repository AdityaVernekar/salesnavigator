import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/config/env";
import { runBurstWithCronLog, runStageWorkerBurst } from "@/lib/pipeline/worker-runtime";

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
    const maxJobs = Math.min(Number(url.searchParams.get("maxJobs") ?? "5"), 25);
    const concurrency = Math.max(1, Math.min(Number(url.searchParams.get("concurrency") ?? "3"), maxJobs, 8));
    const result = await runBurstWithCronLog("stage-worker", { maxJobs, concurrency }, () =>
      runStageWorkerBurst({ maxJobs, concurrency }),
    );

    return NextResponse.json({
      ok: true,
      ...result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Cron stage worker failed";
    return NextResponse.json({ ok: false, error: message }, { status: 401 });
  }
}
