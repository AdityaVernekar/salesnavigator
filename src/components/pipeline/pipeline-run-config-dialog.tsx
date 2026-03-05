"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ExecutablePipelineStage } from "@/lib/pipeline/stages";
import type { PipelineRunConfig } from "@/lib/pipeline/run-config";

type PipelineRunConfigDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedStages: ExecutablePipelineStage[];
  defaultLeadTarget: number;
  defaultEmailSendLimit: number;
  isSubmitting: boolean;
  onSubmit: (runConfig: PipelineRunConfig) => Promise<void> | void;
};

const stageLabels: Record<ExecutablePipelineStage, string> = {
  lead_generation: "Lead Generation",
  people_discovery: "People Discovery",
  enrichment: "Enrichment",
  scoring: "Scoring",
  email: "Email",
};

function toPositiveNumber(value: string, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.round(parsed);
}

function normalizeEmails(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(/[\n,]+/)
        .map((item) => item.trim().toLowerCase())
        .filter((item) => Boolean(item)),
    ),
  );
}

export function PipelineRunConfigDialog({
  open,
  onOpenChange,
  selectedStages,
  defaultLeadTarget,
  defaultEmailSendLimit,
  isSubmitting,
  onSubmit,
}: PipelineRunConfigDialogProps) {
  const selectedSet = useMemo(() => new Set(selectedStages), [selectedStages]);
  const [leadLimit, setLeadLimit] = useState(String(defaultLeadTarget));
  const [peopleLimit, setPeopleLimit] = useState("25");
  const [enrichmentLimit, setEnrichmentLimit] = useState("25");
  const [scoringLimit, setScoringLimit] = useState("25");
  const [emailLimit, setEmailLimit] = useState(String(defaultEmailSendLimit));
  const [emailUseTestMode, setEmailUseTestMode] = useState(false);
  const [emailTestRecipients, setEmailTestRecipients] = useState("");

  const summary = selectedStages.map((stage) => stageLabels[stage]).join(", ");

  const submitConfig = async () => {
    const runConfig: PipelineRunConfig = {};

    if (selectedSet.has("lead_generation")) {
      runConfig.leadGeneration = {
        maxLeads: toPositiveNumber(leadLimit, defaultLeadTarget),
      };
    }
    if (selectedSet.has("people_discovery")) {
      runConfig.peopleDiscovery = {
        maxContacts: toPositiveNumber(peopleLimit, 25),
      };
    }
    if (selectedSet.has("enrichment")) {
      runConfig.enrichment = {
        maxContacts: toPositiveNumber(enrichmentLimit, 25),
      };
    }
    if (selectedSet.has("scoring")) {
      runConfig.scoring = { maxContacts: toPositiveNumber(scoringLimit, 25) };
    }
    if (selectedSet.has("email")) {
      const testRecipientEmails = normalizeEmails(emailTestRecipients);
      runConfig.email = {
        maxSends: toPositiveNumber(emailLimit, defaultEmailSendLimit),
        useTestMode: emailUseTestMode,
        ...(testRecipientEmails.length ? { testRecipientEmails } : {}),
      };
    }

    await onSubmit(runConfig);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Configure This Run</DialogTitle>
          <DialogDescription>
            Set run-time limits for selected stages: {summary || "None"}.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {selectedSet.has("lead_generation") ? (
            <div className="space-y-1">
              <Label htmlFor="lead-limit">Max leads to generate</Label>
              <Input
                id="lead-limit"
                type="number"
                min={1}
                max={500}
                value={leadLimit}
                onChange={(event) => setLeadLimit(event.target.value)}
                disabled={isSubmitting}
              />
            </div>
          ) : null}
          {selectedSet.has("people_discovery") ? (
            <div className="space-y-1">
              <Label htmlFor="people-limit">Max contacts to discover</Label>
              <Input
                id="people-limit"
                type="number"
                min={1}
                max={2000}
                value={peopleLimit}
                onChange={(event) => setPeopleLimit(event.target.value)}
                disabled={isSubmitting}
              />
            </div>
          ) : null}
          {selectedSet.has("enrichment") ? (
            <div className="space-y-1">
              <Label htmlFor="enrichment-limit">Max contacts to enrich</Label>
              <Input
                id="enrichment-limit"
                type="number"
                min={1}
                max={2000}
                value={enrichmentLimit}
                onChange={(event) => setEnrichmentLimit(event.target.value)}
                disabled={isSubmitting}
              />
            </div>
          ) : null}
          {selectedSet.has("scoring") ? (
            <div className="space-y-1">
              <Label htmlFor="scoring-limit">Max contacts to score</Label>
              <Input
                id="scoring-limit"
                type="number"
                min={1}
                max={2000}
                value={scoringLimit}
                onChange={(event) => setScoringLimit(event.target.value)}
                disabled={isSubmitting}
              />
            </div>
          ) : null}
          {selectedSet.has("email") ? (
            <div className="space-y-2 rounded border p-2">
              <div className="space-y-1">
                <Label htmlFor="email-limit">Max emails to send</Label>
                <Input
                  id="email-limit"
                  type="number"
                  min={1}
                  max={500}
                  value={emailLimit}
                  onChange={(event) => setEmailLimit(event.target.value)}
                  disabled={isSubmitting}
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  id="email-test-mode-run"
                  type="checkbox"
                  checked={emailUseTestMode}
                  onChange={(event) => setEmailUseTestMode(event.target.checked)}
                  disabled={isSubmitting}
                />
                <Label htmlFor="email-test-mode-run">Use test mode for this run</Label>
              </div>
              {emailUseTestMode ? (
                <div className="space-y-1">
                  <Label htmlFor="email-test-recipients">Test recipient emails</Label>
                  <Input
                    id="email-test-recipients"
                    type="text"
                    value={emailTestRecipients}
                    onChange={(event) => setEmailTestRecipients(event.target.value)}
                    disabled={isSubmitting}
                    placeholder="qa@example.com, team@example.com"
                  />
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button onClick={submitConfig} disabled={isSubmitting}>
            {isSubmitting ? "Running..." : "Start Run"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
