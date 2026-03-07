import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRouteContext } from "@/lib/auth/route-context";

const createSchema = z.object({
  email: z.string().email(),
  reason: z.string().optional(),
});

export async function GET() {
  const contextResult = await requireRouteContext();
  if (!contextResult.ok) return contextResult.response;
  const { supabase, companyId } = contextResult.context;

  const { data, error } = await supabase
    .from("suppressions")
    .select("*")
    .eq("company_id", companyId)
    .order("added_at", { ascending: false });

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, suppressions: data ?? [] });
}

export async function POST(request: NextRequest) {
  try {
    const contextResult = await requireRouteContext();
    if (!contextResult.ok) return contextResult.response;
    const { supabase, companyId } = contextResult.context;

    const payload = createSchema.parse(await request.json());
    const { data, error } = await supabase
      .from("suppressions")
      .insert({ ...payload, company_id: companyId })
      .select("*")
      .single();

    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, suppression: data });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to add suppression" },
      { status: 400 },
    );
  }
}
