import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRouteContext } from "@/lib/auth/route-context";

const bulkSchema = z.object({
  action: z.enum(["pause", "unenroll"]),
  campaignId: z.string().uuid(),
});

export async function POST(request: NextRequest) {
  const contextResult = await requireRouteContext();
  if (!contextResult.ok) return contextResult.response;
  const { supabase, companyId } = contextResult.context;

  const parsed = bulkSchema.safeParse(
    await request.json().catch(() => ({})),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.message },
      { status: 400 },
    );
  }

  const { action, campaignId } = parsed.data;
  const newStatus = action === "pause" ? "paused" : "unsubscribed";

  const { data, error } = await supabase
    .from("enrollments")
    .update({ status: newStatus })
    .eq("company_id", companyId)
    .eq("campaign_id", campaignId)
    .eq("status", "active")
    .select("id");

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    affected: (data ?? []).length,
    newStatus,
  });
}
