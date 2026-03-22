import { EnrollmentsDashboard } from "@/components/enrollments/enrollments-dashboard";
import { requireCurrentUserCompany } from "@/lib/auth/user-company";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function readParam(value: string | string[] | undefined, fallback: string) {
  if (Array.isArray(value)) return value[0] ?? fallback;
  return value ?? fallback;
}

export default async function EnrollmentsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const campaignId = readParam(params.campaignId, "all");
  const status = readParam(params.status, "all");

  const { supabase, companyId } = await requireCurrentUserCompany();

  let query = supabase
    .from("enrollments")
    .select(
      "id,campaign_id,contact_id,current_step,status,scheduled_send_at,enrolled_at,gmail_thread_id,contact:contacts(id,name,email,company_name,headline),campaign:campaigns(id,name,sequence_steps)",
    )
    .eq("company_id", companyId)
    .order("enrolled_at", { ascending: false })
    .limit(200);

  if (campaignId !== "all") {
    query = query.eq("campaign_id", campaignId);
  }
  if (status !== "all") {
    query = query.eq("status", status);
  }

  const [{ data: enrollments }, { data: campaigns }] = await Promise.all([
    query,
    supabase
      .from("campaigns")
      .select("id,name")
      .eq("company_id", companyId)
      .order("name", { ascending: true }),
  ]);

  const items = (enrollments ?? []).map((row) => {
    const contact = Array.isArray(row.contact)
      ? row.contact[0]
      : row.contact;
    const campaign = Array.isArray(row.campaign)
      ? row.campaign[0]
      : row.campaign;
    const sequenceSteps = Array.isArray(campaign?.sequence_steps)
      ? campaign.sequence_steps
      : [];

    return {
      id: row.id as string,
      campaignId: row.campaign_id as string,
      campaignName: (campaign?.name as string) ?? "Unknown campaign",
      contactId: row.contact_id as string,
      contactName: (contact?.name as string) ?? "",
      contactEmail: (contact?.email as string) ?? "",
      companyName: (contact?.company_name as string) ?? "",
      currentStep: (row.current_step as number) ?? 0,
      totalSteps: sequenceSteps.length,
      status: (row.status as string) ?? "active",
      scheduledSendAt: (row.scheduled_send_at as string) ?? null,
      enrolledAt: (row.enrolled_at as string) ?? "",
      threadId: (row.gmail_thread_id as string) ?? null,
    };
  });

  const campaignOptions = (campaigns ?? []).map((c) => ({
    id: String(c.id),
    name: String(c.name ?? "Untitled"),
  }));

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Enrollments</h1>
      <p className="text-sm text-muted-foreground">
        Track and manage email sequence enrollments across campaigns.
      </p>
      <EnrollmentsDashboard
        items={items}
        campaigns={campaignOptions}
        campaignId={campaignId}
        status={status}
      />
    </div>
  );
}
