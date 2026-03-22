"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { WORKFLOW_PRESETS } from "@/lib/workflows/presets";
import type { SequenceStep } from "@/lib/workflows/sequence-schema";

type TemplateOption = {
  id: string;
  name: string;
};

function emptyStep(stepNumber: number, delayDays: number): SequenceStep {
  return {
    step_number: stepNumber,
    delay_days: delayDays,
    delay_hours: 0,
    step_type: "email",
    template_id: null,
    subject_override: null,
    body_override: null,
  };
}

export function SequenceStepEditor({
  templates,
  defaultSteps,
  onStepsChange,
}: {
  templates: TemplateOption[];
  defaultSteps?: SequenceStep[];
  onStepsChange?: (steps: SequenceStep[]) => void;
}) {
  const [steps, setSteps] = useState<SequenceStep[]>(
    defaultSteps?.length ? defaultSteps : [emptyStep(0, 0)],
  );

  useEffect(() => {
    onStepsChange?.(steps);
  }, [steps, onStepsChange]);

  function updateStep(index: number, updates: Partial<SequenceStep>) {
    setSteps((prev) =>
      prev.map((s, i) => (i === index ? { ...s, ...updates } : s)),
    );
  }

  function addStep() {
    setSteps((prev) => [
      ...prev,
      emptyStep(prev.length, prev.length === 0 ? 0 : 3),
    ]);
  }

  function removeStep(index: number) {
    if (steps.length <= 1) return;
    setSteps((prev) =>
      prev
        .filter((_, i) => i !== index)
        .map((s, i) => ({ ...s, step_number: i })),
    );
  }

  function loadPreset(presetId: string) {
    const preset = WORKFLOW_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    if (steps.length > 1 || steps[0]?.subject_override) {
      if (!window.confirm("This will replace your current sequence steps. Continue?")) return;
    }
    setSteps(preset.steps.map((s) => ({ ...s })));
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">Sequence Steps</Label>
        <Select onValueChange={loadPreset}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Load preset..." />
          </SelectTrigger>
          <SelectContent>
            {WORKFLOW_PRESETS.map((preset) => (
              <SelectItem key={preset.id} value={preset.id}>
                {preset.name} — {preset.steps.length} steps
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <input
        type="hidden"
        name="sequence_steps"
        value={JSON.stringify(steps)}
        readOnly
      />

      <div className="space-y-3">
        {steps.map((step, index) => (
          <div
            key={index}
            className="relative rounded-md border p-4 space-y-3"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">
                Step {index + 1}
                {index === 0 ? " (Initial Email)" : ` (Follow-up ${index})`}
              </span>
              {steps.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeStep(index)}
                >
                  Remove
                </Button>
              )}
            </div>

            {index > 0 && (
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground whitespace-nowrap">
                  Wait
                </Label>
                <Input
                  type="number"
                  min={0}
                  value={step.delay_days}
                  onChange={(e) =>
                    updateStep(index, {
                      delay_days: Number(e.target.value) || 0,
                    })
                  }
                  className="w-20"
                />
                <span className="text-xs text-muted-foreground">days</span>
                <Input
                  type="number"
                  min={0}
                  max={23}
                  value={step.delay_hours}
                  onChange={(e) =>
                    updateStep(index, {
                      delay_hours: Number(e.target.value) || 0,
                    })
                  }
                  className="w-20"
                />
                <span className="text-xs text-muted-foreground">
                  hours after previous step
                </span>
              </div>
            )}

            <div className="space-y-2">
              <Label className="text-xs">Email Template</Label>
              <Select
                value={step.template_id ?? "__inline"}
                onValueChange={(value) =>
                  updateStep(index, {
                    template_id: value === "__inline" ? null : value,
                  })
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Use inline content" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__inline">
                    Write inline content
                  </SelectItem>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {!step.template_id && (
              <div className="space-y-2">
                <div>
                  <Label className="text-xs">Subject</Label>
                  <Input
                    placeholder="Email subject (supports {{first_name}} etc.)"
                    value={step.subject_override ?? ""}
                    onChange={(e) =>
                      updateStep(index, {
                        subject_override: e.target.value || null,
                      })
                    }
                  />
                </div>
                <div>
                  <Label className="text-xs">Body</Label>
                  <Textarea
                    placeholder="Email body (supports {{first_name}}, {{company_name}}, etc.)"
                    rows={4}
                    value={step.body_override ?? ""}
                    onChange={(e) =>
                      updateStep(index, {
                        body_override: e.target.value || null,
                      })
                    }
                  />
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <Button type="button" variant="outline" size="sm" onClick={addStep}>
        + Add Follow-up Step
      </Button>
    </div>
  );
}
