"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { PipelineRunConfigDialog } from "@/components/pipeline/pipeline-run-config-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EXECUTABLE_PIPELINE_STAGES } from "@/lib/pipeline/stages";
import type { PipelineRunConfig } from "@/lib/pipeline/run-config";

type CampaignOption = {
  id: string;
  name: string;
  leads_per_run: number | null;
  daily_send_limit: number | null;
};

export function DashboardPipelineTrigger({ campaigns }: { campaigns: CampaignOption[] }) {
  const router = useRouter();
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>(campaigns[0]?.id ?? "");
  const [runMode, setRunMode] = useState<"full" | "custom">("full");
  const [startStage, setStartStage] = useState<(typeof EXECUTABLE_PIPELINE_STAGES)[number]>("lead_generation");
  const [endStage, setEndStage] = useState<(typeof EXECUTABLE_PIPELINE_STAGES)[number]>("email");
  const [isRunning, setIsRunning] = useState(false);
  const [isRunConfigOpen, setIsRunConfigOpen] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const selectedCampaign = useMemo(
    () => campaigns.find((campaign) => campaign.id === selectedCampaignId),
    [campaigns, selectedCampaignId],
  );
  const selectedStagesSummary = useMemo(() => {
    if (runMode === "full") return "Running: full pipeline";
    const startIdx = EXECUTABLE_PIPELINE_STAGES.indexOf(startStage);
    const endIdx = EXECUTABLE_PIPELINE_STAGES.indexOf(endStage);
    const from = Math.min(startIdx, endIdx);
    const to = Math.max(startIdx, endIdx);
    return `Running: ${EXECUTABLE_PIPELINE_STAGES[from]} -> ${EXECUTABLE_PIPELINE_STAGES[to]}`;
  }, [runMode, startStage, endStage]);
  const selectedStages = useMemo(() => {
    if (runMode === "full") return [...EXECUTABLE_PIPELINE_STAGES];
    const startIdx = EXECUTABLE_PIPELINE_STAGES.indexOf(startStage);
    const endIdx = EXECUTABLE_PIPELINE_STAGES.indexOf(endStage);
    const from = Math.min(startIdx, endIdx);
    const to = Math.max(startIdx, endIdx);
    return EXECUTABLE_PIPELINE_STAGES.slice(from, to + 1);
  }, [runMode, startStage, endStage]);

  const runPipeline = async (runConfig: PipelineRunConfig) => {
    if (!selectedCampaignId) return;
    setIsRunning(true);
    setFeedback(null);
    setError(null);

    try {
      const response = await fetch("/api/pipeline/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId: selectedCampaignId,
          runMode,
          ...(runMode === "custom" ? { startStage, endStage } : {}),
          runConfig,
        }),
      });
      const data = (await response.json()) as {
        ok: boolean;
        queued?: boolean;
        runId?: string;
        error?: string;
      };

      if (!response.ok || !data.ok) {
        throw new Error(data.error ?? "Failed to start pipeline run.");
      }

      setFeedback(
        `Run queued for ${selectedCampaign?.name ?? "campaign"}${data.runId ? ` (run ${data.runId.slice(0, 8)}...)` : ""}. ${selectedStagesSummary}`,
      );
      setIsRunConfigOpen(false);
      router.refresh();
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : "Failed to start pipeline run.");
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={selectedCampaignId} onValueChange={setSelectedCampaignId} disabled={!campaigns.length || isRunning}>
          <SelectTrigger className="w-[240px]">
            <SelectValue placeholder="Select campaign" />
          </SelectTrigger>
          <SelectContent>
            {campaigns.map((campaign) => (
              <SelectItem key={campaign.id} value={campaign.id}>
                {campaign.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={() => setIsRunConfigOpen(true)} disabled={!selectedCampaignId || isRunning}>
          {isRunning ? "Running..." : "Run Pipeline"}
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Select value={runMode} onValueChange={(value) => setRunMode(value as "full" | "custom")} disabled={isRunning}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="full">Full pipeline</SelectItem>
            <SelectItem value="custom">Custom range</SelectItem>
          </SelectContent>
        </Select>
        {runMode === "custom" ? (
          <>
            <Select value={startStage} onValueChange={(value) => setStartStage(value as (typeof EXECUTABLE_PIPELINE_STAGES)[number])} disabled={isRunning}>
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="Start stage" />
              </SelectTrigger>
              <SelectContent>
                {EXECUTABLE_PIPELINE_STAGES.map((stage) => (
                  <SelectItem key={stage} value={stage}>
                    {stage}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={endStage} onValueChange={(value) => setEndStage(value as (typeof EXECUTABLE_PIPELINE_STAGES)[number])} disabled={isRunning}>
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="End stage" />
              </SelectTrigger>
              <SelectContent>
                {EXECUTABLE_PIPELINE_STAGES.map((stage) => (
                  <SelectItem key={stage} value={stage}>
                    {stage}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        ) : null}
      </div>
      <p className="text-sm text-muted-foreground">{selectedStagesSummary}</p>
      {campaigns.length === 0 ? <p className="text-sm text-muted-foreground">Create a campaign to run the pipeline.</p> : null}
      {feedback ? <p className="text-sm text-emerald-600">{feedback}</p> : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <PipelineRunConfigDialog
        key={`${selectedCampaignId}:${selectedStages.join(",")}:${selectedCampaign?.leads_per_run ?? 20}:${selectedCampaign?.daily_send_limit ?? 50}`}
        open={isRunConfigOpen}
        onOpenChange={setIsRunConfigOpen}
        selectedStages={selectedStages}
        defaultLeadTarget={selectedCampaign?.leads_per_run ?? 20}
        defaultEmailSendLimit={selectedCampaign?.daily_send_limit ?? 50}
        isSubmitting={isRunning}
        onSubmit={runPipeline}
      />
    </div>
  );
}
