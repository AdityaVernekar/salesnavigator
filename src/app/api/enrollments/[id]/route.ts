import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRouteContext } from "@/lib/auth/route-context";

const actionSchema = z.object({
  action: z.enum(["pause", "resume", "unenroll"]),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const contextResult = await requireRouteContext();
  if (!contextResult.ok) return contextResult.response;
  const { supabase, companyId } = contextResult.context;

  const { id } = await params;
  const parsed = actionSchema.safeParse(
    await request.json().catch(() => ({})),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "action must be pause, resume, or unenroll" },
      { status: 400 },
    );
  }

  const { data: enrollment } = await supabase
    .from("enrollments")
    .select("id,status,current_step,campaign_id")
    .eq("id", id)
    .eq("company_id", companyId)
    .maybeSingle();

  if (!enrollment) {
    return NextResponse.json(
      { ok: false, error: "Enrollment not found" },
      { status: 404 },
    );
  }

  const { action } = parsed.data;

  if (action === "pause") {
    if (enrollment.status !== "active") {
      return NextResponse.json(
        { ok: false, error: "Can only pause active enrollments" },
        { status: 400 },
      );
    }
    await supabase
      .from("enrollments")
      .update({ status: "paused" })
      .eq("id", id);
    return NextResponse.json({ ok: true, status: "paused" });
  }

  if (action === "resume") {
    if (enrollment.status !== "paused") {
      return NextResponse.json(
        { ok: false, error: "Can only resume paused enrollments" },
        { status: 400 },
      );
    }
    const now = new Date();
    const scheduledSendAt = new Date(
      now.getTime() + 60 * 60 * 1000,
    ).toISOString();
    await supabase
      .from("enrollments")
      .update({
        status: "active",
        scheduled_send_at: scheduledSendAt,
        next_step_at: scheduledSendAt,
      })
      .eq("id", id);
    return NextResponse.json({ ok: true, status: "active" });
  }

  if (action === "unenroll") {
    const terminalStatuses = ["completed", "unsubscribed", "bounced"];
    if (terminalStatuses.includes(enrollment.status)) {
      return NextResponse.json(
        { ok: false, error: "Enrollment is already in a terminal state" },
        { status: 400 },
      );
    }
    await supabase
      .from("enrollments")
      .update({ status: "unsubscribed" })
      .eq("id", id);
    return NextResponse.json({ ok: true, status: "unsubscribed" });
  }

  return NextResponse.json({ ok: false, error: "Unknown action" }, { status: 400 });
}
