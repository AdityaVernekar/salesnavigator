import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/lib/config/env";
import { finishCronRun, startCronRun } from "@/lib/cron/run-logs";
import { getQueueAndWorkerMetrics } from "@/lib/pipeline/metrics";
import { getDynamicWorkerCapacity } from "@/lib/pipeline/capacity-policy";

const bodySchema = z.object({
  dryRun: z.boolean().optional().default(false),
});

function assertCronSecret(request: NextRequest) {
  const secret = request.headers.get("x-cron-secret");
  if (!secret || secret !== env.CRON_SECRET) {
    throw new Error("Unauthorized ops request");
  }
}

async function kickWorker(url: string) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "x-cron-secret": env.CRON_SECRET },
  });
  const payload = await response.json().catch(() => null);
  return {
    url,
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    payload,
  };
}

export async function POST(request: NextRequest) {
  let cronRunId: string | null = null;
  let startedAt = new Date().toISOString();
  try {
    assertCronSecret(request);
    const body = bodySchema.parse(await request.json().catch(() => ({})));

    const metricsBefore = await getQueueAndWorkerMetrics();
    const targets = getDynamicWorkerCapacity(metricsBefore);
    const started = await startCronRun("ops-scale-kick", {
      dryRun: body.dryRun,
      metricsBefore,
      targets,
    });
    cronRunId = started.id;
    startedAt = started.startedAt;

    const baseUrl = env.NEXT_PUBLIC_APP_URL;
    const urls = {
      pipeline: `${baseUrl}/api/cron/pipeline-worker?maxJobs=${targets.pipeline.maxJobs}&concurrency=${targets.pipeline.concurrency}`,
      stage: `${baseUrl}/api/cron/stage-worker?maxJobs=${targets.stage.maxJobs}&concurrency=${targets.stage.concurrency}`,
      send: `${baseUrl}/api/cron/send-worker?maxJobs=${targets.send.maxJobs}&concurrency=${targets.send.concurrency}`,
    };

    const kicks = body.dryRun
      ? {
          pipeline: { ok: true, status: 200, statusText: "dry_run", payload: null, url: urls.pipeline },
          stage: { ok: true, status: 200, statusText: "dry_run", payload: null, url: urls.stage },
          send: { ok: true, status: 200, statusText: "dry_run", payload: null, url: urls.send },
        }
      : {
          pipeline: await kickWorker(urls.pipeline),
          stage: await kickWorker(urls.stage),
          send: await kickWorker(urls.send),
        };

    const metricsAfter = await getQueueAndWorkerMetrics();
    const result = {
      ok: kicks.pipeline.ok && kicks.stage.ok && kicks.send.ok,
      dryRun: body.dryRun,
      targets,
      kicks,
      metricsBefore,
      metricsAfter,
    };

    await finishCronRun(cronRunId, startedAt, "success", result);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown scale kick error";
    await finishCronRun(cronRunId, startedAt, "failed", {}, message);
    return NextResponse.json({ ok: false, error: message }, { status: 401 });
  }
}

