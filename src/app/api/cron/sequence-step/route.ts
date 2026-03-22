import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/config/env";
import { finishCronRun, startCronRun } from "@/lib/cron/run-logs";
import { supabaseServer } from "@/lib/supabase/server";
import { getRedisClient } from "@/lib/redis/client";
import { processEnrollmentStep } from "@/lib/workflows/step-processor";
import { isWithinSendWindow } from "@/lib/workflows/schedule";
import type { SequenceStep } from "@/lib/workflows/sequence-schema";

const LOCK_KEY = "cron:sequence-step:lock";
const LOCK_TTL_SECONDS = 55;
const DEFAULT_BATCH_SIZE = 20;
const MAX_BATCH_SIZE = 50;

export async function POST(request: NextRequest) {
  let cronRunId: string | null = null;
  let startedAt = new Date().toISOString();
  try {
    if (request.headers.get("x-cron-secret") !== env.CRON_SECRET) {
      throw new Error("Unauthorized");
    }

    // Acquire Redis lock to prevent overlapping runs
    const redis = getRedisClient();
    const lockAcquired = await redis.set(LOCK_KEY, "1", "EX", LOCK_TTL_SECONDS, "NX");
    if (!lockAcquired) {
      return NextResponse.json({ ok: true, skipped: true, reason: "Another run in progress" });
    }

    const started = await startCronRun("sequence-step");
    cronRunId = started.id;
    startedAt = started.startedAt;

    // Parse batch size
    const batchSizeParam = Number(request.nextUrl.searchParams.get("batchSize") ?? DEFAULT_BATCH_SIZE);
    const batchSize = Math.min(Math.max(1, batchSizeParam), MAX_BATCH_SIZE);

    // Query due enrollments with their campaigns
    const { data: dueEnrollments } = await supabaseServer
      .from("enrollments")
      .select(`
        id,
        campaign_id,
        contact_id,
        account_id,
        current_step,
        status,
        gmail_thread_id,
        company_id,
        campaigns!inner(
          id,
          sequence_steps,
          value_prop,
          persona_name,
          persona_title,
          persona_company,
          send_window_start,
          send_window_end,
          send_window_timezone,
          send_window_days,
          status
        )
      `)
      .eq("status", "active")
      .lte("scheduled_send_at", new Date().toISOString())
      .limit(batchSize);

    if (!dueEnrollments?.length) {
      await finishCronRun(cronRunId, startedAt, "success", {
        dueCount: 0,
        processed: 0,
        errors: 0,
      });
      await redis.del(LOCK_KEY);
      return NextResponse.json({ ok: true, dueCount: 0, processed: 0 });
    }

    let processed = 0;
    let errors = 0;
    const errorDetails: Array<{ enrollmentId: string; error: string }> = [];

    for (const row of dueEnrollments) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const campaignData = (row as any).campaigns;
        if (!campaignData || campaignData.status !== "active") continue;

        const campaign = {
          id: campaignData.id as string,
          sequence_steps: (campaignData.sequence_steps ?? []) as SequenceStep[],
          value_prop: campaignData.value_prop as string | null,
          persona_name: campaignData.persona_name as string | null,
          persona_title: campaignData.persona_title as string | null,
          persona_company: campaignData.persona_company as string | null,
          send_window_start: (campaignData.send_window_start ?? "09:00") as string,
          send_window_end: (campaignData.send_window_end ?? "17:00") as string,
          send_window_timezone: (campaignData.send_window_timezone ?? "America/New_York") as string,
          send_window_days: (campaignData.send_window_days ?? [1, 2, 3, 4, 5]) as number[],
        };

        // Verify still within send window at execution time
        const { data: contact } = await supabaseServer
          .from("contacts")
          .select("timezone")
          .eq("id", row.contact_id)
          .single();

        const sendWindow = {
          send_window_start: campaign.send_window_start,
          send_window_end: campaign.send_window_end,
          send_window_timezone: campaign.send_window_timezone,
          send_window_days: campaign.send_window_days,
        };

        if (!isWithinSendWindow(new Date(), sendWindow, contact?.timezone ?? null)) {
          continue;
        }

        const result = await processEnrollmentStep(
          {
            id: row.id,
            campaign_id: row.campaign_id,
            contact_id: row.contact_id,
            account_id: row.account_id,
            current_step: row.current_step,
            status: row.status,
            gmail_thread_id: row.gmail_thread_id,
            company_id: row.company_id,
          },
          campaign,
        );

        if (result.success) {
          processed++;
        } else {
          errors++;
          errorDetails.push({
            enrollmentId: row.id,
            error: result.error ?? "Unknown error",
          });
        }
      } catch (stepError) {
        errors++;
        errorDetails.push({
          enrollmentId: row.id,
          error: stepError instanceof Error ? stepError.message : "Unexpected error",
        });
      }
    }

    await finishCronRun(cronRunId, startedAt, "success", {
      dueCount: dueEnrollments.length,
      processed,
      errors,
      errorDetails: errorDetails.slice(0, 5),
    });

    await redis.del(LOCK_KEY);
    return NextResponse.json({ ok: true, dueCount: dueEnrollments.length, processed, errors });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Cron sequence-step failed";
    await finishCronRun(cronRunId, startedAt, "failed", {}, message);
    try {
      const redis = getRedisClient();
      await redis.del(LOCK_KEY);
    } catch {
      // ignore cleanup error
    }
    return NextResponse.json(
      { ok: false, error: message },
      { status: message === "Unauthorized" ? 401 : 500 },
    );
  }
}
