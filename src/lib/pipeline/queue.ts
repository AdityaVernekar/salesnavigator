import { Redis } from "@upstash/redis";
import { z } from "zod";
import { env } from "@/lib/config/env";
import { EXECUTABLE_PIPELINE_STAGES } from "@/lib/pipeline/stages";
import { pipelineRunConfigSchema } from "@/lib/pipeline/run-config";

const PIPELINE_QUEUE_KEY = "pipeline:jobs:v1";

export const pipelineJobSchema = z.object({
  runId: z.string().uuid(),
  campaignId: z.string().uuid(),
  trigger: z.enum(["manual", "cron", "webhook"]),
  runMode: z.enum(["full", "custom"]).default("full"),
  startStage: z.enum(EXECUTABLE_PIPELINE_STAGES).nullable().default(null),
  endStage: z.enum(EXECUTABLE_PIPELINE_STAGES).nullable().default(null),
  selectedStages: z.array(z.enum(EXECUTABLE_PIPELINE_STAGES)).default([]),
  runConfig: pipelineRunConfigSchema.default({}),
  enqueuedAt: z.string(),
  attempt: z.number().int().min(1),
});

export type PipelineJob = z.infer<typeof pipelineJobSchema>;

let client: Redis | null = null;

function getRedisClient(): Redis {
  if (client) return client;
  if (!env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN) {
    throw new Error("Upstash Redis env is missing");
  }

  client = new Redis({
    url: env.UPSTASH_REDIS_REST_URL,
    token: env.UPSTASH_REDIS_REST_TOKEN,
  });

  return client;
}

export async function enqueuePipelineJob(job: PipelineJob): Promise<number> {
  const redis = getRedisClient();
  const encoded = JSON.stringify(pipelineJobSchema.parse(job));
  const size = await redis.rpush(PIPELINE_QUEUE_KEY, encoded);
  return Number(size);
}

export async function dequeuePipelineJob(): Promise<PipelineJob | null> {
  const redis = getRedisClient();
  const encoded = await redis.lpop<string | PipelineJob | null>(PIPELINE_QUEUE_KEY);
  if (!encoded) {
    return null;
  }
  if (typeof encoded === "string") {
    return pipelineJobSchema.parse(JSON.parse(encoded));
  }
  return pipelineJobSchema.parse(encoded);
}

export async function getPipelineQueueDepth(): Promise<number> {
  const redis = getRedisClient();
  const size = await redis.llen(PIPELINE_QUEUE_KEY);
  return Number(size);
}
