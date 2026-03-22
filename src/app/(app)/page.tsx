import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DashboardPipelineTrigger } from "@/components/pipeline/dashboard-pipeline-trigger";
import { StatCards } from "@/components/pipeline/stat-cards";
import { LeadsPipelineBreakdown } from "@/components/pipeline/leads-pipeline-breakdown";
import { requireCurrentUserCompany } from "@/lib/auth/user-company";

export const dynamic = "force-dynamic";

async function getDashboardData() {
  const { supabase, companyId } = await requireCurrentUserCompany();
  const [
    { count: leads },
    { count: emails },
    { count: campaigns },
    { count: activeRuns },
    campaignsResp,
    runsResp,
    leadStatusesResp,
    { count: enrichedContacts },
    { count: activeEnrollments },
    scoredContactsResp,
    enrolledContactsResp,
  ] = await Promise.all([
    supabase.from("leads").select("*", { count: "exact", head: true }).eq("company_id", companyId),
    supabase.from("emails_sent").select("*", { count: "exact", head: true }).eq("company_id", companyId),
    supabase.from("campaigns").select("*", { count: "exact", head: true }).eq("company_id", companyId),
    supabase.from("pipeline_runs").select("*", { count: "exact", head: true }).eq("company_id", companyId).eq("status", "running"),
    supabase
      .from("campaigns")
      .select("id,name,leads_per_run,daily_send_limit")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false }),
    supabase
      .from("pipeline_runs")
      .select("id,campaign_id,status,current_stage,leads_generated,started_at,run_mode,start_stage,end_stage")
      .eq("company_id", companyId)
      .order("started_at", { ascending: false })
      .limit(8),
    // Leads by status
    supabase.from("leads").select("status").eq("company_id", companyId),
    // Enriched contacts
    supabase.from("contacts").select("*", { count: "exact", head: true }).eq("company_id", companyId).not("enriched_at", "is", null),
    // Active enrollments
    supabase.from("enrollments").select("*", { count: "exact", head: true }).eq("company_id", companyId).eq("status", "active"),
    // Scored contacts (hot/warm) for available-for-outreach calc
    supabase.from("icp_scores").select("contact_id").eq("company_id", companyId).in("tier", ["hot", "warm"]),
    // Enrolled contacts for available-for-outreach calc
    supabase.from("enrollments").select("contact_id").eq("company_id", companyId),
  ]);

  // Aggregate leads by status
  const leadsByStatus: Record<string, number> = { new: 0, enriching: 0, enriched: 0, scored: 0, emailed: 0, disqualified: 0, error: 0 };
  for (const row of leadStatusesResp.data ?? []) {
    if (row.status in leadsByStatus) {
      leadsByStatus[row.status]++;
    }
  }

  // Compute available for outreach: scored (hot/warm) but not enrolled anywhere
  const enrolledSet = new Set((enrolledContactsResp.data ?? []).map((r) => r.contact_id));
  const availableForOutreach = (scoredContactsResp.data ?? []).filter((r) => !enrolledSet.has(r.contact_id)).length;

  return {
    leads: leads ?? 0,
    emails: emails ?? 0,
    campaigns: campaigns ?? 0,
    activeRuns: activeRuns ?? 0,
    campaignOptions: campaignsResp.data ?? [],
    recentRuns: runsResp.data ?? [],
    leadsByStatus,
    enrichedContacts: enrichedContacts ?? 0,
    activeEnrollments: activeEnrollments ?? 0,
    availableForOutreach,
  };
}

export default async function HomePage() {
  const data = await getDashboardData();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Monitor campaigns, agent runs, and outreach activity.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline">
            <Link href="/runs">Open Runs</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/campaigns">View Campaigns</Link>
          </Button>
        </div>
      </div>

      <DashboardPipelineTrigger campaigns={data.campaignOptions} />

      <StatCards
        leads={data.leads}
        emails={data.emails}
        campaigns={data.campaigns}
        activeRuns={data.activeRuns}
        enrichedContacts={data.enrichedContacts}
        activeEnrollments={data.activeEnrollments}
        availableForOutreach={data.availableForOutreach}
      />

      <LeadsPipelineBreakdown leadsByStatus={data.leadsByStatus} total={data.leads} />

      <Card>
        <CardHeader>
          <CardTitle>Recent Pipeline Runs</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {data.recentRuns.length === 0 ? (
            <p className="text-sm text-muted-foreground">No pipeline runs yet.</p>
          ) : (
            data.recentRuns.map((run) => {
              const campaign = data.campaignOptions.find((item) => item.id === run.campaign_id);
              return (
                <div key={run.id} className="flex flex-wrap items-center justify-between gap-2 rounded border p-2">
                  <div>
                    <Link href={`/campaigns/${run.campaign_id}`} className="font-medium text-primary underline">
                      {campaign?.name ?? "Unknown campaign"}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      Stage: {run.current_stage ?? "-"} • Leads: {run.leads_generated ?? 0} •{" "}
                      {run.run_mode === "custom" ? `${run.start_stage ?? "-"} -> ${run.end_stage ?? "-"}` : "full"} •{" "}
                      {new Date(run.started_at).toLocaleString()}
                    </p>
                  </div>
                  <Badge variant={run.status === "failed" ? "destructive" : "outline"}>{run.status}</Badge>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Observability</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Open the dedicated Runs page for live logs, event filters, and copy-friendly run IDs.
          </p>
          <Button asChild>
            <Link href="/runs">Go to Runs</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
