import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/config/env";
import { finishCronRun, startCronRun } from "@/lib/cron/run-logs";
import { supabaseServer } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  let cronRunId: string | null = null;
  let startedAt = new Date().toISOString();
  try {
    if (request.headers.get("x-cron-secret") !== env.CRON_SECRET) {
      throw new Error("Unauthorized");
    }

    const started = await startCronRun("reset-sends");
    cronRunId = started.id;
    startedAt = started.startedAt;
    const { error } = await supabaseServer.rpc("reset_daily_sends");
    if (error) throw new Error(error.message);

    await finishCronRun(cronRunId, startedAt, "success");
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Cron reset-sends failed";
    await finishCronRun(cronRunId, startedAt, "failed", {}, message);
    return NextResponse.json(
      { ok: false, error: message },
      { status: 401 },
    );
  }
}
