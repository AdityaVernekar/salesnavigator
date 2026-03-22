import { NextResponse } from "next/server";
import { requireRouteContext } from "@/lib/auth/route-context";
import { syncAgentMailInboxes } from "@/lib/agentmail/inbox";

export async function POST() {
  const auth = await requireRouteContext();
  if (!auth.ok) return auth.response;

  try {
    const result = await syncAgentMailInboxes(auth.context.companyId);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to sync inboxes" },
      { status: 500 },
    );
  }
}
