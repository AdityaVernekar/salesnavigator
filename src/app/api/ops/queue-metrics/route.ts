import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/config/env";
import { getQueueAndWorkerMetrics } from "@/lib/pipeline/metrics";

function assertCronSecret(request: NextRequest) {
  const secret = request.headers.get("x-cron-secret");
  if (!secret || secret !== env.CRON_SECRET) {
    throw new Error("Unauthorized metrics request");
  }
}

export async function GET(request: NextRequest) {
  try {
    assertCronSecret(request);
    const metrics = await getQueueAndWorkerMetrics();
    const alerts: string[] = [];
    if (metrics.pipelineQueueDepth > 50) alerts.push("pipeline_queue_backlog_high");
    if (metrics.stageQueueDepth > 200) alerts.push("stage_queue_backlog_high");
    if (metrics.sendQueueDepth > 300) alerts.push("send_queue_backlog_high");
    if (metrics.stageFailed > 10 || metrics.sendFailed > 10) alerts.push("job_failures_high");
    if (metrics.stuckStageJobs > 0 || metrics.stuckSendJobs > 0) alerts.push("stuck_jobs_detected");

    return NextResponse.json({
      ok: true,
      ...metrics,
      alerts,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown metrics error",
      },
      { status: 401 },
    );
  }
}
