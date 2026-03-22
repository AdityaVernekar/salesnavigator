import type { SupabaseClient } from "@supabase/supabase-js";
import { computeNextStepAt, applySchedulingWindow } from "./schedule";
import type { SequenceStep, SendWindowConfig } from "./sequence-schema";

export async function createEnrollmentWithSchedule(
  supabase: SupabaseClient,
  params: {
    campaignId: string;
    contactId: string;
    accountId: string | null;
    companyId: string;
    sequenceSteps: SequenceStep[];
    sendWindow: SendWindowConfig;
    contactTimezone: string | null;
  },
) {
  const firstStep = params.sequenceSteps[0];
  if (!firstStep) {
    throw new Error("Campaign has no sequence steps configured");
  }

  const now = new Date();
  const nextStepAt = computeNextStepAt(now, firstStep);
  const scheduledSendAt = applySchedulingWindow(
    nextStepAt,
    params.sendWindow,
    params.contactTimezone,
  );

  const { data, error } = await supabase
    .from("enrollments")
    .upsert(
      {
        campaign_id: params.campaignId,
        contact_id: params.contactId,
        account_id: params.accountId,
        company_id: params.companyId,
        current_step: 0,
        status: "active",
        next_step_at: nextStepAt.toISOString(),
        scheduled_send_at: scheduledSendAt.toISOString(),
        enrolled_at: now.toISOString(),
      },
      { onConflict: "campaign_id,contact_id" },
    )
    .select("id")
    .single();

  if (error) {
    throw new Error(`Failed to create enrollment: ${error.message}`);
  }

  return data;
}
