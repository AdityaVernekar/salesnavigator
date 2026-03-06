"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  EXECUTABLE_PIPELINE_STAGES,
  type ExecutablePipelineStage,
} from "@/lib/pipeline/stages";

const STAGE_LABELS: Record<ExecutablePipelineStage, string> = {
  lead_generation: "Lead generation",
  people_discovery: "People discovery",
  enrichment: "Enrichment",
  scoring: "Scoring",
  email: "Email",
};

type RunPipelineFromLeadsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadCount: number;
  isSubmitting: boolean;
  onSubmit: (
    startStage: ExecutablePipelineStage,
    endStage: ExecutablePipelineStage,
  ) => Promise<void>;
};

export function RunPipelineFromLeadsDialog({
  open,
  onOpenChange,
  leadCount,
  isSubmitting,
  onSubmit,
}: RunPipelineFromLeadsDialogProps) {
  const [startStage, setStartStage] =
    useState<ExecutablePipelineStage>("enrichment");
  const [endStage, setEndStage] = useState<ExecutablePipelineStage>("email");

  const handleSubmit = async () => {
    await onSubmit(startStage, endStage);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Run pipeline on {leadCount} lead{leadCount !== 1 ? "s" : ""}
          </DialogTitle>
          <DialogDescription>
            Choose which stages to run. Only the selected leads will be
            processed (Clay-style).
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="start-stage">From stage</Label>
            <Select
              value={startStage}
              onValueChange={(v) => setStartStage(v as ExecutablePipelineStage)}
              disabled={isSubmitting}
            >
              <SelectTrigger id="start-stage">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EXECUTABLE_PIPELINE_STAGES.map((stage) => (
                  <SelectItem key={stage} value={stage}>
                    {STAGE_LABELS[stage]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="end-stage">To stage</Label>
            <Select
              value={endStage}
              onValueChange={(v) => setEndStage(v as ExecutablePipelineStage)}
              disabled={isSubmitting}
            >
              <SelectTrigger id="end-stage">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EXECUTABLE_PIPELINE_STAGES.map((stage) => (
                  <SelectItem key={stage} value={stage}>
                    {STAGE_LABELS[stage]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? "Queuing…" : "Run pipeline"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
