import { supabaseServer } from "@/lib/supabase/server";
import type { ExecutablePipelineStage } from "@/lib/pipeline/stages";
import { enqueueSendJobIds, enqueueStageJobIds } from "@/lib/pipeline/queue";

export type StageJobStatus = "queued" | "processing" | "completed" | "failed" | "cancelled";
export type SendJobStatus = "queued" | "processing" | "completed" | "failed" | "cancelled";

export type StageJobPayload = {
  runConfig: Record<string, unknown>;
  selectedStages: ExecutablePipelineStage[];
  stage: ExecutablePipelineStage;
  chunkIndex: number;
  chunkSize: number;
  leadOffset?: number;
  contactOffset?: number;
  totalTarget?: number;
};

export type SendJobPayload = {
  runConfig: Record<string, unknown>;
  selectedStages: ExecutablePipelineStage[];
  stage: "email";
  chunkIndex: number;
  chunkSize: number;
  contactIds?: string[];
};

function nowIso() {
  return new Date().toISOString();
}

function minutesAgoIso(minutes: number) {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

export async function createStageJobs(
  jobs: Array<{
    runId: string;
    campaignId: string;
    stage: ExecutablePipelineStage;
    priority?: number;
    idempotencyKey: string;
    chunkIndex: number;
    chunkSize: number;
    payload: StageJobPayload;
  }>,
) {
  if (!jobs.length) return [];
  const { data, error } = await supabaseServer
    .from("stage_jobs")
    .upsert(
      jobs.map((job) => ({
        run_id: job.runId,
        campaign_id: job.campaignId,
        stage: job.stage,
        priority: job.priority ?? 0,
        idempotency_key: job.idempotencyKey,
        chunk_index: job.chunkIndex,
        chunk_size: job.chunkSize,
        payload: job.payload,
        status: "queued",
        available_at: nowIso(),
        updated_at: nowIso(),
      })),
      { onConflict: "run_id,idempotency_key", ignoreDuplicates: false },
    )
    .select("id,status");

  if (error) throw new Error(`Failed to create stage jobs: ${error.message}`);
  return data ?? [];
}

export async function createSendJobs(
  jobs: Array<{
    runId: string;
    campaignId: string;
    stageJobId: string | null;
    priority?: number;
    idempotencyKey: string;
    payload: SendJobPayload;
  }>,
) {
  if (!jobs.length) return [];
  const { data, error } = await supabaseServer
    .from("send_jobs")
    .upsert(
      jobs.map((job) => ({
        run_id: job.runId,
        campaign_id: job.campaignId,
        stage_job_id: job.stageJobId,
        priority: job.priority ?? 0,
        idempotency_key: job.idempotencyKey,
        payload: job.payload,
        status: "queued",
        available_at: nowIso(),
        updated_at: nowIso(),
      })),
      { onConflict: "run_id,idempotency_key", ignoreDuplicates: false },
    )
    .select("id,status");

  if (error) throw new Error(`Failed to create send jobs: ${error.message}`);
  return data ?? [];
}

export async function claimStageJob(jobId: string, workerId: string, leaseSeconds = 120) {
  const leaseUntil = new Date(Date.now() + leaseSeconds * 1000).toISOString();
  const { data, error } = await supabaseServer
    .from("stage_jobs")
    .update({
      status: "processing",
      worker_id: workerId,
      lease_expires_at: leaseUntil,
      started_at: nowIso(),
      updated_at: nowIso(),
    })
    .eq("id", jobId)
    .eq("status", "queued")
    .select("*")
    .maybeSingle();

  if (error) throw new Error(`Failed to claim stage job: ${error.message}`);
  return data;
}

export async function extendStageJobLease(jobId: string, leaseSeconds = 120, workerId?: string) {
  const leaseUntil = new Date(Date.now() + leaseSeconds * 1000).toISOString();
  let query = supabaseServer
    .from("stage_jobs")
    .update({
      lease_expires_at: leaseUntil,
      updated_at: nowIso(),
    })
    .eq("id", jobId)
    .eq("status", "processing");
  if (workerId) {
    query = query.eq("worker_id", workerId);
  }

  const { data, error } = await query.select("id").maybeSingle();
  if (error) throw new Error(`Failed to extend stage job lease: ${error.message}`);
  return Boolean(data?.id);
}

export async function claimNextQueuedStageJob(workerId: string, leaseSeconds = 120) {
  const now = nowIso();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { data: nextQueued, error } = await supabaseServer
      .from("stage_jobs")
      .select("id")
      .eq("status", "queued")
      .lte("available_at", now)
      .order("priority", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(`Failed to load next queued stage job: ${error.message}`);
    if (!nextQueued?.id) return null;

    const claimed = await claimStageJob(String(nextQueued.id), workerId, leaseSeconds);
    if (claimed) return claimed;
  }

  return null;
}

export async function claimSendJob(jobId: string, workerId: string, leaseSeconds = 120) {
  const leaseUntil = new Date(Date.now() + leaseSeconds * 1000).toISOString();
  const { data, error } = await supabaseServer
    .from("send_jobs")
    .update({
      status: "processing",
      worker_id: workerId,
      lease_expires_at: leaseUntil,
      started_at: nowIso(),
      updated_at: nowIso(),
    })
    .eq("id", jobId)
    .eq("status", "queued")
    .select("*")
    .maybeSingle();

  if (error) throw new Error(`Failed to claim send job: ${error.message}`);
  return data;
}

export async function finishStageJob(jobId: string, status: Extract<StageJobStatus, "completed" | "failed" | "cancelled">, lastError?: string) {
  const patch: Record<string, unknown> = {
    status,
    finished_at: nowIso(),
    lease_expires_at: null,
    updated_at: nowIso(),
  };
  if (lastError) patch.last_error = lastError;
  const { error } = await supabaseServer.from("stage_jobs").update(patch).eq("id", jobId);
  if (error) throw new Error(`Failed to finish stage job: ${error.message}`);
}

export async function finishSendJob(jobId: string, status: Extract<SendJobStatus, "completed" | "failed" | "cancelled">, lastError?: string) {
  const patch: Record<string, unknown> = {
    status,
    finished_at: nowIso(),
    lease_expires_at: null,
    updated_at: nowIso(),
  };
  if (lastError) patch.last_error = lastError;
  const { error } = await supabaseServer.from("send_jobs").update(patch).eq("id", jobId);
  if (error) throw new Error(`Failed to finish send job: ${error.message}`);
}

export async function bumpStageJobAttempt(jobId: string, attempt: number, retryDelaySeconds = 15, lastError?: string) {
  const availableAt = new Date(Date.now() + retryDelaySeconds * 1000).toISOString();
  const patch: Record<string, unknown> = {
    status: "queued",
    attempt,
    available_at: availableAt,
    lease_expires_at: null,
    updated_at: nowIso(),
  };
  if (lastError) patch.last_error = lastError;
  const { error } = await supabaseServer.from("stage_jobs").update(patch).eq("id", jobId);
  if (error) throw new Error(`Failed to retry stage job: ${error.message}`);
}

export async function requeueStageJob(jobId: string, retryDelaySeconds = 10, lastError?: string) {
  const availableAt = new Date(Date.now() + retryDelaySeconds * 1000).toISOString();
  const patch: Record<string, unknown> = {
    status: "queued",
    available_at: availableAt,
    lease_expires_at: null,
    updated_at: nowIso(),
  };
  if (lastError) patch.last_error = lastError;
  const { error } = await supabaseServer.from("stage_jobs").update(patch).eq("id", jobId);
  if (error) throw new Error(`Failed to requeue stage job: ${error.message}`);
}

export async function requeueSendJob(jobId: string, retryDelaySeconds = 10, lastError?: string) {
  const availableAt = new Date(Date.now() + retryDelaySeconds * 1000).toISOString();
  const patch: Record<string, unknown> = {
    status: "queued",
    available_at: availableAt,
    lease_expires_at: null,
    updated_at: nowIso(),
  };
  if (lastError) patch.last_error = lastError;
  const { error } = await supabaseServer.from("send_jobs").update(patch).eq("id", jobId);
  if (error) throw new Error(`Failed to requeue send job: ${error.message}`);
}

export async function getStageDependencyState(runId: string, stage: ExecutablePipelineStage) {
  const { data: run, error: runError } = await supabaseServer
    .from("pipeline_runs")
    .select("selected_stages")
    .eq("id", runId)
    .maybeSingle();
  if (runError) throw new Error(`Failed to load run dependency state: ${runError.message}`);

  const selectedStages = Array.isArray(run?.selected_stages)
    ? (run.selected_stages as ExecutablePipelineStage[])
    : [];
  const stageIndex = selectedStages.indexOf(stage);
  const priorStages = stageIndex > 0 ? selectedStages.slice(0, stageIndex) : [];

  if (!priorStages.length) {
    return {
      hasPendingDependencies: false,
      hasFailedDependencies: false,
      priorStages,
      pendingCount: 0,
      failedCount: 0,
    };
  }

  const [{ count: pendingCount }, { count: failedCount }] = await Promise.all([
    supabaseServer
      .from("stage_jobs")
      .select("*", { count: "exact", head: true })
      .eq("run_id", runId)
      .in("stage", priorStages)
      .in("status", ["queued", "processing"]),
    supabaseServer
      .from("stage_jobs")
      .select("*", { count: "exact", head: true })
      .eq("run_id", runId)
      .in("stage", priorStages)
      .eq("status", "failed"),
  ]);

  return {
    hasPendingDependencies: Number(pendingCount ?? 0) > 0,
    hasFailedDependencies: Number(failedCount ?? 0) > 0,
    priorStages,
    pendingCount: Number(pendingCount ?? 0),
    failedCount: Number(failedCount ?? 0),
  };
}

export async function bumpSendJobAttempt(jobId: string, attempt: number, retryDelaySeconds = 15, lastError?: string) {
  const availableAt = new Date(Date.now() + retryDelaySeconds * 1000).toISOString();
  const patch: Record<string, unknown> = {
    status: "queued",
    attempt,
    available_at: availableAt,
    lease_expires_at: null,
    updated_at: nowIso(),
  };
  if (lastError) patch.last_error = lastError;
  const { error } = await supabaseServer.from("send_jobs").update(patch).eq("id", jobId);
  if (error) throw new Error(`Failed to retry send job: ${error.message}`);
}

export async function getRunJobCounts(runId: string) {
  const [
    { count: stageQueued },
    { count: stageProcessing },
    { count: stageFailed },
    { count: stageCompleted },
    { count: sendQueued },
    { count: sendProcessing },
    { count: sendFailed },
    { count: sendCompleted },
  ] = await Promise.all([
    supabaseServer.from("stage_jobs").select("*", { count: "exact", head: true }).eq("run_id", runId).eq("status", "queued"),
    supabaseServer.from("stage_jobs").select("*", { count: "exact", head: true }).eq("run_id", runId).eq("status", "processing"),
    supabaseServer.from("stage_jobs").select("*", { count: "exact", head: true }).eq("run_id", runId).eq("status", "failed"),
    supabaseServer.from("stage_jobs").select("*", { count: "exact", head: true }).eq("run_id", runId).eq("status", "completed"),
    supabaseServer.from("send_jobs").select("*", { count: "exact", head: true }).eq("run_id", runId).eq("status", "queued"),
    supabaseServer.from("send_jobs").select("*", { count: "exact", head: true }).eq("run_id", runId).eq("status", "processing"),
    supabaseServer.from("send_jobs").select("*", { count: "exact", head: true }).eq("run_id", runId).eq("status", "failed"),
    supabaseServer.from("send_jobs").select("*", { count: "exact", head: true }).eq("run_id", runId).eq("status", "completed"),
  ]);

  return {
    stageQueued: Number(stageQueued ?? 0),
    stageProcessing: Number(stageProcessing ?? 0),
    stageFailed: Number(stageFailed ?? 0),
    stageCompleted: Number(stageCompleted ?? 0),
    sendQueued: Number(sendQueued ?? 0),
    sendProcessing: Number(sendProcessing ?? 0),
    sendFailed: Number(sendFailed ?? 0),
    sendCompleted: Number(sendCompleted ?? 0),
  };
}

type ListStuckOptions = {
  runId?: string;
  limit?: number;
  staleProcessingMinutes?: number;
};

type StuckStageJobRow = {
  id: string;
  run_id: string;
  stage: string;
  worker_id: string | null;
  started_at: string | null;
  lease_expires_at: string | null;
  available_at: string | null;
};

type StuckSendJobRow = {
  id: string;
  run_id: string;
  worker_id: string | null;
  started_at: string | null;
  lease_expires_at: string | null;
  available_at: string | null;
};

export async function listStuckStageJobs(options: ListStuckOptions = {}) {
  const limit = Math.max(1, Math.min(options.limit ?? 50, 200));
  const staleMinutes = Math.max(1, options.staleProcessingMinutes ?? 10);
  const now = nowIso();
  const staleBefore = minutesAgoIso(staleMinutes);

  let query = supabaseServer
    .from("stage_jobs")
    .select("id,run_id,stage,worker_id,started_at,lease_expires_at,available_at")
    .eq("status", "processing")
    .or(`lease_expires_at.lt.${now},started_at.lt.${staleBefore}`)
    .order("started_at", { ascending: true })
    .limit(limit);

  if (options.runId) {
    query = query.eq("run_id", options.runId);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Failed to list stuck stage jobs: ${error.message}`);
  return (data ?? []) as StuckStageJobRow[];
}

export async function listStuckSendJobs(options: ListStuckOptions = {}) {
  const limit = Math.max(1, Math.min(options.limit ?? 50, 200));
  const staleMinutes = Math.max(1, options.staleProcessingMinutes ?? 10);
  const now = nowIso();
  const staleBefore = minutesAgoIso(staleMinutes);

  let query = supabaseServer
    .from("send_jobs")
    .select("id,run_id,worker_id,started_at,lease_expires_at,available_at")
    .eq("status", "processing")
    .or(`lease_expires_at.lt.${now},started_at.lt.${staleBefore}`)
    .order("started_at", { ascending: true })
    .limit(limit);

  if (options.runId) {
    query = query.eq("run_id", options.runId);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Failed to list stuck send jobs: ${error.message}`);
  return (data ?? []) as StuckSendJobRow[];
}

export async function countStuckStageJobs(options: Pick<ListStuckOptions, "runId" | "staleProcessingMinutes"> = {}) {
  const staleMinutes = Math.max(1, options.staleProcessingMinutes ?? 10);
  const now = nowIso();
  const staleBefore = minutesAgoIso(staleMinutes);
  let query = supabaseServer
    .from("stage_jobs")
    .select("*", { count: "exact", head: true })
    .eq("status", "processing")
    .or(`lease_expires_at.lt.${now},started_at.lt.${staleBefore}`);
  if (options.runId) query = query.eq("run_id", options.runId);
  const { count, error } = await query;
  if (error) throw new Error(`Failed to count stuck stage jobs: ${error.message}`);
  return Number(count ?? 0);
}

export async function countStuckSendJobs(options: Pick<ListStuckOptions, "runId" | "staleProcessingMinutes"> = {}) {
  const staleMinutes = Math.max(1, options.staleProcessingMinutes ?? 10);
  const now = nowIso();
  const staleBefore = minutesAgoIso(staleMinutes);
  let query = supabaseServer
    .from("send_jobs")
    .select("*", { count: "exact", head: true })
    .eq("status", "processing")
    .or(`lease_expires_at.lt.${now},started_at.lt.${staleBefore}`);
  if (options.runId) query = query.eq("run_id", options.runId);
  const { count, error } = await query;
  if (error) throw new Error(`Failed to count stuck send jobs: ${error.message}`);
  return Number(count ?? 0);
}

export async function recoverStuckStageJobs(options: ListStuckOptions = {}) {
  const stuck = await listStuckStageJobs(options);
  const ids = stuck.map((row) => row.id);
  if (!ids.length) return { recoveredIds: [] as string[], recoveredRunIds: [] as string[], enqueued: 0 };

  const { data: updated, error } = await supabaseServer
    .from("stage_jobs")
    .update({
      status: "queued",
      worker_id: null,
      lease_expires_at: null,
      available_at: nowIso(),
      updated_at: nowIso(),
    })
    .in("id", ids)
    .eq("status", "processing")
    .select("id");
  if (error) throw new Error(`Failed to recover stuck stage jobs: ${error.message}`);

  const recoveredIds = (updated ?? []).map((row) => String(row.id)).filter(Boolean);
  const recoveredRunIds = Array.from(
    new Set(
      stuck
        .filter((row) => recoveredIds.includes(String(row.id)))
        .map((row) => String(row.run_id))
        .filter(Boolean),
    ),
  );
  const enqueued = recoveredIds.length ? await enqueueStageJobIds(recoveredIds) : 0;
  return { recoveredIds, recoveredRunIds, enqueued };
}

export async function recoverStuckSendJobs(options: ListStuckOptions = {}) {
  const stuck = await listStuckSendJobs(options);
  const ids = stuck.map((row) => row.id);
  if (!ids.length) return { recoveredIds: [] as string[], enqueued: 0 };

  const { data: updated, error } = await supabaseServer
    .from("send_jobs")
    .update({
      status: "queued",
      worker_id: null,
      lease_expires_at: null,
      available_at: nowIso(),
      updated_at: nowIso(),
    })
    .in("id", ids)
    .eq("status", "processing")
    .select("id");
  if (error) throw new Error(`Failed to recover stuck send jobs: ${error.message}`);

  const recoveredIds = (updated ?? []).map((row) => String(row.id)).filter(Boolean);
  const enqueued = recoveredIds.length ? await enqueueSendJobIds(recoveredIds) : 0;
  return { recoveredIds, enqueued };
}
