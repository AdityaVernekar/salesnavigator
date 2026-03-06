import { getRunJobCounts } from "@/lib/pipeline/job-store";
import { logRunEvent, updateRunState } from "@/lib/pipeline/run-state";

export async function finalizeRunIfDone(runId: string) {
  const counts = await getRunJobCounts(runId);
  if (
    counts.stageQueued > 0 ||
    counts.stageProcessing > 0 ||
    counts.sendQueued > 0 ||
    counts.sendProcessing > 0
  ) {
    return;
  }

  if (counts.stageFailed > 0 || counts.sendFailed > 0) {
    await updateRunState(runId, {
      status: "failed",
      current_stage: "failed",
      finished_at: new Date().toISOString(),
      error: `Job failures detected (stage_failed=${counts.stageFailed}, send_failed=${counts.sendFailed})`,
    });
    await logRunEvent(runId, "worker", "error", "Chunked run failed", counts);
    return;
  }

  await updateRunState(runId, {
    status: "completed",
    current_stage: "completed",
    finished_at: new Date().toISOString(),
    error: null,
  });
  await logRunEvent(runId, "pipeline", "success", "Chunked run completed", counts);
}
