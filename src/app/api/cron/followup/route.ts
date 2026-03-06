import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/config/env";
import { finishCronRun, startCronRun } from "@/lib/cron/run-logs";
import { mastra } from "@/mastra";
import { supabaseServer } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  let cronRunId: string | null = null;
  let startedAt = new Date().toISOString();
  try {
    if (request.headers.get("x-cron-secret") !== env.CRON_SECRET) {
      throw new Error("Unauthorized");
    }

    const started = await startCronRun("followup");
    cronRunId = started.id;
    startedAt = started.startedAt;
    const { data: campaigns } = await supabaseServer.from("campaigns").select("id").eq("status", "active");
    const campaignIds = (campaigns ?? []).map((campaign) => campaign.id);

    const workflow = mastra.getWorkflow("followUpWorkflow");
    const run = await workflow.createRun();
    const result = await run.start({ inputData: { campaignIds } });
    await finishCronRun(cronRunId, startedAt, "success", {
      campaignCount: campaignIds.length,
      workflowStatus: result.status,
    });
    return NextResponse.json({ ok: true, status: result.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Cron followup failed";
    await finishCronRun(cronRunId, startedAt, "failed", {}, message);
    return NextResponse.json(
      { ok: false, error: message },
      { status: 401 },
    );
  }
}
