import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";

const createSchema = z.object({
  email: z.string().email(),
  reason: z.string().optional(),
});

export async function GET() {
  const { data, error } = await supabaseServer
    .from("suppressions")
    .select("*")
    .order("added_at", { ascending: false });

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, suppressions: data ?? [] });
}

export async function POST(request: NextRequest) {
  try {
    const payload = createSchema.parse(await request.json());
    const { data, error } = await supabaseServer
      .from("suppressions")
      .insert(payload)
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
