import { supabaseServer } from "@/lib/supabase/server";
import { getPipelineQueueDepth, getSendQueueDepth, getStageQueueDepth } from "@/lib/pipeline/queue";

export async function getQueueAndWorkerMetrics() {
  const nowIso = new Date().toISOString();
  const staleProcessingIso = new Date(Date.now() - 10 * 60_000).toISOString();
  const [pipelineQueueDepth, stageQueueDepth, sendQueueDepth] = await Promise.all([
    getPipelineQueueDepth(),
    getStageQueueDepth(),
    getSendQueueDepth(),
  ]);

  const [
    { count: stageQueued },
    { count: stageProcessing },
    { count: stageFailed },
    { count: sendQueued },
    { count: sendProcessing },
    { count: sendFailed },
    { count: runningRuns },
    { count: stuckStageJobs },
    { count: stuckSendJobs },
    oldestStuckStageResp,
    oldestStuckSendResp,
  ] = await Promise.all([
    supabaseServer.from("stage_jobs").select("*", { count: "exact", head: true }).eq("status", "queued"),
    supabaseServer.from("stage_jobs").select("*", { count: "exact", head: true }).eq("status", "processing"),
    supabaseServer.from("stage_jobs").select("*", { count: "exact", head: true }).eq("status", "failed"),
    supabaseServer.from("send_jobs").select("*", { count: "exact", head: true }).eq("status", "queued"),
    supabaseServer.from("send_jobs").select("*", { count: "exact", head: true }).eq("status", "processing"),
    supabaseServer.from("send_jobs").select("*", { count: "exact", head: true }).eq("status", "failed"),
    supabaseServer.from("pipeline_runs").select("*", { count: "exact", head: true }).eq("status", "running"),
    supabaseServer
      .from("stage_jobs")
      .select("*", { count: "exact", head: true })
      .eq("status", "processing")
      .or(`lease_expires_at.lt.${nowIso},started_at.lt.${staleProcessingIso}`),
    supabaseServer
      .from("send_jobs")
      .select("*", { count: "exact", head: true })
      .eq("status", "processing")
      .or(`lease_expires_at.lt.${nowIso},started_at.lt.${staleProcessingIso}`),
    supabaseServer
      .from("stage_jobs")
      .select("started_at")
      .eq("status", "processing")
      .or(`lease_expires_at.lt.${nowIso},started_at.lt.${staleProcessingIso}`)
      .order("started_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabaseServer
      .from("send_jobs")
      .select("started_at")
      .eq("status", "processing")
      .or(`lease_expires_at.lt.${nowIso},started_at.lt.${staleProcessingIso}`)
      .order("started_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);

  const oldestStageStartedAt = oldestStuckStageResp.data?.started_at ?? null;
  const oldestSendStartedAt = oldestStuckSendResp.data?.started_at ?? null;
  const oldestStageAgeSeconds = oldestStageStartedAt
    ? Math.max(0, Math.floor((Date.now() - Date.parse(oldestStageStartedAt)) / 1000))
    : null;
  const oldestSendAgeSeconds = oldestSendStartedAt
    ? Math.max(0, Math.floor((Date.now() - Date.parse(oldestSendStartedAt)) / 1000))
    : null;

  return {
    pipelineQueueDepth,
    stageQueueDepth,
    sendQueueDepth,
    stageQueued: Number(stageQueued ?? 0),
    stageProcessing: Number(stageProcessing ?? 0),
    stageFailed: Number(stageFailed ?? 0),
    sendQueued: Number(sendQueued ?? 0),
    sendProcessing: Number(sendProcessing ?? 0),
    sendFailed: Number(sendFailed ?? 0),
    runningRuns: Number(runningRuns ?? 0),
    stuckStageJobs: Number(stuckStageJobs ?? 0),
    stuckSendJobs: Number(stuckSendJobs ?? 0),
    oldestStuckStageStartedAt: oldestStageStartedAt,
    oldestStuckSendStartedAt: oldestSendStartedAt,
    oldestStuckStageAgeSeconds: oldestStageAgeSeconds,
    oldestStuckSendAgeSeconds: oldestSendAgeSeconds,
    collectedAt: new Date().toISOString(),
  };
}
