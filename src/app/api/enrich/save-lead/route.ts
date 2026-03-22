import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRouteContext } from "@/lib/auth/route-context";

const requestSchema = z.object({
  name: z.string().min(1),
  email: z.string().email().optional(),
  headline: z.string().optional(),
  linkedinUrl: z.string().url(),
  companyName: z.string().optional(),
  companyDomain: z.string().optional(),
  cladoProfile: z.record(z.unknown()).optional(),
  summary: z.string().optional(),
});

export async function POST(request: NextRequest) {
  const contextResult = await requireRouteContext();
  if (!contextResult.ok) return contextResult.response;
  const { supabase, companyId } = contextResult.context;

  const parsed = requestSchema.safeParse(
    await request.json().catch(() => ({})),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.message },
      { status: 400 },
    );
  }

  const {
    name,
    email,
    headline,
    linkedinUrl,
    companyName,
    companyDomain,
    cladoProfile,
    summary,
  } = parsed.data;

  try {
    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .insert({
        company_name: companyName ?? name,
        company_domain: companyDomain ?? null,
        source: "manual",
        status: "enriched",
        company_id: companyId,
      })
      .select("id")
      .single();

    if (leadError || !lead) {
      return NextResponse.json(
        { ok: false, error: leadError?.message ?? "Failed to create lead" },
        { status: 500 },
      );
    }

    const { data: contact, error: contactError } = await supabase
      .from("contacts")
      .insert({
        lead_id: lead.id,
        name,
        email: email ?? null,
        headline: headline ?? null,
        linkedin_url: linkedinUrl,
        company_name: companyName ?? null,
        clado_profile: cladoProfile ?? {},
        contact_brief: summary ?? null,
        enriched_at: new Date().toISOString(),
        company_id: companyId,
      })
      .select("id")
      .single();

    if (contactError || !contact) {
      return NextResponse.json(
        {
          ok: false,
          error: contactError?.message ?? "Failed to create contact",
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      leadId: lead.id,
      contactId: contact.id,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to save lead",
      },
      { status: 500 },
    );
  }
}
