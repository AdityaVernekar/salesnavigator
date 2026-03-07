import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRouteContext } from "@/lib/auth/route-context";

const leadStatusSchema = z.enum([
  "new",
  "enriching",
  "enriched",
  "scored",
  "emailed",
  "disqualified",
  "error",
]);

const leadPatchSchema = z
  .object({
    company_name: z.string().optional(),
    company_domain: z.string().optional(),
    source: z.string().optional(),
    status: leadStatusSchema.optional(),
    company_description: z.string().optional(),
    fit_reasoning: z.string().optional(),
    researched_at: z.string().datetime({ offset: true }).or(z.literal("")).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "At least one field is required");

function cleanString(value: string | undefined) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const contextResult = await requireRouteContext();
  if (!contextResult.ok) return contextResult.response;
  const { supabase, companyId } = contextResult.context;

  const { data: contact } = await supabase
    .from("contacts")
    .select("*")
    .eq("company_id", companyId)
    .eq("id", id)
    .single();
  const { data: score } = await supabase
    .from("icp_scores")
    .select("*")
    .eq("company_id", companyId)
    .eq("contact_id", id)
    .single();

  return NextResponse.json({ ok: true, contact, score });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const contextResult = await requireRouteContext();
    if (!contextResult.ok) return contextResult.response;
    const { supabase, companyId } = contextResult.context;

    const { id } = await params;
    const parsed = leadPatchSchema.parse(await request.json());
    const payload = {
      company_name: cleanString(parsed.company_name),
      company_domain: cleanString(parsed.company_domain),
      source: cleanString(parsed.source),
      status: parsed.status,
      company_description: cleanString(parsed.company_description),
      fit_reasoning: cleanString(parsed.fit_reasoning),
      researched_at:
        typeof parsed.researched_at === "string"
          ? parsed.researched_at.trim().length > 0
            ? parsed.researched_at
            : null
          : undefined,
    };

    const { data, error } = await supabase
      .from("leads")
      .update(payload)
      .eq("company_id", companyId)
      .eq("id", id)
      .select(
        "id,company_name,company_domain,source,status,company_description,fit_reasoning,researched_at",
      )
      .single();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, lead: data });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Invalid lead payload" },
      { status: 400 },
    );
  }
}
