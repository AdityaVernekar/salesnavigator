import { NextRequest, NextResponse } from "next/server";
import { requireRouteContext } from "@/lib/auth/route-context";
import { supabaseServer } from "@/lib/supabase/server";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireRouteContext();
  if (!auth.ok) return auth.response;

  const { id } = await params;

  const { error } = await supabaseServer
    .from("email_templates")
    .update({ status: "archived" })
    .eq("id", id)
    .eq("company_id", auth.context.companyId);

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
