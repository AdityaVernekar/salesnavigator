import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/config/env";
import { finishCronRun, startCronRun } from "@/lib/cron/run-logs";
import { runWarmupCycle } from "@/lib/warmup/engine";

export async function POST(request: NextRequest) {
  let cronRunId: string | null = null;
  let startedAt = new Date().toISOString();
  try {
    if (request.headers.get("x-cron-secret") !== env.CRON_SECRET) {
      throw new Error("Unauthorized");
    }

    const started = await startCronRun("warmup");
    cronRunId = started.id;
    startedAt = started.startedAt;
    const result = await runWarmupCycle();
    await finishCronRun(cronRunId, startedAt, "success", result as Record<string, unknown>);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Cron warmup failed";
    await finishCronRun(cronRunId, startedAt, "failed", {}, message);
    return NextResponse.json(
      { ok: false, error: message },
      { status: 401 },
    );
  }
}
