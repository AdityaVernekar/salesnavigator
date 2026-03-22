import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { leadTargetSchema } from "@/lib/campaigns/validation";
import { requireRouteContext } from "@/lib/auth/route-context";
import { sequenceStepSchema } from "@/lib/workflows/sequence-schema";

const campaignPatchSchema = z.object({
  leads_per_run: leadTargetSchema.optional(),
  mailbox_selection_mode: z.enum(["explicit_single", "round_robin", "least_loaded"]).optional(),
  primary_account_id: z.string().uuid().nullable().optional(),
  template_experiment_id: z.string().uuid().nullable().optional(),
  test_mode_enabled: z.boolean().optional(),
  test_recipient_emails: z.array(z.string().email()).max(50).optional(),
  sequence_steps: z.array(sequenceStepSchema).min(1).optional(),
  send_window_start: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  send_window_end: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  send_window_timezone: z.string().optional(),
  send_window_days: z.array(z.number().int().min(1).max(7)).min(1).optional(),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const contextResult = await requireRouteContext();
  if (!contextResult.ok) return contextResult.response;
  const { supabase, companyId } = contextResult.context;

  const { data, error } = await supabase
    .from("campaigns")
    .select("*")
    .eq("company_id", companyId)
    .eq("id", id)
    .single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 404 });
  return NextResponse.json({ ok: true, campaign: data });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const contextResult = await requireRouteContext();
    if (!contextResult.ok) return contextResult.response;
    const { supabase, companyId } = contextResult.context;

    const body = campaignPatchSchema.passthrough().parse(await request.json());
    const { data, error } = await supabase
      .from("campaigns")
      .update(body)
      .eq("company_id", companyId)
      .eq("id", id)
      .select("*")
      .single();
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, campaign: data });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Invalid campaign payload",
      },
      { status: 400 },
    );
  }
}
