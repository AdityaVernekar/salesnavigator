import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RunsList } from "@/components/pipeline/runs-list";
import { RunDetailsTabs } from "@/components/pipeline/run-details-tabs";
import { requireCurrentUserCompany } from "@/lib/auth/user-company";

export const dynamic = "force-dynamic";

type SearchParams = {
  runId?: string;
  campaignId?: string;
  status?: string;
  stage?: string;
};

async function getRunsPageData(searchParams: SearchParams) {
  const { supabase, companyId } = await requireCurrentUserCompany();
  let runsQuery = supabase
    .from("pipeline_runs")
    .select(
      "id,campaign_id,status,current_stage,run_mode,start_stage,end_stage,leads_generated,leads_enriched,leads_scored,emails_sent,started_at",
    )
    .eq("company_id", companyId)
    .order("started_at", { ascending: false })
    .limit(100);

  if (searchParams.campaignId) {
    runsQuery = runsQuery.eq("campaign_id", searchParams.campaignId);
  }
  if (searchParams.status) {
    runsQuery = runsQuery.eq("status", searchParams.status);
  }
  if (searchParams.stage) {
    runsQuery = runsQuery.eq("current_stage", searchParams.stage);
  }

  const [{ data: runs }, { data: campaigns }] = await Promise.all([
    runsQuery,
    supabase.from("campaigns").select("id,name").eq("company_id", companyId).order("created_at", { ascending: false }),
  ]);

  let observedRun =
    runs?.find((run) => run.id === searchParams.runId) ??
    runs?.find((run) => run.status === "running") ??
    runs?.[0] ??
    null;

  if (!observedRun && searchParams.runId) {
    const { data: runById } = await supabase
      .from("pipeline_runs")
      .select(
        "id,campaign_id,status,current_stage,run_mode,start_stage,end_stage,leads_generated,leads_enriched,leads_scored,emails_sent,started_at",
      )
      .eq("company_id", companyId)
      .eq("id", searchParams.runId)
      .maybeSingle();
    observedRun = runById ?? null;
  }

  const logs = observedRun
    ? (
        await supabase
          .from("run_logs")
          .select("*")
          .eq("company_id", companyId)
          .eq("run_id", observedRun.id)
          .order("ts", { ascending: false })
          .limit(50)
      ).data ?? []
    : [];

  return {
    runs: runs ?? [],
    campaigns: (campaigns ?? []).map((campaign) => ({
      id: campaign.id,
      name: campaign.name ?? "Untitled campaign",
    })),
    observedRun,
    logs,
  };
}

export default async function RunsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const resolved = await searchParams;
  const data = await getRunsPageData({
    runId: resolved.runId?.trim() || undefined,
    campaignId: resolved.campaignId?.trim() || undefined,
    status: resolved.status?.trim() || undefined,
    stage: resolved.stage?.trim() || undefined,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Runs</h1>
        <p className="text-sm text-muted-foreground">Live observability for pipeline runs and agent activity.</p>
      </div>

      <RunDetailsTabs observedRun={data.observedRun} logs={data.logs} />

      <Card>
        <CardHeader>
          <CardTitle>Pipeline Runs</CardTitle>
        </CardHeader>
        <CardContent>
          <RunsList runs={data.runs} campaigns={data.campaigns} selectedRunId={data.observedRun?.id} />
        </CardContent>
      </Card>
    </div>
  );
}
