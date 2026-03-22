import { NextResponse } from "next/server";
import { requireRouteContext } from "@/lib/auth/route-context";
import { applySchedulingWindow, computeNextStepAt } from "@/lib/workflows/schedule";
import type { SequenceStep } from "@/lib/workflows/sequence-schema";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const contextResult = await requireRouteContext();
  if (!contextResult.ok) return contextResult.response;
  const { supabase, companyId } = contextResult.context;

  // Load campaign to validate sequence steps
  const { data: campaign, error: fetchError } = await supabase
    .from("campaigns")
    .select("*")
    .eq("company_id", companyId)
    .eq("id", id)
    .single();

  if (fetchError || !campaign) {
    return NextResponse.json(
      { ok: false, error: fetchError?.message ?? "Campaign not found" },
      { status: 404 },
    );
  }

  const steps = (campaign.sequence_steps ?? []) as SequenceStep[];
  if (steps.length === 0) {
    return NextResponse.json(
      { ok: false, error: "Campaign must have at least one sequence step before launching" },
      { status: 400 },
    );
  }

  // Activate the campaign
  const { data, error } = await supabase
    .from("campaigns")
    .update({ status: "active" })
    .eq("company_id", companyId)
    .eq("id", id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

  // Compute scheduled_send_at for active enrollments that don't have one yet
  const { data: pendingEnrollments } = await supabase
    .from("enrollments")
    .select("id,contact_id,current_step,next_step_at")
    .eq("campaign_id", id)
    .eq("status", "active")
    .is("scheduled_send_at", null);

  if (pendingEnrollments?.length) {
    const sendWindow = {
      send_window_start: campaign.send_window_start ?? "09:00",
      send_window_end: campaign.send_window_end ?? "17:00",
      send_window_timezone: campaign.send_window_timezone ?? "America/New_York",
      send_window_days: campaign.send_window_days ?? [1, 2, 3, 4, 5],
    };

    for (const enrollment of pendingEnrollments) {
      const step = steps[enrollment.current_step];
      if (!step) continue;

      const nextStepAt = enrollment.next_step_at
        ? new Date(enrollment.next_step_at)
        : computeNextStepAt(new Date(), step);
      const scheduledSendAt = applySchedulingWindow(nextStepAt, sendWindow, null);

      await supabase
        .from("enrollments")
        .update({
          next_step_at: nextStepAt.toISOString(),
          scheduled_send_at: scheduledSendAt.toISOString(),
        })
        .eq("id", enrollment.id);
    }
  }

  return NextResponse.json({ ok: true, campaign: data });
}
