import { notFound } from "next/navigation";
import { ContactsEditableTable } from "@/components/leads/contacts-editable-table";
import { LeadEmailActivity } from "@/components/leads/lead-email-activity";
import { LeadCompanyDetails } from "@/components/leads/lead-company-details";
import { LeadDetailActions } from "@/components/leads/lead-detail-actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireCurrentUserCompany } from "@/lib/auth/user-company";
import { listLeadEmailActivity } from "@/lib/inbox/service";

export const dynamic = "force-dynamic";

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, companyId } = await requireCurrentUserCompany();

  const { data: leadById } = await supabase
    .from("leads")
    .select(
      "id,company_name,company_domain,source,status,created_at,company_description,fit_reasoning,researched_at",
    )
    .eq("company_id", companyId)
    .eq("id", id)
    .maybeSingle();

  const { data: contactById } = await supabase
    .from("contacts")
    .select("id,lead_id,name,email,headline,linkedin_url,company_name")
    .eq("company_id", companyId)
    .eq("id", id)
    .maybeSingle();

  const leadId = leadById?.id ?? contactById?.lead_id ?? null;
  const { data: lead } = leadId
    ? await supabase
        .from("leads")
        .select(
          "id,company_name,company_domain,source,status,created_at,company_description,fit_reasoning,researched_at",
        )
        .eq("company_id", companyId)
        .eq("id", leadId)
        .maybeSingle()
    : { data: null };

  if (!lead && !contactById) {
    notFound();
  }

  const { data: contacts } = lead?.id
    ? await supabase
        .from("contacts")
        .select(
          "id,lead_id,name,email,headline,linkedin_url,company_name,created_at",
        )
        .eq("company_id", companyId)
        .eq("lead_id", lead.id)
        .order("created_at", { ascending: false })
    : { data: contactById ? [contactById] : [] };

  const contactIds = (contacts ?? []).map((contact) => contact.id);
  const { data: scores } = contactIds.length
    ? await supabase
        .from("icp_scores")
        .select("contact_id,score,tier,reasoning")
        .eq("company_id", companyId)
        .in("contact_id", contactIds)
    : { data: [] };
  const scoreByContact = new Map(
    (scores ?? []).map((score) => [score.contact_id, score]),
  );

  const [activity, templatesResult, mailboxesResult] = await Promise.all([
    lead?.id
      ? listLeadEmailActivity({
          companyId,
          leadId: lead.id,
          limit: 200,
        })
      : Promise.resolve([]),
    supabase
      .from("email_templates")
      .select("id,name,active_version_id,status")
      .eq("company_id", companyId)
      .eq("status", "active")
      .order("updated_at", { ascending: false }),
    supabase
      .from("email_accounts")
      .select("id,gmail_address,signature_html,signature_enabled_by_default")
      .eq("company_id", companyId)
      .eq("is_active", true)
      .eq("connection_status", "connected")
      .order("gmail_address", { ascending: true }),
  ]);
  if (templatesResult.error) {
    throw new Error(templatesResult.error.message);
  }
  if (mailboxesResult.error) {
    throw new Error(mailboxesResult.error.message);
  }

  const activeVersionIds = (templatesResult.data ?? [])
    .map((item) => item.active_version_id)
    .filter((value): value is string => Boolean(value));
  const templateVersionRows = activeVersionIds.length
    ? await supabase
        .from("email_template_versions")
        .select("id,template_id,version,subject_template,body_template")
        .eq("company_id", companyId)
        .in("id", activeVersionIds)
        .then((result) => {
          if (result.error) throw new Error(result.error.message);
          return result.data ?? [];
        })
    : [];
  const templateRows = templatesResult.data ?? [];
  const mailboxRows = mailboxesResult.data ?? [];

  const templateByVersionId = new Map(templateVersionRows.map((version) => [version.id, version]));
  const templateOptions = templateRows
    .map((template) => {
      const activeVersion = template.active_version_id
        ? templateByVersionId.get(template.active_version_id)
        : null;
      if (!activeVersion) return null;
      return {
        id: template.id,
        name: template.name ?? "Untitled template",
        versionId: activeVersion.id,
        version: activeVersion.version,
        subjectTemplate: activeVersion.subject_template,
        bodyTemplate: activeVersion.body_template,
      };
    })
    .filter((item): item is {
      id: string;
      name: string;
      versionId: string;
      version: number;
      subjectTemplate: string;
      bodyTemplate: string;
    } => Boolean(item));

  const mailboxOptions = mailboxRows.map((item) => ({
    id: item.id,
    gmailAddress: item.gmail_address ?? "",
    signatureHtml: item.signature_html ?? null,
    signatureEnabledByDefault: item.signature_enabled_by_default ?? true,
  }));

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">
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
        <h2 className="text-base font-medium">Contacts</h2>
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

      {lead?.id ? (
        <LeadEmailActivity
          leadId={lead.id}
          activity={activity}
          contacts={(contacts ?? [])
            .filter((contact) => Boolean(contact.email))
            .map((contact) => ({
              id: contact.id,
              name: contact.name ?? "",
              email: contact.email ?? "",
              companyName: contact.company_name ?? lead.company_name ?? "",
              headline: contact.headline ?? "",
            }))}
          templates={templateOptions}
          mailboxes={mailboxOptions}
        />
      ) : null}
    </div>
  );
}
