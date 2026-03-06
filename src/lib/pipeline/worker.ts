import { mastra } from "@/mastra";
import {
  dequeuePipelineJob,
  enqueuePipelineJob,
  enqueueStageJobIds,
  getPipelineQueueDepth,
  getStageQueueDepth,
} from "@/lib/pipeline/queue";
import { logRunEvent, updateRunState } from "@/lib/pipeline/run-state";
import { supabaseServer } from "@/lib/supabase/server";
import type { WorkflowStreamEvent } from "@mastra/core/workflows";
import { env } from "@/lib/config/env";
import { planChunkedStageJobs } from "@/lib/pipeline/chunk-planner";
import { createStageJobs } from "@/lib/pipeline/job-store";

const MAX_ATTEMPTS = 3;
const STALE_QUEUED_MINUTES = 45;
const STEP_TO_AGENT_TYPE: Record<string, "lead_gen" | "people_gen" | "enrichment" | "scoring" | "cold_email"> = {
  "lead-gen-step": "lead_gen",
  "people-gen-step": "people_gen",
  "enrichment-step": "enrichment",
  "scoring-step": "scoring",
  "email-step": "cold_email",
};

function getEventAgentType(event: WorkflowStreamEvent) {
  if ("payload" in event && event.payload && typeof event.payload === "object" && "id" in event.payload) {
    const stepId = String(event.payload.id ?? "");
    return STEP_TO_AGENT_TYPE[stepId] ?? "pipeline";
  }
  return "pipeline";
}

function workflowEventMessage(event: WorkflowStreamEvent) {
  switch (event.type) {
    case "workflow-start":
      return "Workflow stream started";
    case "workflow-step-start":
      return `Step started: ${event.payload.id}`;
    case "workflow-step-result":
      return `Step result: ${event.payload.id} (${event.payload.status})`;
    case "workflow-step-finish":
      return `Step finished: ${event.payload.id}`;
    case "workflow-step-progress":
      return `Step progress: ${event.payload.id} (${event.payload.completedCount}/${event.payload.totalCount})`;
    case "workflow-step-suspended":
      return `Step suspended: ${event.payload.id}`;
    case "workflow-step-waiting":
      return `Step waiting: ${event.payload.id}`;
    case "workflow-finish":
      return `Workflow stream finished (${event.payload.workflowStatus})`;
    case "workflow-canceled":
      return "Workflow stream canceled";
    case "workflow-paused":
      return "Workflow stream paused";
    default:
      return `Workflow event: ${event.type}`;
  }
}

function workflowEventLevel(event: WorkflowStreamEvent): "info" | "warn" | "error" | "success" {
  if (event.type === "workflow-finish") {
    return event.payload.workflowStatus === "success" ? "success" : "warn";
  }
  if (event.type === "workflow-step-result" && event.payload.status === "failed") {
    return "error";
  }
  if (event.type === "workflow-step-suspended" || event.type === "workflow-step-waiting") {
    return "warn";
  }
  return "info";
}

type WorkerResult =
  | { processed: false; queueDepth: number; reconciledStaleRuns?: number }
  | {
      processed: true;
      runId: string;
      queueDepth: number;
      status: "completed" | "failed" | "retrying" | "skipped" | "orchestrated";
      attempt: number;
    };

async function orchestrateChunkedRun(job: {
  runId: string;
  campaignId: string;
  runConfig: Record<string, unknown>;
  selectedStages: Array<"lead_generation" | "people_discovery" | "enrichment" | "scoring" | "email">;
}) {
  const { data: campaign } = await supabaseServer
    .from("campaigns")
    .select("leads_per_run,daily_send_limit")
    .eq("id", job.campaignId)
    .single();

  const planned = planChunkedStageJobs(
    {
      runId: job.runId,
      campaignId: job.campaignId,
      trigger: "manual",
      runMode: "custom",
      startStage: null,
      endStage: null,
      selectedStages: job.selectedStages,
      runConfig: job.runConfig,
      enqueuedAt: new Date().toISOString(),
      attempt: 1,
    },
    {
      leadsPerRun: campaign?.leads_per_run ?? null,
      dailySendLimit: campaign?.daily_send_limit ?? null,
    },
  );

  const stageRows = await createStageJobs(
    planned.map((item) => ({
      runId: job.runId,
      campaignId: job.campaignId,
      stage: item.stage,
      idempotencyKey: item.idempotencyKey,
      chunkIndex: item.chunkIndex,
      chunkSize: item.chunkSize,
      payload: item.payload,
    })),
  );

  const queuedStageJobIds = stageRows
    .filter((row) => row.status === "queued")
    .map((row) => String(row.id))
    .filter(Boolean);
  await enqueueStageJobIds(queuedStageJobIds);

  await logRunEvent(job.runId, "pipeline", "info", "Chunked stage jobs orchestrated", {
    plannedJobs: planned.length,
    queuedJobs: queuedStageJobIds.length,
    queueDepth: await getStageQueueDepth(),
    executionMode: env.PIPELINE_EXECUTION_MODE,
  });
}

async function reconcileStaleQueuedRuns(): Promise<number> {
  const cutoff = new Date(Date.now() - STALE_QUEUED_MINUTES * 60_000).toISOString();
  const { data: staleRuns } = await supabaseServer
    .from("pipeline_runs")
    .select("id")
    .eq("status", "running")
    .eq("current_stage", "queued")
    .lt("started_at", cutoff);

  const staleRunIds = (staleRuns ?? []).map((run) => run.id).filter((id): id is string => Boolean(id));
  if (!staleRunIds.length) return 0;

  await supabaseServer
    .from("pipeline_runs")
    .update({
      status: "failed",
      current_stage: "failed",
      error: `Queued run exceeded ${STALE_QUEUED_MINUTES} minutes without dequeue`,
      finished_at: new Date().toISOString(),
    })
    .in("id", staleRunIds);

  await Promise.all(
    staleRunIds.map((runId) =>
      logRunEvent(runId, "worker", "warn", "Reconciled stale queued run", {
        staleThresholdMinutes: STALE_QUEUED_MINUTES,
      }),
    ),
  );

  return staleRunIds.length;
}

export async function processNextPipelineJob(): Promise<WorkerResult> {
  const job = await dequeuePipelineJob();
  const queueDepth = await getPipelineQueueDepth();
  if (!job) {
    const reconciledStaleRuns = await reconcileStaleQueuedRuns();
    return { processed: false, queueDepth, reconciledStaleRuns };
  }

  const attempt = job.attempt;
  const entryStage = job.selectedStages[0] ?? "lead_generation";
  await logRunEvent(job.runId, "worker", "info", "Dequeued pipeline job", {
    campaignId: job.campaignId,
    attempt,
    queueDepth,
    runMode: job.runMode,
    selectedStages: job.selectedStages,
    runConfig: job.runConfig,
  });

  const { data: run } = await supabaseServer
    .from("pipeline_runs")
    .select("id,status")
    .eq("id", job.runId)
    .single();

  if (!run || ["completed", "failed", "cancelled"].includes(run.status)) {
    await logRunEvent(job.runId, "worker", "warn", "Skipping terminal or missing run", {
      runStatus: run?.status ?? "missing",
      attempt,
    });
    return {
      processed: true,
      runId: job.runId,
      queueDepth,
      status: "skipped",
      attempt,
    };
  }

  try {
    await updateRunState(job.runId, {
      status: "running",
      current_stage: entryStage,
      error: null,
    });

    if (env.PIPELINE_EXECUTION_MODE === "chunked") {
      await orchestrateChunkedRun({
        runId: job.runId,
        campaignId: job.campaignId,
        runConfig: job.runConfig as Record<string, unknown>,
        selectedStages: job.selectedStages,
      });
      return {
        processed: true,
        runId: job.runId,
        queueDepth,
        status: "orchestrated",
        attempt,
      };
    }

    const workflow = mastra.getWorkflow("salesPipelineWorkflow");
    const workflowRun = await workflow.createRun();
    const stream = workflowRun.stream({
      inputData: {
        campaignId: job.campaignId,
        runId: job.runId,
        selectedStages: job.selectedStages,
        runConfig: job.runConfig,
      },
    });
    const eventStream = (stream as { fullStream?: AsyncIterable<WorkflowStreamEvent> }).fullStream ?? stream;
    for await (const event of eventStream) {
      await logRunEvent(job.runId, getEventAgentType(event), workflowEventLevel(event), workflowEventMessage(event), {
        eventType: event.type,
        eventPayload: event.payload,
      });
    }
    const result = await stream.result;

    const ok = result.status === "success";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const steps = (result as any).steps ?? {};
    const emailStepOutput = steps["email-step"]?.output as
      | {
          leadsGenerated: number;
          leadsEnriched: number;
          leadsScored: number;
          emailsSent: number;
        }
      | undefined;

    if (!ok || !emailStepOutput) {
      throw new Error("Pipeline workflow returned an unsuccessful result");
    }

    await updateRunState(job.runId, {
      status: "completed",
      current_stage: "completed",
      leads_generated: emailStepOutput.leadsGenerated,
      leads_enriched: emailStepOutput.leadsEnriched,
      leads_scored: emailStepOutput.leadsScored,
      emails_sent: emailStepOutput.emailsSent,
      finished_at: new Date().toISOString(),
      error: null,
    });

    await logRunEvent(job.runId, "pipeline", "success", "Pipeline run completed", {
      campaignId: job.campaignId,
      attempt,
      runMode: job.runMode,
      selectedStages: job.selectedStages,
      runConfig: job.runConfig,
      ...emailStepOutput,
    });

    return {
      processed: true,
      runId: job.runId,
      queueDepth,
      status: "completed",
      attempt,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (attempt < MAX_ATTEMPTS) {
      await enqueuePipelineJob({
        ...job,
        attempt: attempt + 1,
        enqueuedAt: new Date().toISOString(),
      });
      await logRunEvent(job.runId, "worker", "warn", "Pipeline job failed and requeued", {
        campaignId: job.campaignId,
        attempt,
        nextAttempt: attempt + 1,
        error: errorMessage,
      });

      return {
        processed: true,
        runId: job.runId,
        queueDepth: await getPipelineQueueDepth(),
        status: "retrying",
        attempt,
      };
    }

    await updateRunState(job.runId, {
      status: "failed",
      current_stage: "failed",
      error: errorMessage,
      finished_at: new Date().toISOString(),
    });
    await logRunEvent(job.runId, "pipeline", "error", "Pipeline run failed", {
      campaignId: job.campaignId,
      attempt,
      error: errorMessage,
    });

    return {
      processed: true,
      runId: job.runId,
      queueDepth,
      status: "failed",
      attempt,
    };
  }
}
