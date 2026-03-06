import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";

const contactPatchSchema = z
  .object({
    name: z.string().optional(),
    email: z.string().email().or(z.literal("")).optional(),
    headline: z.string().optional(),
    linkedin_url: z.string().url().or(z.literal("")).optional(),
    company_name: z.string().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "At least one field is required");

function cleanString(value: string | undefined) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const parsed = contactPatchSchema.parse(await request.json());
    const payload = {
      name: cleanString(parsed.name),
      email:
        typeof parsed.email === "string"
          ? (cleanString(parsed.email)?.toLowerCase() ?? null)
          : undefined,
      headline: cleanString(parsed.headline),
      linkedin_url: cleanString(parsed.linkedin_url),
      company_name: cleanString(parsed.company_name),
    };

    const { data, error } = await supabaseServer
      .from("contacts")
      .update(payload)
      .eq("id", id)
      .select("id,name,email,headline,linkedin_url,company_name")
      .single();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, contact: data });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Invalid contact payload" },
      { status: 400 },
    );
  }
}
