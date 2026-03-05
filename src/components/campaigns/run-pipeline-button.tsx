"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PipelineRunConfigDialog } from "@/components/pipeline/pipeline-run-config-dialog";
import { Button } from "@/components/ui/button";
import { EXECUTABLE_PIPELINE_STAGES } from "@/lib/pipeline/stages";
import type { PipelineRunConfig } from "@/lib/pipeline/run-config";

type RunPipelineButtonProps = {
  campaignId: string;
  label?: string;
  defaultLeadTarget?: number;
  defaultEmailSendLimit?: number;
};

export function RunPipelineButton({
  campaignId,
  label = "Run Pipeline",
  defaultLeadTarget = 20,
  defaultEmailSendLimit = 50,
}: RunPipelineButtonProps) {
  const router = useRouter();
  const [isRunning, setIsRunning] = useState(false);
  const [isRunConfigOpen, setIsRunConfigOpen] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runPipeline = async (runConfig: PipelineRunConfig) => {
    setIsRunning(true);
    setFeedback(null);
    setError(null);
    try {
      const response = await fetch("/api/pipeline/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId, runConfig }),
      });
      const data = (await response.json()) as {
        ok: boolean;
        queued?: boolean;
        runId?: string;
        error?: string;
      };

      if (!response.ok || !data.ok) {
        throw new Error(data.error ?? "Failed to trigger pipeline run.");
      }

      setFeedback(
        `Pipeline queued successfully${data.runId ? ` (run ${data.runId.slice(0, 8)}...)` : ""}.`,
      );
      setIsRunConfigOpen(false);
      router.refresh();
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : "Failed to trigger pipeline run.");
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="space-y-2">
      <Button onClick={() => setIsRunConfigOpen(true)} disabled={isRunning}>
        {isRunning ? "Running..." : label}
      </Button>
      {feedback ? <p className="text-sm text-emerald-600">{feedback}</p> : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <PipelineRunConfigDialog
        key={`${campaignId}:${defaultLeadTarget}:${defaultEmailSendLimit}`}
        open={isRunConfigOpen}
        onOpenChange={setIsRunConfigOpen}
        selectedStages={[...EXECUTABLE_PIPELINE_STAGES]}
        defaultLeadTarget={defaultLeadTarget}
        defaultEmailSendLimit={defaultEmailSendLimit}
        isSubmitting={isRunning}
        onSubmit={runPipeline}
      />
    </div>
  );
}
