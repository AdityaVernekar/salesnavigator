import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/lib/config/env";
import { enqueuePipelineJob, getPipelineQueueDepth } from "@/lib/pipeline/queue";
import { EXECUTABLE_PIPELINE_STAGES, expandStageRange } from "@/lib/pipeline/stages";
import { normalizeRunConfig, pipelineRunConfigSchema } from "@/lib/pipeline/run-config";
import { logRunEvent, updateRunState } from "@/lib/pipeline/run-state";
import { supabaseServer } from "@/lib/supabase/server";

const triggerSchema = z.object({
  campaignId: z.string().uuid(),
  runMode: z.enum(["full", "custom"]).default("full"),
  startStage: z.enum(EXECUTABLE_PIPELINE_STAGES).optional(),
  endStage: z.enum(EXECUTABLE_PIPELINE_STAGES).optional(),
  runConfig: pipelineRunConfigSchema.optional(),
});

export async function POST(request: NextRequest) {
  let runId: string | null = null;
  try {
    const body = await request.json();
    const parsed = triggerSchema.parse(body);
    const runMode = parsed.runMode;
    const startStage = runMode === "custom" ? (parsed.startStage ?? "lead_generation") : null;
    const endStage = runMode === "custom" ? (parsed.endStage ?? "email") : null;
    const selectedStages =
      runMode === "custom" && startStage && endStage
        ? expandStageRange(startStage, endStage)
        : [...EXECUTABLE_PIPELINE_STAGES];
    const runConfig = normalizeRunConfig(parsed.runConfig, selectedStages);
    const campaignId = parsed.campaignId;

    const { data: run, error: runError } = await supabaseServer
      .from("pipeline_runs")
      .insert({
        campaign_id: campaignId,
        trigger: "manual",
        status: "running",
        current_stage: "queued",
        run_mode: runMode,
        start_stage: startStage,
        end_stage: endStage,
        selected_stages: selectedStages,
        run_config: runConfig,
      })
      .select("id")
      .single();

    if (runError || !run) {
      throw new Error(runError?.message ?? "Failed to create pipeline run");
    }
    runId = run.id;

    await enqueuePipelineJob({
      runId: run.id,
      campaignId,
      trigger: "manual",
      runMode,
      startStage,
      endStage,
      selectedStages,
      runConfig,
      enqueuedAt: new Date().toISOString(),
      attempt: 1,
    });
    const queueDepth = await getPipelineQueueDepth();

    await logRunEvent(run.id, "pipeline", "info", "Pipeline run queued", {
      campaignId,
      queueDepth,
      runMode,
      startStage,
      endStage,
      selectedStages,
      runConfig,
    });

    // Best-effort kick for local/dev and low-throughput setups.
    void (async () => {
      const workerKickUrl = `${env.NEXT_PUBLIC_APP_URL}/api/cron/pipeline-worker?maxJobs=3&concurrency=2`;
      try {
        await logRunEvent(run.id, "worker", "info", "Attempting best-effort worker kick", {
          workerKickUrl,
          hasCronSecret: Boolean(env.CRON_SECRET),
        });
        const response = await fetch(workerKickUrl, {
          method: "POST",
          headers: {
            "x-cron-secret": env.CRON_SECRET,
          },
        });
        let payload: unknown = null;
        try {
          payload = await response.json();
        } catch {
          payload = null;
        }

        await logRunEvent(
          run.id,
          "worker",
          response.ok ? "info" : "warn",
          response.ok ? "Best-effort worker kick completed" : "Best-effort worker kick returned non-OK response",
          {
            workerKickUrl,
            status: response.status,
            statusText: response.statusText,
            payload,
          },
        );
      } catch (kickError) {
        await logRunEvent(run.id, "worker", "warn", "Best-effort worker kick request failed", {
          workerKickUrl,
          error: kickError instanceof Error ? kickError.message : String(kickError),
        });
      }
    })();

    return NextResponse.json({
      ok: true,
      queued: true,
      runId: run.id,
      queueDepth,
      runMode,
      startStage,
      endStage,
      selectedStages,
      runConfig,
    });
  } catch (error) {
    if (runId) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await updateRunState(runId, {
        status: "failed",
        current_stage: "failed",
        error: errorMessage,
        finished_at: new Date().toISOString(),
      });
      await logRunEvent(runId, "pipeline", "error", "Pipeline enqueue failed", {
        error: errorMessage,
      });
    }
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 400 },
    );
  }
}
