import { NextRequest, NextResponse } from "next/server";
import { requireRouteContext } from "@/lib/auth/route-context";

export async function GET(request: NextRequest) {
  const contextResult = await requireRouteContext();
  if (!contextResult.ok) return contextResult.response;
  const { supabase, companyId } = contextResult.context;

  const { searchParams } = request.nextUrl;
  const campaignId = searchParams.get("campaignId") || undefined;
  const status = searchParams.get("status") || undefined;
  const limitRaw = Number(searchParams.get("limit") || "100");
  const limit = Math.min(Math.max(limitRaw, 1), 200);
  const cursor = searchParams.get("cursor") || undefined;

  let query = supabase
    .from("enrollments")
    .select(
      "id,campaign_id,contact_id,account_id,current_step,status,gmail_thread_id,next_step_at,scheduled_send_at,enrolled_at,contact:contacts(id,name,email,company_name,headline),campaign:campaigns(id,name,sequence_steps)",
    )
    .eq("company_id", companyId)
    .order("enrolled_at", { ascending: false })
    .limit(limit + 1);

  if (campaignId) {
    query = query.eq("campaign_id", campaignId);
  }
  if (status && status !== "all") {
    query = query.eq("status", status);
  }
  if (cursor) {
    query = query.lt("enrolled_at", cursor);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const rows = data ?? [];
  const paged = rows.slice(0, limit);
  const nextCursor =
    rows.length > limit ? (paged[paged.length - 1]?.enrolled_at ?? null) : null;

  const items = paged.map((row) => {
    const contact = Array.isArray(row.contact)
      ? row.contact[0]
      : row.contact;
    const campaign = Array.isArray(row.campaign)
      ? row.campaign[0]
      : row.campaign;
    const sequenceSteps = Array.isArray(campaign?.sequence_steps)
      ? campaign.sequence_steps
      : [];

    return {
      id: row.id,
      campaignId: row.campaign_id,
      campaignName: campaign?.name ?? "Unknown campaign",
      contactId: row.contact_id,
      contactName: contact?.name ?? "",
      contactEmail: contact?.email ?? "",
      companyName: contact?.company_name ?? "",
      contactHeadline: contact?.headline ?? "",
      currentStep: row.current_step ?? 0,
      totalSteps: sequenceSteps.length,
      status: row.status ?? "active",
      scheduledSendAt: row.scheduled_send_at ?? null,
      enrolledAt: row.enrolled_at ?? "",
      threadId: row.gmail_thread_id ?? null,
    };
  });

  return NextResponse.json({ ok: true, items, nextCursor });
}
