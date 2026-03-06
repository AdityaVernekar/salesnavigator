"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabaseClient } from "@/lib/supabase/client";

interface RunLog {
  id: string | number;
  run_id?: string;
  agent_type?: string;
  level: string;
  message: string;
  metadata?: Record<string, unknown> | null;
  ts?: string;
}

interface PipelineRunStatus {
  status: string | null;
  currentStage: string | null;
}

function FormattedDate({ ts }: { ts: string }) {
  const formatted = useMemo(() => {
    const date = new Date(ts);
    if (Number.isNaN(date.getTime())) return ts;
    return new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
      timeZone: "UTC",
    }).format(date);
  }, [ts]);
  return <>{`• ${formatted}`}</>;
}

export function RunLogStream({
  logs,
  runId,
  initialRunStatus,
}: {
  logs: RunLog[];
  runId?: string;
  initialRunStatus?: PipelineRunStatus;
}) {
  const [realtimeLogs, setRealtimeLogs] = useState<RunLog[]>(logs);
  const [runStatus, setRunStatus] = useState<PipelineRunStatus>({
    status: initialRunStatus?.status ?? null,
    currentStage: initialRunStatus?.currentStage ?? null,
  });
  const [streamMode, setStreamMode] = useState<"sse" | "supabase" | "snapshot">("snapshot");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [eventFilter, setEventFilter] = useState<"all" | "agent_events" | "tool_calls" | "errors">("all");

  useEffect(() => {
    setRealtimeLogs(logs);
  }, [logs]);

  useEffect(() => {
    setRunStatus({
      status: initialRunStatus?.status ?? null,
      currentStage: initialRunStatus?.currentStage ?? null,
    });
  }, [initialRunStatus?.currentStage, initialRunStatus?.status]);

  useEffect(() => {
    if (!runId) return undefined;
    let disposed = false;
    let hasSnapshot = false;
    const seenIds = new Set((logs ?? []).map((log) => String(log.id)));
    const source = new EventSource(`/api/run-logs/${runId}`);
    const fallbackTimer = window.setTimeout(() => {
      if (!hasSnapshot && !disposed) {
        source.close();
        setStreamMode("supabase");
      }
    }, 4000);

    source.onmessage = (event) => {
      if (disposed) return;
      const payload = JSON.parse(event.data) as
        | {
            type: "snapshot";
            logs: RunLog[];
            runStatus?: PipelineRunStatus;
          }
        | {
            type: "log";
            log: RunLog;
          }
        | {
            type: "status";
            status: string | null;
            currentStage: string | null;
          };

      if (payload.type === "snapshot") {
        hasSnapshot = true;
        setStreamMode("sse");
        setRealtimeLogs((payload.logs ?? []).slice().reverse().slice(0, 50));
        if (payload.runStatus) {
          setRunStatus({
            status: payload.runStatus.status ?? null,
            currentStage: payload.runStatus.currentStage ?? null,
          });
        }
        for (const log of payload.logs ?? []) {
          seenIds.add(String(log.id));
        }
      }

      if (payload.type === "log" && payload.log) {
        const id = String(payload.log.id);
        if (seenIds.has(id)) return;
        seenIds.add(id);
        setRealtimeLogs((prev) => [payload.log, ...prev].slice(0, 50));
      }

      if (payload.type === "status") {
        setRunStatus({
          status: payload.status ?? null,
          currentStage: payload.currentStage ?? null,
        });
      }
    };

    source.onerror = () => {
      if (disposed) return;
      source.close();
      setStreamMode("supabase");
    };

    return () => {
      disposed = true;
      window.clearTimeout(fallbackTimer);
      source.close();
    };
  }, [runId, logs]);

  useEffect(() => {
    if (!runId || streamMode !== "supabase") return undefined;
    const channel = supabaseClient
      .channel(`run-observability-${runId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "run_logs",
          filter: `run_id=eq.${runId}`,
        },
        (payload) => {
          const log = payload.new as RunLog;
          setRealtimeLogs((prev) => [log, ...prev].slice(0, 50));
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "pipeline_runs",
          filter: `id=eq.${runId}`,
        },
        (payload) => {
          const nextRun = payload.new as { status?: string; current_stage?: string };
          setRunStatus({
            status: nextRun.status ?? null,
            currentStage: nextRun.current_stage ?? null,
          });
        },
      )
      .subscribe();

    return () => {
      void supabaseClient.removeChannel(channel);
    };
  }, [runId, streamMode]);

  const metadataPreview = (metadata: Record<string, unknown> | null | undefined) => {
    if (!metadata) return null;
    const interestingKeys = [
      "eventType",
      "toolName",
      "durationMs",
      "workflowStatus",
      "runConfiguredLeadTarget",
      "runConfiguredContactCap",
      "runConfiguredSendCap",
      "renderMode",
      "testModeEnabled",
      "testRecipientCount",
      "originalRecipient",
      "effectiveRecipients",
      "deliveryMode",
      "argsPreview",
      "resultPreview",
      "reasoningPreview",
    ];
    const parts: string[] = [];
    for (const key of interestingKeys) {
      if (!(key in metadata)) continue;
      const value = metadata[key];
      if (value === null || value === undefined) continue;
      parts.push(`${key}: ${String(value)}`);
    }
    return parts.slice(0, 3).join(" • ");
  };

  const copyText = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      window.setTimeout(() => {
        setCopiedKey((current) => (current === key ? null : current));
      }, 1200);
    } catch {
      setCopiedKey(null);
    }
  };

  const prettifyMetadata = (metadata: Record<string, unknown> | null | undefined) => {
    if (!metadata) return "";
    return JSON.stringify(metadata, null, 2);
  };

  const filteredLogs = useMemo(() => {
    if (eventFilter === "all") return realtimeLogs;
    if (eventFilter === "errors") {
      return realtimeLogs.filter((log) => log.level === "error");
    }
    if (eventFilter === "tool_calls") {
      return realtimeLogs.filter((log) => {
        const toolName = log.metadata?.toolName;
        if (toolName) return true;
        return log.message.startsWith("Tool call:") || log.message.startsWith("Tool result:");
      });
    }
    return realtimeLogs.filter((log) => {
      const eventType = log.metadata?.eventType;
      if (eventType) return true;
      return log.message.startsWith("Stage worker event:") || log.message.includes("Agent stream");
    });
  }, [eventFilter, realtimeLogs]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Run Logs</CardTitle>
      </CardHeader>
      <CardContent>
        {runId ? (
          <div className="mb-3 rounded border p-2 text-xs">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <Badge variant="outline">Run</Badge>
              <code className="rounded bg-muted px-1.5 py-0.5">{runId}</code>
              <Button size="sm" variant="outline" onClick={() => copyText("run-id", runId)}>
                {copiedKey === "run-id" ? "Copied" : "Copy run_id"}
              </Button>
            </div>
            <div className="text-muted-foreground">
              Status: {runStatus.status ?? "-"} • Stage: {runStatus.currentStage ?? "-"} • Live mode: {streamMode}
            </div>
          </div>
        ) : null}
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Button size="sm" variant={eventFilter === "all" ? "default" : "outline"} onClick={() => setEventFilter("all")}>
            All
          </Button>
          <Button
            size="sm"
            variant={eventFilter === "agent_events" ? "default" : "outline"}
            onClick={() => setEventFilter("agent_events")}
          >
            Agent events
          </Button>
          <Button
            size="sm"
            variant={eventFilter === "tool_calls" ? "default" : "outline"}
            onClick={() => setEventFilter("tool_calls")}
          >
            Tool calls
          </Button>
          <Button
            size="sm"
            variant={eventFilter === "errors" ? "default" : "outline"}
            onClick={() => setEventFilter("errors")}
          >
            Errors
          </Button>
          <span className="text-xs text-muted-foreground">Showing {filteredLogs.length} events</span>
        </div>
        <div className="space-y-2">
          {filteredLogs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No logs yet.</p>
          ) : (
            filteredLogs.map((log) => (
              <div key={log.id} className="rounded border p-2 text-sm">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{log.agent_type ?? "pipeline"}</Badge>
                  <span className="font-medium">{log.message}</span>
                </div>
                <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>
                    log_id: <code>{String(log.id)}</code>
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => copyText(`log-id-${String(log.id)}`, String(log.id))}
                  >
                    {copiedKey === `log-id-${String(log.id)}` ? "Copied" : "Copy log_id"}
                  </Button>
                  {log.run_id ? (
                    <>
                      <span>
                        run_id: <code>{log.run_id}</code>
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => copyText(`row-run-id-${String(log.id)}`, log.run_id as string)}
                      >
                        {copiedKey === `row-run-id-${String(log.id)}` ? "Copied" : "Copy row run_id"}
                      </Button>
                    </>
                  ) : null}
                </div>
                {metadataPreview(log.metadata) ? (
                  <div className="text-xs text-muted-foreground">{metadataPreview(log.metadata)}</div>
                ) : null}
                {log.metadata ? (
                  <details className="mt-1">
                    <summary className="cursor-pointer text-xs text-muted-foreground">View metadata JSON</summary>
                    <div className="mt-1 space-y-1">
                      <pre className="max-h-40 overflow-auto rounded bg-muted p-2 text-xs">
                        {prettifyMetadata(log.metadata)}
                      </pre>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          copyText(
                            `metadata-${String(log.id)}`,
                            JSON.stringify(log.metadata),
                          )
                        }
                      >
                        {copiedKey === `metadata-${String(log.id)}` ? "Copied" : "Copy metadata"}
                      </Button>
                    </div>
                  </details>
                ) : null}
                <div className="text-xs text-muted-foreground">
                  {log.level} {log.ts ? <FormattedDate ts={log.ts} /> : null}
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
