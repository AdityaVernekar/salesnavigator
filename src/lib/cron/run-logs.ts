import { supabaseServer } from "@/lib/supabase/server";

export async function startCronRun(jobName: string, details: Record<string, unknown> = {}) {
  const startedAt = new Date().toISOString();
  const { data } = await supabaseServer
    .from("cron_run_logs")
    .insert({
      job_name: jobName,
      status: "running",
      started_at: startedAt,
      details,
    })
    .select("id,started_at")
    .single();

  return {
    id: data?.id ?? null,
    startedAt: data?.started_at ?? startedAt,
  };
}

export async function finishCronRun(
  runId: string | null,
  startedAt: string,
  status: "success" | "failed",
  details: Record<string, unknown> = {},
  error: string | null = null,
) {
  if (!runId) return;
  const finishedAt = new Date().toISOString();
  const durationMs = Math.max(0, Date.parse(finishedAt) - Date.parse(startedAt));
  await supabaseServer
    .from("cron_run_logs")
    .update({
      status,
      finished_at: finishedAt,
      duration_ms: durationMs,
      details,
      error,
    })
    .eq("id", runId);
}
