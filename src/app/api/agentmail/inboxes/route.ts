import { NextRequest, NextResponse } from "next/server";
import { requireRouteContext } from "@/lib/auth/route-context";
import { createAgentMailInbox, listAgentMailInboxes, deleteAgentMailInbox } from "@/lib/agentmail/inbox";

export async function GET() {
  const auth = await requireRouteContext();
  if (!auth.ok) return auth.response;

  try {
    const inboxes = await listAgentMailInboxes(auth.context.companyId);
    return NextResponse.json({ ok: true, inboxes });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to list inboxes" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireRouteContext();
  if (!auth.ok) return auth.response;

  const body = await request.json();

  try {
    const { inbox, account } = await createAgentMailInbox({
      companyId: auth.context.companyId,
      displayName: body.displayName,
      username: body.username,
      domain: body.domain,
    });

    return NextResponse.json({
      ok: true,
      inbox: {
        id: account.id,
        email: inbox.email,
        displayName: inbox.displayName,
        agentmailInboxId: inbox.inboxId,
        provider: "agentmail",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to create inbox" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireRouteContext();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const accountId = searchParams.get("accountId");

  if (!accountId) {
    return NextResponse.json({ ok: false, error: "accountId is required" }, { status: 400 });
  }

  try {
    await deleteAgentMailInbox(accountId, auth.context.companyId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to delete inbox" },
      { status: 500 },
    );
  }
}
