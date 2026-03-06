import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { listInboxItems, syncInboxReplies } from "@/lib/inbox/service";

const querySchema = z.object({
  view: z.enum(["sent", "replies"]).default("replies"),
  campaignId: z.union([z.literal("all"), z.string().uuid()]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),
});

const syncSchema = z.object({
  campaignId: z.union([z.literal("all"), z.string().uuid()]).optional(),
  maxAccounts: z.number().int().min(1).max(50).optional(),
});

export async function GET(request: NextRequest) {
  const parsed = querySchema.safeParse({
    view: request.nextUrl.searchParams.get("view") ?? undefined,
    campaignId: request.nextUrl.searchParams.get("campaignId") ?? undefined,
    limit: request.nextUrl.searchParams.get("limit") ?? undefined,
    cursor: request.nextUrl.searchParams.get("cursor") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.message }, { status: 400 });
  }
  try {
    const result = await listInboxItems({
      ...parsed.data,
      campaignId: parsed.data.campaignId === "all" ? undefined : parsed.data.campaignId,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to load inbox items" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const parsed = syncSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.message }, { status: 400 });
  }
  try {
    const result = await syncInboxReplies({
      ...parsed.data,
      campaignId: parsed.data.campaignId === "all" ? undefined : parsed.data.campaignId,
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Inbox sync failed" },
      { status: 500 },
    );
  }
}
