import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { env } from "@/lib/config/env";
import { getDynamicWorkerCapacity } from "@/lib/pipeline/capacity-policy";
import { getQueueAndWorkerMetrics } from "@/lib/pipeline/metrics";
import {
  runBurstWithCronLog,
  runPipelineWorkerBurst,
  runSendWorkerBurst,
  runStageWorkerBurst,
} from "@/lib/pipeline/worker-runtime";

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function parseEnvInt(value: string, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return clamp(Math.floor(parsed), min, max);
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

@Injectable()
export class WorkerLoopService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WorkerLoopService.name);
  private stopRequested = false;
  private loopPromise: Promise<void> | null = null;

  private readonly owner = env.WORKER_EXECUTION_OWNER;
  private readonly pollMs = parseEnvInt(env.WORKER_SERVICE_POLL_MS, 3000, 500, 60_000);
  private readonly heartbeatMs = parseEnvInt(env.WORKER_SERVICE_HEARTBEAT_MS, 30_000, 5_000, 300_000);

  private cycle = 0;
  private lastHeartbeat = 0;

  onModuleInit() {
    if (this.owner !== "service") {
      this.logger.warn(
        `WORKER_EXECUTION_OWNER=${this.owner}. Service will run, but app trigger may still own kicks.`,
      );
    }
    this.logger.log(`Starting worker loops (poll=${this.pollMs}ms, heartbeat=${this.heartbeatMs}ms)`);
    this.lastHeartbeat = Date.now();
    this.loopPromise = this.runLoop();
  }

  async onModuleDestroy() {
    this.stopRequested = true;
    if (this.loopPromise) {
      await this.loopPromise;
    }
    this.logger.log("Worker loops stopped");
  }

  getStatus() {
    return {
      owner: this.owner,
      pollMs: this.pollMs,
      heartbeatMs: this.heartbeatMs,
      cycle: this.cycle,
      stopRequested: this.stopRequested,
    };
  }

  private async runLoop() {
    while (!this.stopRequested) {
      this.cycle += 1;
      await this.runPipelineCycle();
      await this.runStageCycle();
      await this.runSendCycle();
      await this.maybeHeartbeat();
      if (!this.stopRequested) {
        await sleep(this.pollMs);
      }
    }
  }

  private async runPipelineCycle() {
    try {
      const metrics = await getQueueAndWorkerMetrics();
      const targets = getDynamicWorkerCapacity(metrics);
      await runBurstWithCronLog(
        "pipeline-worker-service",
        {
          cycle: this.cycle,
          owner: this.owner,
          target: targets.pipeline,
          degraded: targets.degraded,
        },
        () =>
          runPipelineWorkerBurst({
            maxJobs: targets.pipeline.maxJobs,
            concurrency: targets.pipeline.concurrency,
          }),
      );
    } catch (error) {
      this.logger.error("Pipeline loop failed", error instanceof Error ? error.stack : String(error));
    }
  }

  private async runStageCycle() {
    try {
      const metrics = await getQueueAndWorkerMetrics();
      const targets = getDynamicWorkerCapacity(metrics);
      await runBurstWithCronLog(
        "stage-worker-service",
        {
          cycle: this.cycle,
          owner: this.owner,
          target: targets.stage,
          degraded: targets.degraded,
        },
        () =>
          runStageWorkerBurst({
            maxJobs: targets.stage.maxJobs,
            concurrency: targets.stage.concurrency,
          }),
      );
    } catch (error) {
      this.logger.error("Stage loop failed", error instanceof Error ? error.stack : String(error));
    }
  }

  private async runSendCycle() {
    try {
      const metrics = await getQueueAndWorkerMetrics();
      const targets = getDynamicWorkerCapacity(metrics);
      await runBurstWithCronLog(
        "send-worker-service",
        {
          cycle: this.cycle,
          owner: this.owner,
          target: targets.send,
          degraded: targets.degraded,
        },
        () =>
          runSendWorkerBurst({
            maxJobs: targets.send.maxJobs,
            concurrency: targets.send.concurrency,
          }),
      );
    } catch (error) {
      this.logger.error("Send loop failed", error instanceof Error ? error.stack : String(error));
    }
  }

  private async maybeHeartbeat() {
    if (Date.now() - this.lastHeartbeat < this.heartbeatMs) {
      return;
    }
    const metrics = await getQueueAndWorkerMetrics();
    this.logger.log(
      JSON.stringify({
        type: "heartbeat",
        cycle: this.cycle,
        owner: this.owner,
        pipelineQueueDepth: metrics.pipelineQueueDepth,
        stageQueueDepth: metrics.stageQueueDepth,
        sendQueueDepth: metrics.sendQueueDepth,
        stageProcessing: metrics.stageProcessing,
        sendProcessing: metrics.sendProcessing,
        stuckStageJobs: metrics.stuckStageJobs,
        stuckSendJobs: metrics.stuckSendJobs,
      }),
    );
    this.lastHeartbeat = Date.now();
  }
}

