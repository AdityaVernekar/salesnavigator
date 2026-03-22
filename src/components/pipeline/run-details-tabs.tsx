"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RunLogStream } from "@/components/pipeline/run-log-stream";
import { formatDateTimeUtc } from "@/lib/date-format";

const STAGE_LABELS: Record<string, string> = {
  lead_generation: "Lead Gen",
  people_discovery: "People",
  enrichment: "Enrichment",
  company_research: "Research",
  scoring: "Scoring",
  email: "Email",
};

const ORDERED_STAGES = [
  "lead_generation",
  "people_discovery",
  "enrichment",
  "company_research",
  "scoring",
  "email",
] as const;

type StageStatus = "completed" | "running" | "pending" | "skipped";

function deriveStageStatus(
  stage: string,
  currentStage: string | null,
  runStatus: string | null,
  selectedStages: string[] | null,
): StageStatus {
  const selected = selectedStages ?? [...ORDERED_STAGES];
  if (!selected.includes(stage)) return "skipped";

  const stageIdx = ORDERED_STAGES.indexOf(
    stage as (typeof ORDERED_STAGES)[number],
  );
  const currentIdx =
    currentStage && currentStage !== "queued" && currentStage !== "completed" && currentStage !== "failed"
      ? ORDERED_STAGES.indexOf(
          currentStage as (typeof ORDERED_STAGES)[number],
        )
      : -1;

  if (currentStage === "completed" || currentStage === "failed") {
    if (runStatus === "completed" || runStatus === "failed") {
      return selected.includes(stage) ? "completed" : "skipped";
    }
  }

  if (currentIdx === -1) return "pending";
  if (stageIdx < currentIdx) return "completed";
  if (stageIdx === currentIdx) return "running";
  return "pending";
}

type ObservedRun = {
  id: string;
  campaign_id: string | null;
  status: string | null;
  current_stage: string | null;
  run_mode: string | null;
  start_stage: string | null;
  end_stage: string | null;
  selected_stages?: string[] | null;
  leads_generated: number | null;
  leads_enriched: number | null;
  leads_scored: number | null;
  emails_sent: number | null;
  started_at: string;
} | null;

type RunLog = {
  id: string | number;
  run_id?: string;
  agent_type?: string;
  level: string;
  message: string;
  metadata?: Record<string, unknown> | null;
  ts?: string;
};

function StageProgressBar({
  run,
}: {
  run: NonNullable<ObservedRun>;
}) {
  const router = useRouter();
  const [skippingStage, setSkippingStage] = useState<string | null>(null);
  const selectedStages = Array.isArray(run.selected_stages)
    ? (run.selected_stages as string[])
    : null;

  async function handleSkip(stage: string) {
    setSkippingStage(stage);
    try {
      const res = await fetch(`/api/pipeline/runs/${run.id}/skip-stage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage }),
      });
      if (res.ok) {
        router.refresh();
      }
    } finally {
      setSkippingStage(null);
    }
  }

  return (
    <div className="flex items-center gap-1 overflow-x-auto py-2">
      {ORDERED_STAGES.map((stage, idx) => {
        const status = deriveStageStatus(
          stage,
          run.current_stage,
          run.status,
          selectedStages,
        );
        const isLast = idx === ORDERED_STAGES.length - 1;
        const canSkip = status === "pending" && run.status === "running";

        return (
          <div key={stage} className="flex items-center gap-1">
            <div className="flex flex-col items-center gap-1">
              <div
                className={`rounded-full px-3 py-1 text-xs font-medium whitespace-nowrap ${
                  status === "completed"
                    ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                    : status === "running"
                      ? "bg-blue-100 text-blue-800 animate-pulse dark:bg-blue-900 dark:text-blue-200"
                      : status === "skipped"
                        ? "bg-muted text-muted-foreground line-through"
                        : "bg-muted text-muted-foreground"
                }`}
              >
                {STAGE_LABELS[stage] ?? stage}
              </div>
              {canSkip && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-5 px-1.5 text-[10px] text-muted-foreground hover:text-destructive"
                  disabled={skippingStage === stage}
                  onClick={() => handleSkip(stage)}
                >
                  {skippingStage === stage ? "Skipping…" : "Skip"}
                </Button>
              )}
            </div>
            {!isLast && (
              <span className="text-muted-foreground text-xs">→</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function RunDetailsTabs({
  observedRun,
  logs,
}: {
  observedRun: ObservedRun;
  logs: RunLog[];
}) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const cancelRun = async () => {
    if (!observedRun?.id) return;
    setCancelling(true);
    try {
      const res = await fetch(
        `/api/pipeline/runs/${observedRun.id}/cancel`,
        { method: "POST" },
      );
      if (res.ok) {
        router.refresh();
      }
    } finally {
      setCancelling(false);
    }
  };

  const copyRunId = async () => {
    if (!observedRun?.id) return;
    try {
      await navigator.clipboard.writeText(observedRun.id);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1000);
    } catch {
      setCopied(false);
    }
  };

  if (!observedRun) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Run Details</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Select a run to view live events.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Tabs defaultValue="events" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold">Selected Run</h2>
          <code className="max-w-[240px] truncate rounded bg-muted px-2 py-1 text-xs">
            {observedRun.id}
          </code>
          <Badge
            variant={
              observedRun.status === "failed" ? "destructive" : "outline"
            }
          >
            {observedRun.status ?? "-"}
          </Badge>
          <Badge variant="outline">
            stage {observedRun.current_stage ?? "-"}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={copyRunId}>
            {copied ? "Copied" : "Copy run_id"}
          </Button>
          {observedRun.status === "running" && (
            <Button
              size="sm"
              variant="destructive"
              disabled={cancelling}
              onClick={cancelRun}
            >
              {cancelling ? "Cancelling…" : "Cancel Run"}
            </Button>
          )}
          <TabsList>
            <TabsTrigger value="events">Events</TabsTrigger>
            <TabsTrigger value="overview">Overview</TabsTrigger>
          </TabsList>
        </div>
      </div>

      <StageProgressBar run={observedRun} />

      <TabsContent value="events">
        <RunLogStream
          logs={logs}
          runId={observedRun.id}
          initialRunStatus={{
            status: observedRun.status ?? null,
            currentStage: observedRun.current_stage ?? null,
          }}
        />
      </TabsContent>

      <TabsContent value="overview">
        <Card>
          <CardHeader>
            <CardTitle>Run Overview</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm md:grid-cols-2">
            <div className="rounded border p-2">
              <p className="text-xs text-muted-foreground">Started</p>
              <p>{formatDateTimeUtc(observedRun.started_at)}</p>
            </div>
            <div className="rounded border p-2">
              <p className="text-xs text-muted-foreground">Mode</p>
              <p>{observedRun.run_mode ?? "-"}</p>
            </div>
            <div className="rounded border p-2">
              <p className="text-xs text-muted-foreground">Stage range</p>
              <p>
                {observedRun.start_stage ?? "-"} {"->"}{" "}
                {observedRun.end_stage ?? "-"}
              </p>
            </div>
            <div className="rounded border p-2">
              <p className="text-xs text-muted-foreground">Campaign</p>
              <p>{observedRun.campaign_id ?? "-"}</p>
            </div>
            <div className="rounded border p-2">
              <p className="text-xs text-muted-foreground">Leads generated</p>
              <p>{observedRun.leads_generated ?? 0}</p>
            </div>
            <div className="rounded border p-2">
              <p className="text-xs text-muted-foreground">Leads enriched</p>
              <p>{observedRun.leads_enriched ?? 0}</p>
            </div>
            <div className="rounded border p-2">
              <p className="text-xs text-muted-foreground">Leads scored</p>
              <p>{observedRun.leads_scored ?? 0}</p>
            </div>
            <div className="rounded border p-2">
              <p className="text-xs text-muted-foreground">Emails sent</p>
              <p>{observedRun.emails_sent ?? 0}</p>
            </div>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
