import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/config/env";
import { finishCronRun, startCronRun } from "@/lib/cron/run-logs";
import { enqueuePipelineJob } from "@/lib/pipeline/queue";
import { logRunEvent } from "@/lib/pipeline/run-state";
import { EXECUTABLE_PIPELINE_STAGES } from "@/lib/pipeline/stages";
import { supabaseServer } from "@/lib/supabase/server";

function assertCronSecret(request: NextRequest) {
  const secret = request.headers.get("x-cron-secret");
  if (!secret || secret !== env.CRON_SECRET) {
    throw new Error("Unauthorized cron request");
  }
}

export async function POST(request: NextRequest) {
  let cronRunId: string | null = null;
  let startedAt = new Date().toISOString();
  try {
    assertCronSecret(request);
    const started = await startCronRun("lead-gen");
    cronRunId = started.id;
    startedAt = started.startedAt;
    const { data: campaigns } = await supabaseServer.from("campaigns").select("id").eq("status", "active");
    let queued = 0;

    for (const campaign of campaigns ?? []) {
      const { data: run } = await supabaseServer
        .from("pipeline_runs")
        .insert({
          campaign_id: campaign.id,
          trigger: "cron",
          status: "running",
          current_stage: "queued",
          run_mode: "full",
          selected_stages: [...EXECUTABLE_PIPELINE_STAGES],
          run_config: {},
        })
        .select("id")
        .single();

      if (!run) continue;
      await enqueuePipelineJob({
        runId: run.id,
        campaignId: campaign.id,
        trigger: "cron",
        runMode: "full",
        startStage: null,
        endStage: null,
        selectedStages: [...EXECUTABLE_PIPELINE_STAGES],
        runConfig: {},
        enqueuedAt: new Date().toISOString(),
        attempt: 1,
      });
      await logRunEvent(run.id, "pipeline", "info", "Pipeline run queued by cron", {
        campaignId: campaign.id,
      });
      queued += 1;
    }

    await finishCronRun(cronRunId, startedAt, "success", {
      activeCampaigns: campaigns?.length ?? 0,
      queued,
    });
    return NextResponse.json({ ok: true, queued });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Cron lead-gen failed";
    await finishCronRun(cronRunId, startedAt, "failed", {}, message);
    return NextResponse.json(
      { ok: false, error: message },
      { status: 401 },
    );
  }
}
