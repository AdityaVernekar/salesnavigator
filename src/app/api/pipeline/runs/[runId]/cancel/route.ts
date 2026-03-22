import { NextRequest, NextResponse } from "next/server";
import { requireRouteContext } from "@/lib/auth/route-context";
import { supabaseServer } from "@/lib/supabase/server";
import { logRunEvent, updateRunState } from "@/lib/pipeline/run-state";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ runId: string }> },
) {
  const contextResult = await requireRouteContext();
  if (!contextResult.ok) return contextResult.response;
  const { companyId } = contextResult.context;

  const { runId } = await params;

  const { data: run } = await supabaseServer
    .from("pipeline_runs")
    .select("id,status")
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

  // Cancel all pending stage jobs
  await supabaseServer
    .from("stage_jobs")
    .update({
      status: "cancelled",
      finished_at: new Date().toISOString(),
      last_error: "Run cancelled by user",
    })
    .eq("run_id", runId)
    .in("status", ["queued", "processing"]);

  // Cancel all pending send jobs
  await supabaseServer
    .from("send_jobs")
    .update({
      status: "cancelled",
      finished_at: new Date().toISOString(),
      last_error: "Run cancelled by user",
    })
    .eq("run_id", runId)
    .in("status", ["queued", "processing"]);

  // Mark the run as cancelled
  await updateRunState(runId, {
    status: "cancelled",
    finished_at: new Date().toISOString(),
  });

  await logRunEvent(runId, "pipeline", "info", "Run cancelled by user");

  return NextResponse.json({ ok: true });
}
