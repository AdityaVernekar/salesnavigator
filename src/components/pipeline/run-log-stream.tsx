"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

const METADATA_DISPLAY_KEYS = [
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
] as const;

function MetadataPreview({
  metadata,
  logId,
  copiedKey,
  onCopy,
}: {
  metadata: Record<string, unknown>;
  logId: string;
  copiedKey: string | null;
  onCopy: (key: string, value: string) => void;
}) {
  const pairs: Array<{ key: string; value: string }> = [];
  for (const key of METADATA_DISPLAY_KEYS) {
    if (!(key in metadata)) continue;
    const value = metadata[key];
    if (value === null || value === undefined) continue;
    const strValue =
      typeof value === "object" ? JSON.stringify(value) : String(value);
    pairs.push({ key, value: strValue });
  }

  if (pairs.length === 0) return null;

  const toolName =
    typeof metadata.toolName === "string" ? metadata.toolName : null;
  const hasToolOutput =
    toolName &&
    (typeof metadata.resultPreview === "string" ||
      typeof metadata.argsPreview === "string");

  return (
    <div className="mt-1 space-y-1">
      <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
        {pairs.slice(0, 5).map((pair) => (
          <div key={pair.key} className="contents">
            <span className="text-muted-foreground font-mono">{pair.key}</span>
            <span className="truncate text-muted-foreground" title={pair.value}>
              {pair.value.length > 120
                ? `${pair.value.slice(0, 120)}…`
                : pair.value}
            </span>
          </div>
        ))}
      </div>
      {hasToolOutput && (
        <Button
          size="sm"
          variant="outline"
          className="h-6 text-xs"
          onClick={() =>
            onCopy(
              `tool-output-${logId}`,
              typeof metadata.resultPreview === "string"
                ? metadata.resultPreview
                : JSON.stringify(metadata),
            )
          }
        >
          {copiedKey === `tool-output-${logId}` ? "Copied!" : "Copy output"}
        </Button>
      )}
    </div>
  );
}

function extractEntityId(
  metadata: Record<string, unknown> | null | undefined,
): { type: "contact" | "lead"; id: string; label: string } | null {
  if (!metadata) return null;
  const contactId = metadata.contactId ?? metadata.contact_id;
  if (typeof contactId === "string" && contactId) {
    const email =
      typeof metadata.originalRecipient === "string"
        ? metadata.originalRecipient
        : typeof metadata.contactEmail === "string"
          ? metadata.contactEmail
          : null;
    return {
      type: "contact",
      id: contactId,
      label: email ?? contactId.slice(0, 8),
    };
  }
  const leadId = metadata.leadId ?? metadata.lead_id;
  if (typeof leadId === "string" && leadId) {
    const company =
      typeof metadata.companyName === "string" ? metadata.companyName : null;
    return {
      type: "lead",
      id: leadId,
      label: company ?? leadId.slice(0, 8),
    };
  }
  return null;
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
  const [streamMode, setStreamMode] = useState<
    "sse" | "supabase" | "snapshot"
  >("snapshot");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [eventFilter, setEventFilter] = useState<
    "all" | "agent_events" | "tool_calls" | "errors"
  >("all");
  const [entityFilter, setEntityFilter] = useState<string>("all");

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
        setRealtimeLogs(
          (payload.logs ?? [])
            .slice()
            .reverse()
            .slice(0, 50),
        );
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
          const nextRun = payload.new as {
            status?: string;
            current_stage?: string;
          };
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

  // Extract unique contact/lead entities for grouping filter
  const entityOptions = useMemo(() => {
    const seen = new Map<string, { type: "contact" | "lead"; label: string }>();
    for (const log of realtimeLogs) {
      const entity = extractEntityId(log.metadata);
      if (entity && !seen.has(entity.id)) {
        seen.set(entity.id, { type: entity.type, label: entity.label });
      }
    }
    return Array.from(seen.entries()).map(([id, info]) => ({
      id,
      ...info,
    }));
  }, [realtimeLogs]);

  const filteredLogs = useMemo(() => {
    let result = realtimeLogs;

    // Event type filter
    if (eventFilter === "errors") {
      result = result.filter((log) => log.level === "error");
    } else if (eventFilter === "tool_calls") {
      result = result.filter((log) => {
        const toolName = log.metadata?.toolName;
        if (toolName) return true;
        return (
          log.message.startsWith("Tool call:") ||
          log.message.startsWith("Tool result:")
        );
      });
    } else if (eventFilter === "agent_events") {
      result = result.filter((log) => {
        const eventType = log.metadata?.eventType;
        if (eventType) return true;
        return (
          log.message.startsWith("Stage worker event:") ||
          log.message.includes("Agent stream")
        );
      });
    }

    // Entity (contact/lead) filter
    if (entityFilter !== "all") {
      result = result.filter((log) => {
        const entity = extractEntityId(log.metadata);
        return entity?.id === entityFilter;
      });
    }

    return result;
  }, [eventFilter, entityFilter, realtimeLogs]);

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle>Recent Run Logs</CardTitle>
      </CardHeader>
      <CardContent className="min-w-0">
        {runId ? (
          <div className="mb-3 overflow-hidden rounded border p-2 text-xs">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <Badge variant="outline">Run</Badge>
              <code className="max-w-[240px] truncate rounded bg-muted px-1.5 py-0.5">
                {runId}
              </code>
              <Button
                size="sm"
                variant="outline"
                className="h-6 text-xs"
                onClick={() => copyText("run-id", runId)}
              >
                {copiedKey === "run-id" ? "Copied" : "Copy run_id"}
              </Button>
            </div>
            <div className="text-muted-foreground">
              Status: {runStatus.status ?? "-"} • Stage:{" "}
              {runStatus.currentStage ?? "-"} • Live mode: {streamMode}
            </div>
          </div>
        ) : null}

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant={eventFilter === "all" ? "default" : "outline"}
            onClick={() => setEventFilter("all")}
          >
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

          {entityOptions.length > 0 && (
            <Select value={entityFilter} onValueChange={setEntityFilter}>
              <SelectTrigger className="h-8 w-[180px] text-xs">
                <SelectValue placeholder="All contacts/leads" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All contacts/leads</SelectItem>
                {entityOptions.map((entity) => (
                  <SelectItem key={entity.id} value={entity.id}>
                    {entity.type === "contact" ? "👤" : "🏢"} {entity.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <span className="text-xs text-muted-foreground">
            Showing {filteredLogs.length} events
          </span>
        </div>

        <div className="space-y-2">
          {filteredLogs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No logs yet.</p>
          ) : (
            filteredLogs.map((log) => {
              const toolName =
                typeof log.metadata?.toolName === "string"
                  ? log.metadata.toolName
                  : null;
              const logIdStr = String(log.id);

              return (
                <div
                  key={log.id}
                  className="min-w-0 overflow-hidden rounded border p-2 text-sm"
                >
                  <div className="mb-1 flex min-w-0 flex-wrap items-center gap-2">
                    <Badge variant="outline">
                      {log.agent_type ?? "pipeline"}
                    </Badge>
                    {toolName && (
                      <Badge variant="secondary" className="text-xs">
                        {toolName}
                      </Badge>
                    )}
                    <span className="min-w-0 wrap-break-word font-medium">
                      {log.message}
                    </span>
                  </div>

                  <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>
                      log_id:{" "}
                      <code className="max-w-[100px] truncate">{logIdStr}</code>
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-5 px-1.5 text-[10px]"
                      onClick={() => copyText(`log-id-${logIdStr}`, logIdStr)}
                    >
                      {copiedKey === `log-id-${logIdStr}` ? "Copied" : "Copy"}
                    </Button>
                    {log.level} {log.ts ? <FormattedDate ts={log.ts} /> : null}
                  </div>

                  {log.metadata && (
                    <MetadataPreview
                      metadata={log.metadata}
                      logId={logIdStr}
                      copiedKey={copiedKey}
                      onCopy={copyText}
                    />
                  )}

                  {log.metadata ? (
                    <details className="mt-1">
                      <summary className="cursor-pointer text-xs text-muted-foreground">
                        View full metadata
                      </summary>
                      <div className="mt-1 space-y-1">
                        <pre className="max-h-80 overflow-auto rounded bg-muted p-2 text-xs">
                          {JSON.stringify(log.metadata, null, 2)}
                        </pre>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 text-xs"
                          onClick={() =>
                            copyText(
                              `metadata-${logIdStr}`,
                              JSON.stringify(log.metadata, null, 2),
                            )
                          }
                        >
                          {copiedKey === `metadata-${logIdStr}`
                            ? "Copied!"
                            : "Copy metadata"}
                        </Button>
                      </div>
                    </details>
                  ) : null}
                </div>
              );
            })
          )}
        </div>
      </CardContent>
    </Card>
  );
}
