import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/lib/config/env";
import { enqueuePipelineJob, getPipelineQueueDepth, getSendQueueDepth, getStageQueueDepth } from "@/lib/pipeline/queue";
import { EXECUTABLE_PIPELINE_STAGES, expandStageRange } from "@/lib/pipeline/stages";
import { normalizeRunConfig, pipelineRunConfigSchema } from "@/lib/pipeline/run-config";
import { logRunEvent, updateRunState } from "@/lib/pipeline/run-state";
import { supabaseServer } from "@/lib/supabase/server";
import { getQueueAndWorkerMetrics } from "@/lib/pipeline/metrics";
import { getDynamicWorkerCapacity } from "@/lib/pipeline/capacity-policy";

const triggerFromLeadsSchema = z.object({
  leadIds: z.array(z.string().uuid()).min(1).max(500),
  startStage: z.enum(EXECUTABLE_PIPELINE_STAGES),
  endStage: z.enum(EXECUTABLE_PIPELINE_STAGES),
  runConfig: pipelineRunConfigSchema.optional(),
});

export async function POST(request: NextRequest) {
  let runId: string | null = null;
  try {
    const body = await request.json();
    const parsed = triggerFromLeadsSchema.parse(body);
    const selectedStages = expandStageRange(parsed.startStage, parsed.endStage);
    const runConfig = normalizeRunConfig(
      { ...parsed.runConfig, leadIds: parsed.leadIds },
      selectedStages,
    );

    const { data: leads, error: leadsError } = await supabaseServer
      .from("leads")
      .select("id,campaign_id")
      .in("id", parsed.leadIds);

    if (leadsError || !leads?.length) {
      return NextResponse.json(
        { ok: false, error: "Leads not found or inaccessible." },
        { status: 404 },
      );
    }

    const campaignIds = new Set((leads ?? []).map((l) => l.campaign_id).filter(Boolean));
    if (campaignIds.size > 1) {
      return NextResponse.json(
        { ok: false, error: "All selected leads must belong to the same campaign." },
        { status: 400 },
      );
    }

    const campaignId = leads[0].campaign_id;
    if (!campaignId) {
      return NextResponse.json(
        { ok: false, error: "Leads have no campaign." },
        { status: 400 },
      );
    }

    const { data: run, error: runError } = await supabaseServer
      .from("pipeline_runs")
      .insert({
        campaign_id: campaignId,
        trigger: "manual",
        status: "running",
        current_stage: "queued",
        run_mode: "custom",
        start_stage: parsed.startStage,
        end_stage: parsed.endStage,
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
      runMode: "custom",
      startStage: parsed.startStage,
      endStage: parsed.endStage,
      selectedStages,
      runConfig,
      enqueuedAt: new Date().toISOString(),
      attempt: 1,
    });
    const queueDepth = await getPipelineQueueDepth();

    await logRunEvent(run.id, "pipeline", "info", "Pipeline run queued (from selected leads)", {
      campaignId,
      leadCount: parsed.leadIds.length,
      startStage: parsed.startStage,
      endStage: parsed.endStage,
      selectedStages,
      queueDepth,
    });

    void (async () => {
      try {
        if (env.WORKER_EXECUTION_OWNER === "service") {
          await logRunEvent(run.id, "worker", "info", "Skipping app-owned worker kicks (service owner enabled)", {
            owner: env.WORKER_EXECUTION_OWNER,
            queueDepth,
          });
          return;
        }
        const metrics = await getQueueAndWorkerMetrics();
        const targets = getDynamicWorkerCapacity(metrics);
        const workerKickUrl = `${env.NEXT_PUBLIC_APP_URL}/api/cron/pipeline-worker?maxJobs=${targets.pipeline.maxJobs}&concurrency=${targets.pipeline.concurrency}`;
        const stageWorkerKickUrl = `${env.NEXT_PUBLIC_APP_URL}/api/cron/stage-worker?maxJobs=${targets.stage.maxJobs}&concurrency=${targets.stage.concurrency}`;
        const sendWorkerKickUrl = `${env.NEXT_PUBLIC_APP_URL}/api/cron/send-worker?maxJobs=${targets.send.maxJobs}&concurrency=${targets.send.concurrency}`;
        await logRunEvent(run.id, "worker", "info", "Attempting best-effort worker kick", {
          workerKickUrl,
          stageWorkerKickUrl,
          sendWorkerKickUrl,
          targets,
          metrics,
          hasCronSecret: Boolean(env.CRON_SECRET),
        });
        const kick = async (url: string) => {
          const response = await fetch(url, {
            method: "POST",
            headers: { "x-cron-secret": env.CRON_SECRET },
          });
          let payload: unknown = null;
          try {
            payload = await response.json();
          } catch {
            payload = null;
          }
          return {
            url,
            status: response.status,
            statusText: response.statusText,
            ok: response.ok,
            payload,
          };
        };
        const pipelineKick = await kick(workerKickUrl);
        const stageKick = pipelineKick.ok
          ? await kick(stageWorkerKickUrl)
          : {
              url: stageWorkerKickUrl,
              status: 424,
              statusText: "Skipped: pipeline kick failed",
              ok: false,
              payload: { ok: false, skipped: true, reason: "pipeline_kick_failed" },
            };
        const sendKick = await kick(sendWorkerKickUrl);
        const allOk = pipelineKick.ok && stageKick.ok && sendKick.ok;
        await logRunEvent(
          run.id,
          "worker",
          allOk ? "info" : "warn",
          allOk ? "Best-effort worker kicks completed" : "One or more best-effort worker kicks returned non-OK",
          {
            kicks: [pipelineKick, stageKick, sendKick],
            queueDepth,
            stageQueueDepth: await getStageQueueDepth(),
            sendQueueDepth: await getSendQueueDepth(),
          },
        );
      } catch (kickError) {
        await logRunEvent(run.id, "worker", "warn", "Best-effort worker kick request failed", {
          error: kickError instanceof Error ? kickError.message : String(kickError),
        });
      }
    })();

    return NextResponse.json({
      ok: true,
      queued: true,
      runId: run.id,
      queueDepth,
      leadCount: parsed.leadIds.length,
      startStage: parsed.startStage,
      endStage: parsed.endStage,
      selectedStages,
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
      await logRunEvent(runId, "pipeline", "error", "Pipeline enqueue failed (from leads)", {
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
