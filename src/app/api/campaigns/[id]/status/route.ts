import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRouteContext } from "@/lib/auth/route-context";

const schema = z.object({
  status: z.enum(["active", "paused", "completed", "draft"]),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const contextResult = await requireRouteContext();
    if (!contextResult.ok) return contextResult.response;
    const { supabase, companyId } = contextResult.context;

    const { status } = schema.parse(await request.json());
    const { data, error } = await supabase
      .from("campaigns")
      .update({ status })
      .eq("company_id", companyId)
      .eq("id", id)
      .select("*")
      .single();

    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, campaign: data });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Invalid status update" },
      { status: 400 },
    );
  }
}
