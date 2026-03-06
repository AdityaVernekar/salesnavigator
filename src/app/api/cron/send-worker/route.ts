import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/config/env";
import { runBurstWithCronLog, runSendWorkerBurst } from "@/lib/pipeline/worker-runtime";

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
    const maxJobs = Math.min(Number(url.searchParams.get("maxJobs") ?? "5"), 50);
    const concurrency = Math.max(1, Math.min(Number(url.searchParams.get("concurrency") ?? "5"), maxJobs, 12));
    const result = await runBurstWithCronLog("send-worker", { maxJobs, concurrency }, () =>
      runSendWorkerBurst({ maxJobs, concurrency }),
    );

    return NextResponse.json({
      ok: true,
      ...result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Cron send worker failed";
    return NextResponse.json({ ok: false, error: message }, { status: 401 });
  }
}
