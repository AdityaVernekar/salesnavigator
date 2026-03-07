import Link from "next/link";
import { notFound } from "next/navigation";
import { CampaignActions } from "@/components/campaigns/campaign-actions";
import { CampaignAbTestConfig } from "@/components/campaigns/campaign-ab-test-config";
import { CampaignMailboxAssignment } from "@/components/campaigns/campaign-mailbox-assignment";
import { CampaignTestSettings } from "@/components/campaigns/campaign-test-settings";
import { LeadTargetEditor } from "@/components/campaigns/lead-target-editor";
import { RunPipelineButton } from "@/components/campaigns/run-pipeline-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireCurrentUserCompany } from "@/lib/auth/user-company";

export const dynamic = "force-dynamic";

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, companyId } = await requireCurrentUserCompany();
  const { data: campaign } = await supabase
    .from("campaigns")
    .select("*")
    .eq("company_id", companyId)
    .eq("id", id)
    .single();
  const { data: enrollments } = await supabase
    .from("enrollments")
    .select("*")
    .eq("company_id", companyId)
    .eq("campaign_id", id)
    .order("enrolled_at", { ascending: false });
  const { data: runHistory } = await supabase
    .from("pipeline_runs")
    .select("id,status,current_stage,leads_generated,started_at,finished_at,run_mode,start_stage,end_stage")
    .eq("company_id", companyId)
    .eq("campaign_id", id)
    .order("started_at", { ascending: false })
    .limit(10);
  const { count: campaignLeadCount } = await supabase
    .from("leads")
    .select("*", { count: "exact", head: true })
    .eq("company_id", companyId)
    .eq("campaign_id", id);
  const { data: activeMailboxes } = await supabase
    .from("email_accounts")
    .select("id,gmail_address,is_active")
    .eq("company_id", companyId)
    .eq("is_active", true)
    .eq("connection_status", "connected")
    .order("created_at", { ascending: false });
  const { data: experiments } = await supabase
    .from("email_template_experiments")
    .select("id,status")
    .eq("company_id", companyId)
    .eq("campaign_id", id)
    .order("created_at", { ascending: false });

  if (!campaign) {
    notFound();
  }

  const contactIds = Array.from(
    new Set((enrollments ?? []).map((item) => item.contact_id)),
  );
  const { data: contacts } = contactIds.length
    ? await supabase
        .from("contacts")
        .select("id,name,email")
        .eq("company_id", companyId)
        .in("id", contactIds)
    : {
        data: [] as Array<{
          id: string;
          name: string | null;
          email: string | null;
        }>,
      };
  const contactMap = new Map(
    (contacts ?? []).map((contact) => [contact.id, contact]),
  );
  const leadTarget = campaign.leads_per_run ?? 20;
  const leadsProgress = campaignLeadCount ?? 0;
  const targetReached = leadsProgress >= leadTarget;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="text-2xl font-semibold">{campaign.name}</h1>
        <RunPipelineButton
          campaignId={campaign.id}
          defaultLeadTarget={campaign.leads_per_run ?? 20}
          defaultEmailSendLimit={campaign.daily_send_limit ?? 50}
        />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Campaign Configuration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            <strong>Status:</strong> {campaign.status}
          </p>
          <p>
            <strong>ICP:</strong> {campaign.icp_description}
          </p>
          <p>
            <strong>Value Prop:</strong> {campaign.value_prop ?? "-"}
          </p>
          <p>
            <strong>Mailbox Mode:</strong> {campaign.mailbox_selection_mode ?? "least_loaded"}
          </p>
          <p>
            <strong>Primary Mailbox:</strong> {campaign.primary_account_id ?? "-"}
          </p>
          <p>
            <strong>Template Experiment:</strong> {campaign.template_experiment_id ?? "-"}
          </p>
          <div className="space-y-1">
            <p>
              <strong>Lead Target:</strong>
            </p>
            <LeadTargetEditor
              campaignId={campaign.id}
              initialLeadTarget={leadTarget}
            />
          </div>
          <p>
            <strong>Lead Progress:</strong> {leadsProgress} / {leadTarget}
            {targetReached ? " (Target reached)" : ""}
          </p>
          <div className="space-y-1">
            <p>
              <strong>Test Sending:</strong> {campaign.test_mode_enabled ? "Enabled" : "Disabled"}
            </p>
            <CampaignTestSettings
              campaignId={campaign.id}
              initialTestModeEnabled={Boolean(campaign.test_mode_enabled)}
              initialTestRecipientEmails={((campaign.test_recipient_emails ?? []) as string[]).filter((item) => Boolean(item))}
            />
            <p>
              <strong>Assigned Mailboxes:</strong>{" "}
              {(campaign.account_ids ?? []).length ? String((campaign.account_ids ?? []).length) : "None"}
            </p>
            <CampaignMailboxAssignment
              campaignId={campaign.id}
              mailboxes={activeMailboxes ?? []}
              initialAccountIds={(campaign.account_ids ?? []) as string[]}
              initialMailboxSelectionMode={
                (campaign.mailbox_selection_mode as "explicit_single" | "round_robin" | "least_loaded") ??
                "least_loaded"
              }
              initialPrimaryAccountId={(campaign.primary_account_id as string | null) ?? null}
              initialTemplateExperimentId={(campaign.template_experiment_id as string | null) ?? null}
              templateExperiments={(experiments ?? []).map((item) => ({
                id: item.id as string,
                status: item.status as string,
              }))}
            />
            <CampaignAbTestConfig
              campaignId={campaign.id}
              activeExperimentId={(campaign.template_experiment_id as string | null) ?? null}
            />
          </div>
          <CampaignActions campaignId={campaign.id} status={campaign.status} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Enrollments</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {(enrollments ?? []).length === 0 && (
            <p className="text-muted-foreground">No enrollments yet.</p>
          )}
          {(enrollments ?? []).map((item) => {
            const contact = contactMap.get(item.contact_id);
            return (
              <div key={item.id} className="rounded border p-2">
                <Link
                  href={`/leads/${item.contact_id}`}
                  className="font-medium text-primary underline"
                >
                  {contact?.name ?? "Unknown contact"}
                </Link>
                <div className="text-muted-foreground">
                  {contact?.email ?? "No email on file"}
                </div>
                <div>
                  Step {item.current_step} • {item.status}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pipeline Run History</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {(runHistory ?? []).length === 0 && (
            <p className="text-muted-foreground">No pipeline runs yet.</p>
          )}
          {(runHistory ?? []).map((run) => (
            <div
              key={run.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded border p-2"
            >
              <div>
                <p className="font-medium">
                  {new Date(run.started_at).toLocaleString()}
                </p>
                <p className="text-muted-foreground">
                  Stage: {run.current_stage ?? "-"} • Leads:{" "}
                  {run.leads_generated ?? 0} •{" "}
                  {run.run_mode === "custom" ? `${run.start_stage ?? "-"} -> ${run.end_stage ?? "-"}` : "full"}
                </p>
              </div>
              <Badge
                variant={run.status === "failed" ? "destructive" : "outline"}
              >
                {run.status}
              </Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
