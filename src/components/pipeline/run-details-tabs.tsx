"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RunLogStream } from "@/components/pipeline/run-log-stream";
import { formatDateTimeUtc } from "@/lib/date-format";

type ObservedRun = {
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

export function RunDetailsTabs({
  observedRun,
  logs,
}: {
  observedRun: ObservedRun;
  logs: RunLog[];
}) {
  const [copied, setCopied] = useState(false);

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
          <p className="text-sm text-muted-foreground">Select a run to view live events.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Tabs defaultValue="events" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold">Selected Run</h2>
          <code className="truncate rounded bg-muted px-2 py-1 text-xs">{observedRun.id}</code>
          <Badge variant={observedRun.status === "failed" ? "destructive" : "outline"}>
            {observedRun.status ?? "-"}
          </Badge>
          <Badge variant="outline">stage {observedRun.current_stage ?? "-"}</Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={copyRunId}>
            {copied ? "Copied" : "Copy run_id"}
          </Button>
          <TabsList>
            <TabsTrigger value="events">Events</TabsTrigger>
            <TabsTrigger value="overview">Overview</TabsTrigger>
          </TabsList>
        </div>
      </div>

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
                {observedRun.start_stage ?? "-"} {"->"} {observedRun.end_stage ?? "-"}
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

