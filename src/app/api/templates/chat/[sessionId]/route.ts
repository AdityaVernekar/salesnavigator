import { NextRequest, NextResponse } from "next/server";
import { getSessionMessages } from "@/lib/email/templates";
import { requireRouteContext } from "@/lib/auth/route-context";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const contextResult = await requireRouteContext();
  if (!contextResult.ok) return contextResult.response;
  const { companyId } = contextResult.context;
  const { sessionId } = await params;
  try {
    const messages = await getSessionMessages(companyId, sessionId);
    return NextResponse.json({ ok: true, messages });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to fetch chat session" },
      { status: 400 },
    );
  }
}
