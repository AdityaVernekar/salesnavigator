import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DashboardPipelineTrigger } from "@/components/pipeline/dashboard-pipeline-trigger";
import { StatCards } from "@/components/pipeline/stat-cards";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

async function getDashboardData() {
  const [
    { count: leads },
    { count: emails },
    { count: campaigns },
    { count: activeRuns },
    campaignsResp,
    runsResp,
  ] = await Promise.all([
    supabaseServer.from("leads").select("*", { count: "exact", head: true }),
    supabaseServer.from("emails_sent").select("*", { count: "exact", head: true }),
    supabaseServer.from("campaigns").select("*", { count: "exact", head: true }),
    supabaseServer.from("pipeline_runs").select("*", { count: "exact", head: true }).eq("status", "running"),
    supabaseServer
      .from("campaigns")
      .select("id,name,leads_per_run,daily_send_limit")
      .order("created_at", { ascending: false }),
    supabaseServer
      .from("pipeline_runs")
      .select("id,campaign_id,status,current_stage,leads_generated,started_at,run_mode,start_stage,end_stage")
      .order("started_at", { ascending: false })
      .limit(8),
  ]);

  return {
    leads: leads ?? 0,
    emails: emails ?? 0,
    campaigns: campaigns ?? 0,
    activeRuns: activeRuns ?? 0,
    campaignOptions: campaignsResp.data ?? [],
    recentRuns: runsResp.data ?? [],
  };
}

export default async function HomePage() {
  const data = await getDashboardData();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
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
      />

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
