import { finishCronRun, startCronRun } from "@/lib/cron/run-logs";
import { getQueueAndWorkerMetrics } from "@/lib/pipeline/metrics";
import { processNextPipelineJob } from "@/lib/pipeline/worker";
import { processNextSendJob } from "@/lib/pipeline/send-worker";
import { processNextStageJob } from "@/lib/pipeline/stage-worker";

type BurstOptions = {
  maxJobs: number;
  concurrency: number;
};

type ProcessorResult = {
  processed: boolean;
};

async function runBurst<T extends ProcessorResult>(
  processor: () => Promise<T>,
  options: BurstOptions,
): Promise<T[]> {
  const results: T[] = [];
  const maxJobs = Math.max(1, options.maxJobs);
  const concurrency = Math.max(1, Math.min(options.concurrency, maxJobs));
  let shouldStop = false;
  let processedCount = 0;

  const workerLoop = async () => {
    while (!shouldStop && processedCount < maxJobs) {
      processedCount += 1;
      const result = await processor();
      results.push(result);
      if (!result.processed) {
        shouldStop = true;
        break;
      }
    }
  };

  await Promise.all(Array.from({ length: concurrency }, () => workerLoop()));
  return results;
}

export async function runPipelineWorkerBurst(options: BurstOptions) {
  const results = await runBurst(processNextPipelineJob, options);
  const metrics = await getQueueAndWorkerMetrics();
  const reconciledStaleRuns = results.reduce((acc, item) => {
    if (!item.processed && "reconciledStaleRuns" in item) {
      return acc + Number(item.reconciledStaleRuns ?? 0);
    }
    return acc;
  }, 0);
  return {
    processed: results.length,
    concurrency: options.concurrency,
    maxJobs: options.maxJobs,
    reconciledStaleRuns,
    metrics,
    results,
  };
}

export async function runStageWorkerBurst(options: BurstOptions) {
  const results = await runBurst(processNextStageJob, options);
  const redisClaims = results.filter(
    (item) => item.processed && "claimSource" in item && item.claimSource === "redis",
  ).length;
  const dbFallbackClaims = results.filter(
    (item) => item.processed && "claimSource" in item && item.claimSource === "db_fallback",
  ).length;
  const metrics = await getQueueAndWorkerMetrics();
  return {
    processed: results.length,
    concurrency: options.concurrency,
    maxJobs: options.maxJobs,
    redisClaims,
    dbFallbackClaims,
    metrics,
    results,
  };
}

export async function runSendWorkerBurst(options: BurstOptions) {
  const results = await runBurst(processNextSendJob, options);
  const metrics = await getQueueAndWorkerMetrics();
  return {
    processed: results.length,
    concurrency: options.concurrency,
    maxJobs: options.maxJobs,
    metrics,
    results,
  };
}

export async function runBurstWithCronLog<T>(
  jobName: string,
  details: Record<string, unknown>,
  runner: () => Promise<T>,
) {
  const started = await startCronRun(jobName, details);
  try {
    const result = await runner();
    await finishCronRun(started.id, started.startedAt, "success", {
      ...details,
      result,
    });
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await finishCronRun(started.id, started.startedAt, "failed", details, message);
    throw error;
  }
}

