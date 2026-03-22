"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatDateTimeUtc } from "@/lib/date-format";

type RunRow = {
  id: string;
  campaign_id: string | null;
  status: string | null;
  current_stage: string | null;
  run_mode: string | null;
  start_stage: string | null;
  end_stage: string | null;
  leads_generated: number | null;
  leads_enriched: number | null;
  leads_scored: number | null;
  emails_sent: number | null;
  started_at: string;
};

type CampaignOption = {
  id: string;
  name: string;
};

export function RunsList({
  runs,
  campaigns,
  selectedRunId,
}: {
  runs: RunRow[];
  campaigns: CampaignOption[];
  selectedRunId?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [cancellingRunId, setCancellingRunId] = useState<string | null>(null);

  const campaignById = useMemo(() => new Map(campaigns.map((item) => [item.id, item.name])), [campaigns]);
  const statusValue = searchParams.get("status") ?? "all";
  const stageValue = searchParams.get("stage") ?? "all";
  const campaignValue = searchParams.get("campaignId") ?? "all";

  const statusOptions = ["running", "completed", "failed", "cancelled"];
  const stageOptions = ["queued", "lead_generation", "people_discovery", "enrichment", "company_research", "scoring", "email", "completed", "failed"];

  const updateQuery = (patch: Record<string, string>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (!value || value === "all") {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    }
    params.delete("runId");
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  };

  const copyText = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      window.setTimeout(() => {
        setCopiedKey((current) => (current === key ? null : current));
      }, 1000);
    } catch {
      setCopiedKey(null);
    }
  };

  const cancelRun = async (runId: string) => {
    setCancellingRunId(runId);
    try {
      const res = await fetch(`/api/pipeline/runs/${runId}/cancel`, {
        method: "POST",
      });
      if (res.ok) {
        router.refresh();
      }
    } finally {
      setCancellingRunId(null);
    }
  };

  return (
    <div className="space-y-3">
      <div className="grid gap-2 md:grid-cols-3">
        <Select value={campaignValue} onValueChange={(value) => updateQuery({ campaignId: value })}>
          <SelectTrigger>
            <SelectValue placeholder="Campaign" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All campaigns</SelectItem>
            {campaigns.map((campaign) => (
              <SelectItem key={campaign.id} value={campaign.id}>
                {campaign.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={statusValue} onValueChange={(value) => updateQuery({ status: value })}>
          <SelectTrigger>
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {statusOptions.map((status) => (
              <SelectItem key={status} value={status}>
                {status}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={stageValue} onValueChange={(value) => updateQuery({ stage: value })}>
          <SelectTrigger>
            <SelectValue placeholder="Stage" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All stages</SelectItem>
            {stageOptions.map((stage) => (
              <SelectItem key={stage} value={stage}>
                {stage}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        {runs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No runs found.</p>
        ) : (
          runs.map((run) => {
            const isSelected = selectedRunId === run.id;
            const campaignName =
              (run.campaign_id ? campaignById.get(run.campaign_id) : null) ?? "Unknown campaign";
            const modeSummary =
              run.run_mode === "custom" ? `${run.start_stage ?? "-"} -> ${run.end_stage ?? "-"}` : "full";
            return (
              <div key={run.id} className={`rounded border p-2 ${isSelected ? "border-primary" : ""}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <Link
                      href={`/runs?runId=${run.id}`}
                      className="font-medium text-primary underline"
                    >
                      {campaignName}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {formatDateTimeUtc(run.started_at)} • {modeSummary} • stage {run.current_stage ?? "-"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      leads {run.leads_generated ?? 0} / enriched {run.leads_enriched ?? 0} / scored{" "}
                      {run.leads_scored ?? 0} / sent {run.emails_sent ?? 0}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={run.status === "failed" ? "destructive" : "outline"}>{run.status ?? "-"}</Badge>
                    {run.status === "running" && (
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={cancellingRunId === run.id}
                        onClick={() => cancelRun(run.id)}
                      >
                        {cancellingRunId === run.id ? "Cancelling…" : "Cancel"}
                      </Button>
                    )}
                    <Button size="sm" variant="outline" onClick={() => copyText(`run-${run.id}`, run.id)}>
                      {copiedKey === `run-${run.id}` ? "Copied" : "Copy run_id"}
                    </Button>
                    {run.campaign_id ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => copyText(`campaign-${run.id}`, run.campaign_id as string)}
                      >
                        {copiedKey === `campaign-${run.id}` ? "Copied" : "Copy campaign_id"}
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
