import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRouteContext } from "@/lib/auth/route-context";
import { supabaseServer } from "@/lib/supabase/server";
import { finishStageJob } from "@/lib/pipeline/job-store";
import { logRunEvent } from "@/lib/pipeline/run-state";
import {
  EXECUTABLE_PIPELINE_STAGES,
  isExecutablePipelineStage,
} from "@/lib/pipeline/stages";

const requestSchema = z.object({
  stage: z.string().refine(isExecutablePipelineStage, {
    message: `Stage must be one of: ${EXECUTABLE_PIPELINE_STAGES.join(", ")}`,
  }),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ runId: string }> },
) {
  const contextResult = await requireRouteContext();
  if (!contextResult.ok) return contextResult.response;
  const { companyId } = contextResult.context;

  const { runId } = await params;
  const parsed = requestSchema.safeParse(
    await request.json().catch(() => ({})),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.message },
      { status: 400 },
    );
  }
  const { stage } = parsed.data;

  // Verify run exists, belongs to user's company, and is running
  const { data: run } = await supabaseServer
    .from("pipeline_runs")
    .select("id,status,selected_stages")
    .eq("id", runId)
    .eq("company_id", companyId)
    .maybeSingle();

  if (!run) {
    return NextResponse.json(
      { ok: false, error: "Run not found" },
      { status: 404 },
    );
  }
  if (run.status !== "running") {
    return NextResponse.json(
      { ok: false, error: "Run is not currently running" },
      { status: 400 },
    );
  }

  // Cancel all queued/processing stage_jobs for this stage
  const { data: jobs } = await supabaseServer
    .from("stage_jobs")
    .select("id,status")
    .eq("run_id", runId)
    .eq("stage", stage)
    .in("status", ["queued", "processing"]);

  for (const job of jobs ?? []) {
    await finishStageJob(String(job.id), "cancelled", "Skipped by user");
  }

  // Remove stage from selected_stages
  const currentStages = Array.isArray(run.selected_stages)
    ? (run.selected_stages as string[])
    : [...EXECUTABLE_PIPELINE_STAGES];
  const updatedStages = currentStages.filter((s) => s !== stage);

  await supabaseServer
    .from("pipeline_runs")
    .update({ selected_stages: updatedStages })
    .eq("id", runId);

  // Log the skip
  await logRunEvent(runId, "pipeline", "info", `Stage "${stage}" skipped by user`, {
    stage,
    cancelledJobs: (jobs ?? []).length,
  });

  return NextResponse.json({ ok: true });
}
