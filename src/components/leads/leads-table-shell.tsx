"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LeadsTable, type LeadRow } from "@/components/leads/leads-table";
import { RunPipelineFromLeadsDialog } from "@/components/leads/run-pipeline-from-leads-dialog";
import { Button } from "@/components/ui/button";

export function LeadsTableShell({ rows }: { rows: LeadRow[] }) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [runDialogOpen, setRunDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runPipelineOnSelection = async (
    startStage:
      | "lead_generation"
      | "people_discovery"
      | "enrichment"
      | "scoring"
      | "email",
    endStage:
      | "lead_generation"
      | "people_discovery"
      | "enrichment"
      | "scoring"
      | "email",
  ) => {
    const leadIds = Array.from(selectedIds);
    if (!leadIds.length) return;
    setIsSubmitting(true);
    setError(null);
    setFeedback(null);
    try {
      const res = await fetch("/api/pipeline/trigger-from-leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadIds, startStage, endStage }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        runId?: string;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Failed to queue pipeline run.");
      }
      setFeedback(
        `Pipeline queued for ${leadIds.length} lead(s)${data.runId ? `. Run: ${String(data.runId).slice(0, 8)}…` : ""}`,
      );
      setSelectedIds(new Set());
      if (data.runId) {
        router.push(`/runs?runId=${data.runId}`);
      } else {
        router.refresh();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to run pipeline.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedCount = selectedIds.size;

  return (
    <div className="space-y-3">
      {selectedCount > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/50 px-3 py-2">
          <span className="text-sm font-medium">
            {selectedCount} lead{selectedCount !== 1 ? "s" : ""} selected
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelectedIds(new Set())}
              disabled={isSubmitting}
            >
              Clear selection
            </Button>
            <Button
              size="sm"
              onClick={() => setRunDialogOpen(true)}
              disabled={isSubmitting}
            >
              Run pipeline
            </Button>
          </div>
        </div>
      ) : null}
      {feedback ? (
        <p className="text-sm text-emerald-600">{feedback}</p>
      ) : error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : null}
      <LeadsTable
        rows={rows}
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
      />
      <RunPipelineFromLeadsDialog
        open={runDialogOpen}
        onOpenChange={setRunDialogOpen}
        leadCount={selectedCount}
        isSubmitting={isSubmitting}
        onSubmit={runPipelineOnSelection}
      />
    </div>
  );
}
