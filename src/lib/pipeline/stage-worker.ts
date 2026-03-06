import { mastra } from "@/mastra";
import { env } from "@/lib/config/env";
import { dequeueStageJobId, enqueueSendJobId, enqueueStageJobId, getStageQueueDepth } from "@/lib/pipeline/queue";
import {
  bumpStageJobAttempt,
  claimStageJob,
  claimNextQueuedStageJob,
  createSendJobs,
  extendStageJobLease,
  finishStageJob,
  getStageDependencyState,
  recoverStuckStageJobs,
  requeueStageJob,
} from "@/lib/pipeline/job-store";
import { logRunEvent, updateRunState } from "@/lib/pipeline/run-state";
import { finalizeRunIfDone } from "@/lib/pipeline/run-finalizer";
import type { ExecutablePipelineStage } from "@/lib/pipeline/stages";
import type { WorkflowStreamEvent } from "@mastra/core/workflows";

const RETRY_DELAY_SECONDS = 20;

function parsePositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.floor(parsed);
}

const STAGE_JOB_LEASE_SECONDS = parsePositiveInt(env.STAGE_JOB_LEASE_SECONDS, 150);
const STAGE_JOB_HEARTBEAT_SECONDS = parsePositiveInt(env.STAGE_JOB_HEARTBEAT_SECONDS, 45);
const STAGE_JOB_TIMEOUT_SECONDS = parsePositiveInt(env.STAGE_JOB_TIMEOUT_SECONDS, 900);
const STAGE_STALE_RECOVERY_MINUTES = parsePositiveInt(env.STAGE_STALE_RECOVERY_MINUTES, 10);
const STAGE_STALE_RECOVERY_LIMIT = parsePositiveInt(env.STAGE_STALE_RECOVERY_LIMIT, 10);

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
}

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
  const staleRecovery = await recoverStuckStageJobs({
    limit: STAGE_STALE_RECOVERY_LIMIT,
    staleProcessingMinutes: STAGE_STALE_RECOVERY_MINUTES,
  });
  if (staleRecovery.recoveredIds.length) {
    await Promise.all(
      staleRecovery.recoveredRunIds.map((recoveredRunId) =>
        logRunEvent(recoveredRunId, "worker", "warn", "Auto-recovered stale stage jobs before claim", {
          recoveredCount: staleRecovery.recoveredIds.length,
          staleProcessingMinutes: STAGE_STALE_RECOVERY_MINUTES,
        }),
      ),
    );
  }

  const dequeuedStageJobId = await dequeueStageJobId();
  const queueDepth = await getStageQueueDepth();
  let claimSource: "redis" | "db_fallback" = "redis";
  let claimed = dequeuedStageJobId
    ? await claimStageJob(dequeuedStageJobId, env.STAGE_WORKER_ID, STAGE_JOB_LEASE_SECONDS)
    : null;

  if (!claimed) {
    claimed = await claimNextQueuedStageJob(env.STAGE_WORKER_ID, STAGE_JOB_LEASE_SECONDS);
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

    const runStageWorkflow = async () => {
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
    };

    const heartbeatSeconds = Math.min(
      STAGE_JOB_HEARTBEAT_SECONDS,
      Math.max(10, Math.floor(STAGE_JOB_LEASE_SECONDS / 2)),
    );
    let heartbeatRunning = false;
    const heartbeat = async () => {
      if (heartbeatRunning) return;
      heartbeatRunning = true;
      try {
        const renewed = await extendStageJobLease(stageJobId, STAGE_JOB_LEASE_SECONDS, env.STAGE_WORKER_ID);
        if (!renewed) {
          await logRunEvent(runId, "worker", "warn", "Stage job lease heartbeat missed", {
            stageJobId,
            stage,
            attempt,
          });
        }
      } catch (heartbeatError) {
        await logRunEvent(runId, "worker", "warn", "Stage job lease heartbeat failed", {
          stageJobId,
          stage,
          attempt,
          error: heartbeatError instanceof Error ? heartbeatError.message : String(heartbeatError),
        });
      } finally {
        heartbeatRunning = false;
      }
    };

    await heartbeat();
    const heartbeatTimer = setInterval(() => {
      void heartbeat();
    }, heartbeatSeconds * 1000);
    try {
      await withTimeout(
        runStageWorkflow(),
        STAGE_JOB_TIMEOUT_SECONDS * 1000,
        `Stage job timed out after ${STAGE_JOB_TIMEOUT_SECONDS}s (${stage})`,
      );
    } finally {
      clearInterval(heartbeatTimer);
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
