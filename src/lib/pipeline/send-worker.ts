import { mastra } from "@/mastra";
import { env } from "@/lib/config/env";
import { bumpSendJobAttempt, claimSendJob, finishSendJob } from "@/lib/pipeline/job-store";
import { dequeueSendJobId, enqueueSendJobId, getSendQueueDepth } from "@/lib/pipeline/queue";
import { logRunEvent } from "@/lib/pipeline/run-state";
import { finalizeRunIfDone } from "@/lib/pipeline/run-finalizer";
import type { WorkflowStreamEvent } from "@mastra/core/workflows";

const RETRY_DELAY_SECONDS = 20;

type SendWorkerResult =
  | { processed: false; queueDepth: number }
  | {
      processed: true;
      sendJobId: string;
      runId: string;
      queueDepth: number;
      status: "completed" | "failed" | "retrying" | "skipped";
      attempt: number;
    };

export async function processNextSendJob(): Promise<SendWorkerResult> {
  const sendJobId = await dequeueSendJobId();
  const queueDepth = await getSendQueueDepth();
  if (!sendJobId) return { processed: false, queueDepth };

  const claimed = await claimSendJob(sendJobId, env.SEND_WORKER_ID, 180);
  if (!claimed) {
    return {
      processed: true,
      sendJobId,
      runId: "unknown",
      queueDepth,
      status: "skipped",
      attempt: 0,
    };
  }

  const attempt = Number(claimed.attempt ?? 0) + 1;
  const maxAttempts = Number(claimed.max_attempts ?? 5);
  const runId = String(claimed.run_id);
  const payload = (claimed.payload ?? {}) as Record<string, unknown>;
  const runConfig = (payload.runConfig ?? {}) as Record<string, unknown>;

  try {
    await logRunEvent(runId, "worker", "info", "Send job claimed", {
      sendJobId,
      attempt,
      queueDepth,
      payload,
    });

    const workflow = mastra.getWorkflow("salesPipelineWorkflow");
    const workflowRun = await workflow.createRun();
    const stream = workflowRun.stream({
      inputData: {
        campaignId: String(claimed.campaign_id),
        runId,
        selectedStages: ["email"],
        runConfig,
      },
    });

    const eventStream = (stream as { fullStream?: AsyncIterable<WorkflowStreamEvent> }).fullStream ?? stream;
    for await (const event of eventStream) {
      await logRunEvent(runId, "cold_email", "info", `Send worker event: ${event.type}`, {
        sendJobId,
        eventType: event.type,
      });
    }
    const result = await stream.result;
    if (result.status !== "success") {
      throw new Error("Send workflow execution failed");
    }

    await finishSendJob(sendJobId, "completed");
    await logRunEvent(runId, "worker", "success", "Send job completed", {
      sendJobId,
      attempt,
    });
    await finalizeRunIfDone(runId);

    return {
      processed: true,
      sendJobId,
      runId,
      queueDepth,
      status: "completed",
      attempt,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (attempt < maxAttempts) {
      await bumpSendJobAttempt(sendJobId, attempt, RETRY_DELAY_SECONDS, errorMessage);
      await enqueueSendJobId(sendJobId);
      await logRunEvent(runId, "worker", "warn", "Send job failed and was requeued", {
        sendJobId,
        attempt,
        maxAttempts,
        error: errorMessage,
      });
      return {
        processed: true,
        sendJobId,
        runId,
        queueDepth,
        status: "retrying",
        attempt,
      };
    }

    await finishSendJob(sendJobId, "failed", errorMessage);
    await logRunEvent(runId, "worker", "error", "Send job failed permanently", {
      sendJobId,
      attempt,
      error: errorMessage,
    });
    await finalizeRunIfDone(runId);
    return {
      processed: true,
      sendJobId,
      runId,
      queueDepth,
      status: "failed",
      attempt,
    };
  }
}
