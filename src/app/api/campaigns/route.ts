import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { leadTargetSchema } from "@/lib/campaigns/validation";
import { supabaseServer } from "@/lib/supabase/server";

const campaignPayloadSchema = z.object({
  leads_per_run: leadTargetSchema.optional(),
  test_mode_enabled: z.boolean().optional(),
  test_recipient_emails: z.array(z.string().email()).max(50).optional(),
});

export async function GET() {
  const { data, error } = await supabaseServer
    .from("campaigns")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, campaigns: data ?? [] });
}

export async function POST(request: NextRequest) {
  try {
    const body = campaignPayloadSchema.passthrough().parse(await request.json());
    const { data, error } = await supabaseServer.from("campaigns").insert(body).select("*").single();
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
