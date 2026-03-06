import { notFound } from "next/navigation";
import { ContactsEditableTable } from "@/components/leads/contacts-editable-table";
import { LeadCompanyDetails } from "@/components/leads/lead-company-details";
import { LeadDetailActions } from "@/components/leads/lead-detail-actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const { data: leadById } = await supabaseServer
    .from("leads")
    .select(
      "id,company_name,company_domain,source,status,created_at,company_description,fit_reasoning,researched_at",
    )
    .eq("id", id)
    .maybeSingle();

  const { data: contactById } = await supabaseServer
    .from("contacts")
    .select("id,lead_id,name,email,headline,linkedin_url,company_name")
    .eq("id", id)
    .maybeSingle();

  const leadId = leadById?.id ?? contactById?.lead_id ?? null;
  const { data: lead } = leadId
    ? await supabaseServer
        .from("leads")
        .select(
          "id,company_name,company_domain,source,status,created_at,company_description,fit_reasoning,researched_at",
        )
        .eq("id", leadId)
        .maybeSingle()
    : { data: null };

  if (!lead && !contactById) {
    notFound();
  }

  const { data: contacts } = lead?.id
    ? await supabaseServer
        .from("contacts")
        .select(
          "id,lead_id,name,email,headline,linkedin_url,company_name,created_at",
        )
        .eq("lead_id", lead.id)
        .order("created_at", { ascending: false })
    : { data: contactById ? [contactById] : [] };

  const contactIds = (contacts ?? []).map((contact) => contact.id);
  const { data: scores } = contactIds.length
    ? await supabaseServer
        .from("icp_scores")
        .select("contact_id,score,tier,reasoning")
        .in("contact_id", contactIds)
    : { data: [] };
  const scoreByContact = new Map(
    (scores ?? []).map((score) => [score.contact_id, score]),
  );

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">
        {lead?.company_name ?? contactById?.company_name ?? "Lead Detail"}
      </h1>

      <Card>
        <CardHeader>
          <CardTitle>Company Detail</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {lead?.id ? <LeadDetailActions leadId={lead.id} /> : null}
          <LeadCompanyDetails
            leadId={lead?.id ?? contactById?.lead_id ?? null}
            companyName={lead?.company_name ?? contactById?.company_name ?? ""}
            companyDomain={lead?.company_domain ?? ""}
            source={lead?.source ?? ""}
            status={lead?.status ?? "new"}
            companyDescription={lead?.company_description ?? ""}
            fitReasoning={lead?.fit_reasoning ?? ""}
            researchedAt={lead?.researched_at ?? null}
          />
        </CardContent>
      </Card>

      <div className="space-y-3">
        <h2 className="text-lg font-medium">Contacts</h2>
        {(contacts ?? []).length === 0 ? (
          <div className="rounded border border-dashed p-4 text-sm text-muted-foreground">
            No contacts found for this lead yet.
          </div>
        ) : (
          <ContactsEditableTable
            contacts={(contacts ?? []).map((contact) => {
              const score = scoreByContact.get(contact.id);
              return {
                id: contact.id,
                name: contact.name ?? "",
                company: contact.company_name ?? lead?.company_name ?? "",
                email: contact.email ?? "",
                headline: contact.headline ?? "",
                linkedinUrl: contact.linkedin_url ?? "",
                score: score?.score ?? null,
                tier: score?.tier ?? null,
                reasoning: score?.reasoning ?? null,
              };
            })}
          />
        )}
      </div>
    </div>
  );
}
