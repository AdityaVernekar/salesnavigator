import "dotenv/config";
import { env } from "../src/lib/config/env";
import { getDynamicWorkerCapacity } from "../src/lib/pipeline/capacity-policy";
import { getQueueAndWorkerMetrics } from "../src/lib/pipeline/metrics";
import {
  runBurstWithCronLog,
  runPipelineWorkerBurst,
  runSendWorkerBurst,
  runStageWorkerBurst,
} from "../src/lib/pipeline/worker-runtime";

type LoopContext = {
  cycle: number;
  owner: string;
};

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

async function runPipelineLoop(ctx: LoopContext) {
  const metrics = await getQueueAndWorkerMetrics();
  const targets = getDynamicWorkerCapacity(metrics);
  return runBurstWithCronLog(
    "pipeline-worker-service",
    {
      cycle: ctx.cycle,
      owner: ctx.owner,
      target: targets.pipeline,
      degraded: targets.degraded,
    },
    () =>
      runPipelineWorkerBurst({
        maxJobs: targets.pipeline.maxJobs,
        concurrency: targets.pipeline.concurrency,
      }),
  );
}

async function runStageLoop(ctx: LoopContext) {
  const metrics = await getQueueAndWorkerMetrics();
  const targets = getDynamicWorkerCapacity(metrics);
  return runBurstWithCronLog(
    "stage-worker-service",
    {
      cycle: ctx.cycle,
      owner: ctx.owner,
      target: targets.stage,
      degraded: targets.degraded,
    },
    () =>
      runStageWorkerBurst({
        maxJobs: targets.stage.maxJobs,
        concurrency: targets.stage.concurrency,
      }),
  );
}

async function runSendLoop(ctx: LoopContext) {
  const metrics = await getQueueAndWorkerMetrics();
  const targets = getDynamicWorkerCapacity(metrics);
  return runBurstWithCronLog(
    "send-worker-service",
    {
      cycle: ctx.cycle,
      owner: ctx.owner,
      target: targets.send,
      degraded: targets.degraded,
    },
    () =>
      runSendWorkerBurst({
        maxJobs: targets.send.maxJobs,
        concurrency: targets.send.concurrency,
      }),
  );
}

async function main() {
  const singleCycle = process.argv.includes("--single-cycle");
  const owner = env.WORKER_EXECUTION_OWNER;
  if (owner !== "service") {
    console.warn(
      `[worker-service] WORKER_EXECUTION_OWNER=${owner}. Service will run, but trigger kicks may still be app-owned.`,
    );
  }

  const pollMs = parseEnvInt(env.WORKER_SERVICE_POLL_MS, 3000, 500, 60_000);
  const heartbeatMs = parseEnvInt(env.WORKER_SERVICE_HEARTBEAT_MS, 30_000, 5_000, 300_000);

  let stopping = false;
  let cycle = 0;
  let lastHeartbeat = Date.now();

  const stop = (signal: string) => {
    if (stopping) return;
    stopping = true;
    console.info(`[worker-service] Received ${signal}. Draining before exit...`);
  };

  process.on("SIGINT", () => stop("SIGINT"));
  process.on("SIGTERM", () => stop("SIGTERM"));

  console.info(`[worker-service] Starting loops (poll=${pollMs}ms, heartbeat=${heartbeatMs}ms)`);

  while (!stopping) {
    cycle += 1;
    const ctx: LoopContext = { cycle, owner };
    try {
      await runPipelineLoop(ctx);
    } catch (error) {
      console.error("[worker-service] pipeline loop failed", error);
    }

    try {
      await runStageLoop(ctx);
    } catch (error) {
      console.error("[worker-service] stage loop failed", error);
    }

    try {
      await runSendLoop(ctx);
    } catch (error) {
      console.error("[worker-service] send loop failed", error);
    }

    if (Date.now() - lastHeartbeat >= heartbeatMs) {
      const metrics = await getQueueAndWorkerMetrics();
      console.info("[worker-service] heartbeat", {
        cycle,
        owner,
        pipelineQueueDepth: metrics.pipelineQueueDepth,
        stageQueueDepth: metrics.stageQueueDepth,
        sendQueueDepth: metrics.sendQueueDepth,
        stageProcessing: metrics.stageProcessing,
        sendProcessing: metrics.sendProcessing,
        stuckStageJobs: metrics.stuckStageJobs,
        stuckSendJobs: metrics.stuckSendJobs,
      });
      lastHeartbeat = Date.now();
    }

    if (singleCycle) {
      stopping = true;
      break;
    }

    await sleep(pollMs);
  }

  console.info("[worker-service] Shutdown complete.");
}

void main().catch((error) => {
  console.error("[worker-service] Fatal startup failure", error);
  process.exit(1);
});

