"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ContactsTable, type ContactRow } from "@/components/contacts/contacts-table";
import { RunPipelineFromContactsDialog } from "@/components/contacts/run-pipeline-from-contacts-dialog";
import type { ExecutablePipelineStage } from "@/lib/pipeline/stages";

export function ContactsTableShell({ rows }: { rows: ContactRow[] }) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [runDialogOpen, setRunDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runPipelineOnSelection = async (
    startStage: ExecutablePipelineStage,
    endStage: ExecutablePipelineStage,
  ) => {
    const contactIds = Array.from(selectedIds);
    if (!contactIds.length) return;
    setIsSubmitting(true);
    setError(null);
    setFeedback(null);
    try {
      const res = await fetch("/api/pipeline/trigger-from-contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactIds, startStage, endStage }),
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
        `Pipeline queued for ${contactIds.length} contact(s)${data.runId ? `. Run: ${String(data.runId).slice(0, 8)}…` : ""}`,
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
            {selectedCount} contact{selectedCount !== 1 ? "s" : ""} selected
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
      <ContactsTable
        rows={rows}
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
      />
      <RunPipelineFromContactsDialog
        open={runDialogOpen}
        onOpenChange={setRunDialogOpen}
        contactCount={selectedCount}
        isSubmitting={isSubmitting}
        onSubmit={runPipelineOnSelection}
      />
    </div>
  );
}
