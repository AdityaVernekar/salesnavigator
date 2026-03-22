import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { env } from "@/lib/config/env";
import { getQueueAndWorkerMetrics } from "@/lib/pipeline/metrics";
import { supabaseServer } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

async function callOpsApi(path: string, options?: { method?: "GET" | "POST"; body?: Record<string, unknown> }) {
  const response = await fetch(`${env.NEXT_PUBLIC_APP_URL}${path}`, {
    method: options?.method ?? "GET",
    headers: {
      "x-cron-secret": env.CRON_SECRET,
      ...(options?.body ? { "Content-Type": "application/json" } : {}),
    },
    ...(options?.body ? { body: JSON.stringify(options.body) } : {}),
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: response.ok, payload };
}

async function scanStuckJobsAction() {
  "use server";
  const result = await callOpsApi("/api/ops/stuck-jobs?limit=20&staleProcessingMinutes=10");
  if (!result.ok) {
    const message = encodeURIComponent(String(result.payload.error ?? "Scan failed"));
    redirect(`/settings/ops?opsAction=scan&ok=0&error=${message}`);
  }

  const stageCount = Number((result.payload.stage as { stuckCount?: number } | undefined)?.stuckCount ?? 0);
  const sendCount = Number((result.payload.send as { stuckCount?: number } | undefined)?.stuckCount ?? 0);
  redirect(`/settings/ops?opsAction=scan&ok=1&stuckStage=${stageCount}&stuckSend=${sendCount}`);
}

async function recoverStuckJobsAction() {
  "use server";
  const result = await callOpsApi("/api/ops/stuck-jobs/recover", {
    method: "POST",
    body: {
      limit: 50,
      staleProcessingMinutes: 10,
    },
  });
  if (!result.ok) {
    const message = encodeURIComponent(String(result.payload.error ?? "Recovery failed"));
    redirect(`/settings/ops?opsAction=recover&ok=0&error=${message}`);
  }

  const recovered = result.payload.recovered as
    | {
        stage?: { count?: number };
        send?: { count?: number };
      }
    | undefined;
  const stageRecovered = Number(recovered?.stage?.count ?? 0);
  const sendRecovered = Number(recovered?.send?.count ?? 0);
  redirect(
    `/settings/ops?opsAction=recover&ok=1&stageRecovered=${stageRecovered}&sendRecovered=${sendRecovered}`,
  );
}

async function dynamicScaleKickAction() {
  "use server";
  const result = await callOpsApi("/api/ops/scale-kick", {
    method: "POST",
    body: {
      dryRun: false,
    },
  });
  if (!result.ok) {
    const message = encodeURIComponent(String(result.payload.error ?? "Scale kick failed"));
    redirect(`/settings/ops?opsAction=scale-kick&ok=0&error=${message}`);
  }

  const targets = result.payload.targets as
    | {
        pipeline?: { concurrency?: number; maxJobs?: number };
        stage?: { concurrency?: number; maxJobs?: number };
        send?: { concurrency?: number; maxJobs?: number };
      }
    | undefined;
  redirect(
    `/settings/ops?opsAction=scale-kick&ok=1&pipelineC=${Number(targets?.pipeline?.concurrency ?? 0)}&stageC=${Number(targets?.stage?.concurrency ?? 0)}&sendC=${Number(targets?.send?.concurrency ?? 0)}&pipelineM=${Number(targets?.pipeline?.maxJobs ?? 0)}&stageM=${Number(targets?.stage?.maxJobs ?? 0)}&sendM=${Number(targets?.send?.maxJobs ?? 0)}`,
  );
}

async function getOpsData() {
  const [metrics, runsResp, cronResp, campaignsResp] = await Promise.all([
    getQueueAndWorkerMetrics().catch(() => ({
      pipelineQueueDepth: 0,
      stageQueueDepth: 0,
      sendQueueDepth: 0,
      stageQueued: 0,
      stageProcessing: 0,
      stageFailed: 0,
      sendQueued: 0,
      sendProcessing: 0,
      sendFailed: 0,
      runningRuns: 0,
      stuckStageJobs: 0,
      stuckSendJobs: 0,
      oldestStuckStageStartedAt: null,
      oldestStuckSendStartedAt: null,
      oldestStuckStageAgeSeconds: null,
      oldestStuckSendAgeSeconds: null,
      collectedAt: new Date().toISOString(),
    })),
    supabaseServer
      .from("pipeline_runs")
      .select("id,campaign_id,status,current_stage,started_at,finished_at,run_mode,start_stage,end_stage,error")
      .order("started_at", { ascending: false })
      .limit(20),
    supabaseServer
      .from("cron_run_logs")
      .select("id,job_name,status,started_at,finished_at,duration_ms,error")
      .order("started_at", { ascending: false })
      .limit(30),
    supabaseServer.from("campaigns").select("id,name"),
  ]);

  return {
    metrics,
    runs: runsResp.data ?? [],
    cronRuns: cronResp.data ?? [],
    campaigns: campaignsResp.data ?? [],
  };
}

export default async function OpsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const data = await getOpsData();
  const params = (await searchParams) ?? {};
  const action = typeof params.opsAction === "string" ? params.opsAction : null;
  const ok = typeof params.ok === "string" ? params.ok === "1" : null;
  const actionError = typeof params.error === "string" ? decodeURIComponent(params.error) : null;
  const campaignMap = new Map(data.campaigns.map((campaign) => [campaign.id, campaign.name]));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Ops Dashboard</h1>
          <p className="text-sm text-muted-foreground">Queue depth, pipeline run history, and cron health.</p>
        </div>
        <Link href="/settings" className="text-sm text-primary underline">
          Back to settings
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Queue</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <p>Pipeline queue depth: <strong>{data.metrics.pipelineQueueDepth}</strong></p>
          <p>Stage queue depth: <strong>{data.metrics.stageQueueDepth}</strong> (processing {data.metrics.stageProcessing})</p>
          <p>Send queue depth: <strong>{data.metrics.sendQueueDepth}</strong> (processing {data.metrics.sendProcessing})</p>
          <p>Stuck stage jobs: <strong>{data.metrics.stuckStageJobs}</strong></p>
          <p>Stuck send jobs: <strong>{data.metrics.stuckSendJobs}</strong></p>
          <p className="text-muted-foreground">
            Oldest stuck stage age: {data.metrics.oldestStuckStageAgeSeconds ?? "-"}s • Oldest stuck send age:{" "}
            {data.metrics.oldestStuckSendAgeSeconds ?? "-"}s
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Ops Actions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <form action={scanStuckJobsAction}>
              <Button type="submit" variant="outline">Scan stuck jobs</Button>
            </form>
            <form action={recoverStuckJobsAction}>
              <Button type="submit" variant="outline">Recover stuck jobs</Button>
            </form>
            <form action={dynamicScaleKickAction}>
              <Button type="submit">Run dynamic scale kick</Button>
            </form>
          </div>
          {action ? (
            <div className="rounded border p-2 text-sm">
              <p className="font-medium">
                Last action: {action} • {ok ? "success" : "failed"}
              </p>
              {actionError ? <p className="text-destructive">{actionError}</p> : null}
              {action === "scan" && ok ? (
                <p className="text-muted-foreground">
                  Stuck stage: {typeof params.stuckStage === "string" ? params.stuckStage : "0"} • Stuck send:{" "}
                  {typeof params.stuckSend === "string" ? params.stuckSend : "0"}
                </p>
              ) : null}
              {action === "recover" && ok ? (
                <p className="text-muted-foreground">
                  Recovered stage: {typeof params.stageRecovered === "string" ? params.stageRecovered : "0"} • Recovered send:{" "}
                  {typeof params.sendRecovered === "string" ? params.sendRecovered : "0"}
                </p>
              ) : null}
              {action === "scale-kick" && ok ? (
                <p className="text-muted-foreground">
                  Targets — pipeline: {typeof params.pipelineM === "string" ? params.pipelineM : "0"}/
                  {typeof params.pipelineC === "string" ? params.pipelineC : "0"}, stage:{" "}
                  {typeof params.stageM === "string" ? params.stageM : "0"}/
                  {typeof params.stageC === "string" ? params.stageC : "0"}, send:{" "}
                  {typeof params.sendM === "string" ? params.sendM : "0"}/
                  {typeof params.sendC === "string" ? params.sendC : "0"}
                </p>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent Pipeline Runs</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {data.runs.length === 0 ? <p className="text-muted-foreground">No pipeline runs yet.</p> : null}
          {data.runs.map((run) => (
            <div key={run.id} className="flex flex-wrap items-center justify-between gap-2 rounded border p-2">
              <div>
                <p className="font-medium">{campaignMap.get(run.campaign_id) ?? "Unknown campaign"}</p>
                <p className="text-muted-foreground">
                  {new Date(run.started_at).toLocaleString()} • {run.run_mode === "custom" ? `${run.start_stage ?? "-"} -> ${run.end_stage ?? "-"}` : "full"} • stage {run.current_stage ?? "-"}
                </p>
                {run.error ? <p className="text-destructive">Error: {run.error}</p> : null}
              </div>
              <Badge variant={run.status === "failed" ? "destructive" : "outline"}>{run.status}</Badge>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Cron Health</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {data.cronRuns.length === 0 ? <p className="text-muted-foreground">No cron logs yet.</p> : null}
          {data.cronRuns.map((run) => (
            <div key={run.id} className="flex flex-wrap items-center justify-between gap-2 rounded border p-2">
              <div>
                <p className="font-medium">{run.job_name}</p>
                <p className="text-muted-foreground">
                  {new Date(run.started_at).toLocaleString()} • duration {run.duration_ms ?? 0}ms
                </p>
                {run.error ? <p className="text-destructive">Error: {run.error}</p> : null}
              </div>
              <Badge variant={run.status === "failed" ? "destructive" : "outline"}>{run.status}</Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
