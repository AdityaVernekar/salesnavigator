import { NextRequest, NextResponse } from "next/server";
import { requireRouteContext } from "@/lib/auth/route-context";

interface LeadContactRow {
  id: string;
  lead_id: string;
  name: string | null;
  email: string | null;
  company_name: string | null;
}

export async function GET(request: NextRequest) {
  const contextResult = await requireRouteContext();
  if (!contextResult.ok) return contextResult.response;
  const { supabase, companyId } = contextResult.context;

  const campaignId = request.nextUrl.searchParams.get("campaignId");
  const tier = request.nextUrl.searchParams.get("tier");
  const status = request.nextUrl.searchParams.get("status");

  let query = supabase
    .from("leads")
    .select("id,campaign_id,status,company_name,company_domain,created_at")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });
  if (campaignId) query = query.eq("campaign_id", campaignId);
  if (status) query = query.eq("status", status);

  const { data: leads, error } = await query.limit(200);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!leads?.length) return NextResponse.json({ ok: true, leads: [] });

  const leadIds = leads.map((lead) => lead.id);
  const { data: contacts } = await supabase
    .from("contacts")
    .select("id,lead_id,name,email,company_name,created_at")
    .eq("company_id", companyId)
    .in("lead_id", leadIds)
    .order("created_at", { ascending: false });

  const contactsByLead = new Map<string, LeadContactRow>();
  for (const contact of contacts ?? []) {
    if (!contactsByLead.has(contact.lead_id)) {
      contactsByLead.set(contact.lead_id, contact as LeadContactRow);
    }
  }

  const contactIds = (contacts ?? []).map((contact) => contact.id);
  const { data: scores } = contactIds.length
    ? await supabase
        .from("icp_scores")
        .select("contact_id,score,tier,next_action,scored_at")
        .eq("company_id", companyId)
        .in("contact_id", contactIds)
    : { data: [] };

  const scoreByContact = new Map((scores ?? []).map((score) => [score.contact_id, score]));

  const rows = leads
    .map((lead) => {
      const contact = contactsByLead.get(lead.id);
      const score = contact ? scoreByContact.get(contact.id) : null;
      return {
        lead_id: lead.id,
        campaign_id: lead.campaign_id,
        status: lead.status,
        company_name: lead.company_name,
        company_domain: lead.company_domain,
        created_at: lead.created_at,
        contact,
        score,
      };
    })
    .filter((row) => (tier ? row.score?.tier === tier : true));

  return NextResponse.json({ ok: true, leads: rows });
}
