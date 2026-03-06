import type { PipelineJob } from "@/lib/pipeline/queue";
import type { ExecutablePipelineStage } from "@/lib/pipeline/stages";
import type { StageJobPayload } from "@/lib/pipeline/job-store";

const DEFAULT_CHUNK_SIZE: Record<ExecutablePipelineStage, number> = {
  lead_generation: 15,
  people_discovery: 10,
  enrichment: 25,
  scoring: 50,
  email: 50,
};

export type PlannedStageJob = {
  stage: ExecutablePipelineStage;
  idempotencyKey: string;
  chunkIndex: number;
  chunkSize: number;
  payload: StageJobPayload;
};

function buildStageRunConfig(
  stage: ExecutablePipelineStage,
  baseConfig: PipelineJob["runConfig"],
  chunkSize: number,
) {
  const next = { ...(baseConfig ?? {}) } as Record<string, unknown>;
  if (stage === "lead_generation") {
    next.leadGeneration = { maxLeads: chunkSize };
  } else if (stage === "people_discovery") {
    next.peopleDiscovery = { maxContacts: chunkSize };
  } else if (stage === "enrichment") {
    next.enrichment = { maxContacts: chunkSize };
  } else if (stage === "scoring") {
    next.scoring = { maxContacts: chunkSize };
  } else if (stage === "email") {
    const current = (next.email ?? {}) as Record<string, unknown>;
    next.email = { ...current, maxSends: chunkSize };
  }
  return next;
}

function computeStageTarget(
  stage: ExecutablePipelineStage,
  runConfig: PipelineJob["runConfig"],
  campaignDefaults: { leadsPerRun?: number | null; dailySendLimit?: number | null },
) {
  if (stage === "lead_generation") {
    return Math.max(
      Number(runConfig.leadGeneration?.maxLeads ?? campaignDefaults.leadsPerRun ?? DEFAULT_CHUNK_SIZE.lead_generation),
      1,
    );
  }
  if (stage === "people_discovery") {
    return Math.max(Number(runConfig.peopleDiscovery?.maxContacts ?? DEFAULT_CHUNK_SIZE.people_discovery), 1);
  }
  if (stage === "enrichment") {
    return Math.max(Number(runConfig.enrichment?.maxContacts ?? DEFAULT_CHUNK_SIZE.enrichment), 1);
  }
  if (stage === "scoring") {
    return Math.max(Number(runConfig.scoring?.maxContacts ?? DEFAULT_CHUNK_SIZE.scoring), 1);
  }
  return Math.max(
    Number(runConfig.email?.maxSends ?? campaignDefaults.dailySendLimit ?? DEFAULT_CHUNK_SIZE.email),
    1,
  );
}

function getChunkSize(stage: ExecutablePipelineStage) {
  return DEFAULT_CHUNK_SIZE[stage];
}

export function planChunkedStageJobs(
  job: PipelineJob,
  campaignDefaults: { leadsPerRun?: number | null; dailySendLimit?: number | null },
): PlannedStageJob[] {
  const planned: PlannedStageJob[] = [];

  for (const stage of job.selectedStages) {
    const target = computeStageTarget(stage, job.runConfig, campaignDefaults);
    const chunkSize = getChunkSize(stage);
    const chunkCount = Math.max(Math.ceil(target / chunkSize), 1);

    for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex += 1) {
      const remaining = target - chunkIndex * chunkSize;
      const currentChunkSize = Math.max(Math.min(chunkSize, remaining), 1);
      const stageRunConfig = buildStageRunConfig(stage, job.runConfig, currentChunkSize);
      planned.push({
        stage,
        idempotencyKey: `${job.runId}:${stage}:${chunkIndex}`,
        chunkIndex,
        chunkSize: currentChunkSize,
        payload: {
          runConfig: stageRunConfig as Record<string, unknown>,
          selectedStages: [stage],
          stage,
          chunkIndex,
          chunkSize: currentChunkSize,
          totalTarget: target,
        },
      });
    }
  }

  return planned;
}
