import { mastra } from "@/mastra";
import { env } from "@/lib/config/env";
import { dequeueStageJobId, enqueueSendJobId, enqueueStageJobId, getStageQueueDepth } from "@/lib/pipeline/queue";
import {
  bumpStageJobAttempt,
  claimStageJob,
  claimNextQueuedStageJob,
  createSendJobs,
  finishStageJob,
  getStageDependencyState,
  requeueStageJob,
} from "@/lib/pipeline/job-store";
import { logRunEvent, updateRunState } from "@/lib/pipeline/run-state";
import { finalizeRunIfDone } from "@/lib/pipeline/run-finalizer";
import type { ExecutablePipelineStage } from "@/lib/pipeline/stages";
import type { WorkflowStreamEvent } from "@mastra/core/workflows";

const RETRY_DELAY_SECONDS = 20;

type StageWorkerResult =
  | { processed: false; queueDepth: number }
  | {
      processed: true;
      stageJobId: string;
      runId: string;
      queueDepth: number;
      status: "completed" | "failed" | "retrying" | "skipped";
      attempt: number;
      claimSource: "redis" | "db_fallback";
    };

function getStageWorkflowName(stage: ExecutablePipelineStage) {
  if (stage === "lead_generation") return "salesPipelineLeadGenerationWorkflow";
  if (stage === "people_discovery") return "salesPipelinePeopleDiscoveryWorkflow";
  if (stage === "enrichment") return "salesPipelineEnrichmentWorkflow";
  if (stage === "scoring") return "salesPipelineScoringWorkflow";
  return null;
}

export async function processNextStageJob(): Promise<StageWorkerResult> {
  const dequeuedStageJobId = await dequeueStageJobId();
  const queueDepth = await getStageQueueDepth();
  let claimSource: "redis" | "db_fallback" = "redis";
  let claimed = dequeuedStageJobId
    ? await claimStageJob(dequeuedStageJobId, env.STAGE_WORKER_ID, 150)
    : null;

  if (!claimed) {
    claimed = await claimNextQueuedStageJob(env.STAGE_WORKER_ID, 150);
    claimSource = "db_fallback";
  }
  if (!claimed) return { processed: false, queueDepth };

  const stageJobId = String(claimed.id);
  if (claimSource === "db_fallback") {
    await logRunEvent(String(claimed.run_id), "worker", "info", "Stage job claimed via DB fallback", {
      stageJobId,
      queueDepth,
      dequeuedStageJobId,
    });
  }

  const attempt = Number(claimed.attempt ?? 0) + 1;
  const maxAttempts = Number(claimed.max_attempts ?? 5);
  const runId = String(claimed.run_id);
  const stage = String(claimed.stage) as ExecutablePipelineStage;
  const payload = (claimed.payload ?? {}) as Record<string, unknown>;

  const dependencyState = await getStageDependencyState(runId, stage);
  if (dependencyState.hasFailedDependencies) {
    await finishStageJob(stageJobId, "cancelled", "Skipped due to failed upstream stage dependency");
    await logRunEvent(runId, "worker", "warn", "Stage job cancelled due to failed dependency", {
      stageJobId,
      stage,
      priorStages: dependencyState.priorStages,
      failedCount: dependencyState.failedCount,
    });
    await finalizeRunIfDone(runId);
    return {
      processed: true,
      stageJobId,
      runId,
      queueDepth,
      status: "skipped",
      attempt,
      claimSource,
    };
  }
  if (dependencyState.hasPendingDependencies) {
    await requeueStageJob(stageJobId, 8, "Waiting for upstream stage dependencies");
    await enqueueStageJobId(stageJobId);
    await logRunEvent(runId, "worker", "info", "Deferred stage job until dependencies complete", {
      stageJobId,
      stage,
      priorStages: dependencyState.priorStages,
      pendingCount: dependencyState.pendingCount,
    });
    return {
      processed: true,
      stageJobId,
      runId,
      queueDepth,
      status: "retrying",
      attempt,
      claimSource,
    };
  }

  try {
    const workflowName = getStageWorkflowName(stage);
    if (!workflowName) {
      throw new Error(`No stage workflow is configured for stage (${stage})`);
    }
    await logRunEvent(runId, "worker", "info", "Stage job claimed", {
      stageJobId,
      stage,
      attempt,
      payload,
      queueDepth,
      claimSource,
      workflowName,
    });

    if (stage === "email") {
      const sendRows = await createSendJobs([
        {
          runId,
          campaignId: String(claimed.campaign_id),
          stageJobId,
          idempotencyKey: `${runId}:send:${claimed.chunk_index ?? 0}`,
          payload: {
            stage: "email",
            selectedStages: ["email"],
            runConfig: (payload.runConfig ?? {}) as Record<string, unknown>,
            chunkIndex: Number(claimed.chunk_index ?? 0),
            chunkSize: Number(claimed.chunk_size ?? 0),
          },
        },
      ]);

      const sendJobId = sendRows[0]?.id ? String(sendRows[0].id) : null;
      if (sendJobId) await enqueueSendJobId(sendJobId);
      await finishStageJob(stageJobId, "completed");
      await logRunEvent(runId, "worker", "info", "Stage job completed by enqueueing send job", {
        stageJobId,
        sendJobId,
      });
      await finalizeRunIfDone(runId);
      return {
        processed: true,
        stageJobId,
        runId,
        queueDepth,
        status: "completed",
        attempt,
        claimSource,
      };
    }

    await updateRunState(runId, {
      status: "running",
      current_stage: stage as "lead_generation" | "people_discovery" | "enrichment" | "scoring" | "email",
      error: null,
    });

    const workflow = mastra.getWorkflow(workflowName);
    const workflowRun = await workflow.createRun();
    const stream = workflowRun.stream({
      inputData: {
        campaignId: String(claimed.campaign_id),
        runId,
        selectedStages: [stage],
        runConfig: (payload.runConfig ?? {}) as Record<string, unknown>,
      },
    });

    const eventStream = (stream as { fullStream?: AsyncIterable<WorkflowStreamEvent> }).fullStream ?? stream;
    for await (const event of eventStream) {
      await logRunEvent(runId, "pipeline", "info", `Stage worker event: ${event.type}`, {
        stageJobId,
        stage,
        eventType: event.type,
      });
    }
    const result = await stream.result;
    if (result.status !== "success") {
      throw new Error(`Stage job workflow failed (${stage})`);
    }

    await finishStageJob(stageJobId, "completed");
    await logRunEvent(runId, "worker", "success", "Stage job completed", {
      stageJobId,
      stage,
      attempt,
    });
    await finalizeRunIfDone(runId);
    return {
      processed: true,
      stageJobId,
      runId,
      queueDepth,
      status: "completed",
      attempt,
        claimSource,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (attempt < maxAttempts) {
      await bumpStageJobAttempt(stageJobId, attempt, RETRY_DELAY_SECONDS, errorMessage);
      await enqueueStageJobId(stageJobId);
      await logRunEvent(runId, "worker", "warn", "Stage job failed and was requeued", {
        stageJobId,
        stage,
        attempt,
        maxAttempts,
        error: errorMessage,
      });
      return {
        processed: true,
        stageJobId,
        runId,
        queueDepth,
        status: "retrying",
        attempt,
        claimSource,
      };
    }

    await finishStageJob(stageJobId, "failed", errorMessage);
    await logRunEvent(runId, "worker", "error", "Stage job failed permanently", {
      stageJobId,
      stage,
      attempt,
      error: errorMessage,
    });
    await finalizeRunIfDone(runId);
    return {
      processed: true,
      stageJobId,
      runId,
      queueDepth,
      status: "failed",
      attempt,
      claimSource,
    };
  }
}
