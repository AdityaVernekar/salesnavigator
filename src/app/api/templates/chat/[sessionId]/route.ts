import { NextRequest, NextResponse } from "next/server";
import { getSessionMessages } from "@/lib/email/templates";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await params;
  try {
    const messages = await getSessionMessages(sessionId);
    return NextResponse.json({ ok: true, messages });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to fetch chat session" },
      { status: 400 },
    );
  }
}
