import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRouteContext } from "@/lib/auth/route-context";

const schema = z.object({
  contactIds: z.array(z.string()).min(1),
  action: z.enum(["disqualify", "manual_review", "queue_email"]),
});

export async function POST(request: NextRequest) {
  try {
    const contextResult = await requireRouteContext();
    if (!contextResult.ok) return contextResult.response;
    const { supabase, companyId } = contextResult.context;

    const payload = schema.parse(await request.json());

    if (payload.action === "disqualify") {
      const { error } = await supabase
        .from("icp_scores")
        .update({ tier: "disqualified", next_action: "discard" })
        .eq("company_id", companyId)
        .in("contact_id", payload.contactIds);
      if (error) throw new Error(error.message);
    }

    if (payload.action === "manual_review") {
      const { error } = await supabase
        .from("icp_scores")
        .update({ next_action: "manual_review" })
        .eq("company_id", companyId)
        .in("contact_id", payload.contactIds);
      if (error) throw new Error(error.message);
    }

    if (payload.action === "queue_email") {
      const { error } = await supabase
        .from("icp_scores")
        .update({ next_action: "email" })
        .eq("company_id", companyId)
        .in("contact_id", payload.contactIds);
      if (error) throw new Error(error.message);
    }

    return NextResponse.json({ ok: true, count: payload.contactIds.length });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Bulk action failed" },
      { status: 400 },
    );
  }
}
