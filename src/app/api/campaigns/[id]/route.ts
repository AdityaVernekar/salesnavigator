import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { leadTargetSchema } from "@/lib/campaigns/validation";
import { supabaseServer } from "@/lib/supabase/server";

const campaignPatchSchema = z.object({
  leads_per_run: leadTargetSchema.optional(),
  mailbox_selection_mode: z.enum(["explicit_single", "round_robin", "least_loaded"]).optional(),
  primary_account_id: z.string().uuid().nullable().optional(),
  template_experiment_id: z.string().uuid().nullable().optional(),
  test_mode_enabled: z.boolean().optional(),
  test_recipient_emails: z.array(z.string().email()).max(50).optional(),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { data, error } = await supabaseServer.from("campaigns").select("*").eq("id", id).single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 404 });
  return NextResponse.json({ ok: true, campaign: data });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = campaignPatchSchema.passthrough().parse(await request.json());
    const { data, error } = await supabaseServer
      .from("campaigns")
      .update(body)
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
