import { NextResponse } from "next/server";
import { requireRouteContext } from "@/lib/auth/route-context";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const contextResult = await requireRouteContext();
  if (!contextResult.ok) return contextResult.response;
  const { supabase, companyId } = contextResult.context;

  const { data, error } = await supabase
    .from("campaigns")
    .update({ status: "active" })
    .eq("company_id", companyId)
    .eq("id", id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, campaign: data });
}
