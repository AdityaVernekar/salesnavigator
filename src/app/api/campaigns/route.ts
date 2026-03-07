import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { leadTargetSchema } from "@/lib/campaigns/validation";
import { requireRouteContext } from "@/lib/auth/route-context";

const campaignPayloadSchema = z.object({
  leads_per_run: leadTargetSchema.optional(),
  test_mode_enabled: z.boolean().optional(),
  test_recipient_emails: z.array(z.string().email()).max(50).optional(),
});

export async function GET() {
  const contextResult = await requireRouteContext();
  if (!contextResult.ok) return contextResult.response;
  const { supabase, companyId } = contextResult.context;

  const { data, error } = await supabase
    .from("campaigns")
    .select("*")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, campaigns: data ?? [] });
}

export async function POST(request: NextRequest) {
  try {
    const contextResult = await requireRouteContext();
    if (!contextResult.ok) return contextResult.response;
    const { supabase, companyId } = contextResult.context;

    const body = campaignPayloadSchema.passthrough().parse(await request.json());
    const { data, error } = await supabase
      .from("campaigns")
      .insert({ ...body, company_id: companyId })
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
