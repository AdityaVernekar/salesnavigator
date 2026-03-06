type WorkerTuning = {
  maxJobs: number;
  concurrency: number;
  reason: string;
};

type CapacityPolicyInput = {
  pipelineQueueDepth: number;
  stageQueueDepth: number;
  sendQueueDepth: number;
  stageProcessing: number;
  sendProcessing: number;
  stageFailed: number;
  sendFailed: number;
  runningRuns: number;
};

type CapacityPolicyOutput = {
  pipeline: WorkerTuning;
  stage: WorkerTuning;
  send: WorkerTuning;
  degraded: boolean;
};

const WORKER_LIMITS = {
  pipeline: { maxJobs: 10, concurrency: 5 },
  stage: { maxJobs: 25, concurrency: 8 },
  send: { maxJobs: 50, concurrency: 12 },
} as const;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function applyFailureBackoff(base: WorkerTuning, failedCount: number) {
  if (failedCount < 6) return { next: base, degraded: false };
  if (failedCount < 12) {
    return {
      next: {
        ...base,
        maxJobs: clamp(Math.ceil(base.maxJobs * 0.7), 1, base.maxJobs),
        concurrency: clamp(Math.ceil(base.concurrency * 0.7), 1, base.concurrency),
        reason: `${base.reason}; mild_failure_backoff`,
      },
      degraded: true,
    };
  }
  return {
    next: {
      ...base,
      maxJobs: clamp(Math.ceil(base.maxJobs * 0.5), 1, base.maxJobs),
      concurrency: clamp(Math.ceil(base.concurrency * 0.5), 1, base.concurrency),
      reason: `${base.reason}; strong_failure_backoff`,
    },
    degraded: true,
  };
}

export function getDynamicWorkerCapacity(input: CapacityPolicyInput): CapacityPolicyOutput {
  const pipelinePressure = input.pipelineQueueDepth + Math.max(input.runningRuns - 1, 0);
  const stagePressure = input.stageQueueDepth + Math.ceil(input.stageProcessing / 2);
  const sendPressure = input.sendQueueDepth + Math.ceil(input.sendProcessing / 2);

  const pipelineBase: WorkerTuning = {
    maxJobs: clamp(Math.ceil(pipelinePressure / 2), 1, WORKER_LIMITS.pipeline.maxJobs),
    concurrency: clamp(Math.ceil(pipelinePressure / 4), 1, WORKER_LIMITS.pipeline.concurrency),
    reason: `pipeline_pressure=${pipelinePressure}`,
  };
  const stageBase: WorkerTuning = {
    maxJobs: clamp(Math.ceil(stagePressure / 4), 1, WORKER_LIMITS.stage.maxJobs),
    concurrency: clamp(Math.ceil(stagePressure / 10), 1, WORKER_LIMITS.stage.concurrency),
    reason: `stage_pressure=${stagePressure}`,
  };
  const sendBase: WorkerTuning = {
    maxJobs: clamp(Math.ceil(sendPressure / 5), 1, WORKER_LIMITS.send.maxJobs),
    concurrency: clamp(Math.ceil(sendPressure / 20), 1, WORKER_LIMITS.send.concurrency),
    reason: `send_pressure=${sendPressure}`,
  };

  const stageBackoff = applyFailureBackoff(stageBase, input.stageFailed);
  const sendBackoff = applyFailureBackoff(sendBase, input.sendFailed);
  const degraded = stageBackoff.degraded || sendBackoff.degraded;

  return {
    pipeline: {
      ...pipelineBase,
      maxJobs: Math.max(pipelineBase.maxJobs, pipelineBase.concurrency),
    },
    stage: {
      ...stageBackoff.next,
      maxJobs: Math.max(stageBackoff.next.maxJobs, stageBackoff.next.concurrency),
    },
    send: {
      ...sendBackoff.next,
      maxJobs: Math.max(sendBackoff.next.maxJobs, sendBackoff.next.concurrency),
    },
    degraded,
  };
}

