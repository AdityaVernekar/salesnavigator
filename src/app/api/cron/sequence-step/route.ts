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

    const started = await startCronRun("sequence-step");
    cronRunId = started.id;
    startedAt = started.startedAt;
    const { data: due } = await supabaseServer
      .from("enrollments")
      .select("*")
      .eq("status", "active")
      .lte("next_step_at", new Date().toISOString());

    await finishCronRun(cronRunId, startedAt, "success", {
      dueCount: due?.length ?? 0,
    });
    return NextResponse.json({ ok: true, dueCount: due?.length ?? 0 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Cron sequence-step failed";
    await finishCronRun(cronRunId, startedAt, "failed", {}, message);
    return NextResponse.json(
      { ok: false, error: message },
      { status: 401 },
    );
  }
}
