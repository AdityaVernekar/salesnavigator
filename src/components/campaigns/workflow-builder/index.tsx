"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { WorkflowCanvas } from "./workflow-canvas";
import { SequenceStepEditor } from "@/components/campaigns/sequence-step-editor";
import { SequencePresetSelector } from "@/components/campaigns/sequence-preset-selector";
import { SendWindowConfig } from "@/components/campaigns/send-window-config";
import type { SequenceStep } from "@/lib/workflows/sequence-schema";
import type { WorkflowPreset } from "@/lib/workflows/presets";

type TemplateOption = {
  id: string;
  name: string;
};

type WorkflowBuilderProps = {
  templates: TemplateOption[];
  defaultSteps?: SequenceStep[];
  defaultSendWindow?: {
    sendWindowStart?: string;
    sendWindowEnd?: string;
    sendWindowTimezone?: string;
    sendWindowDays?: number[];
  };
  readOnly?: boolean;
};

const EMPTY_STEP: SequenceStep = {
  step_number: 0,
  delay_days: 0,
  delay_hours: 0,
  step_type: "email" as const,
  template_id: null,
  subject_override: null,
  body_override: null,
};

export function WorkflowBuilder({
  templates,
  defaultSteps,
  defaultSendWindow,
  readOnly = false,
}: WorkflowBuilderProps) {
  const [activeTab, setActiveTab] = useState("sequence");
  const hasDefaultSteps = Boolean(defaultSteps?.length);
  const [presetSelected, setPresetSelected] = useState(hasDefaultSteps);

  const [liveSteps, setLiveSteps] = useState<SequenceStep[]>(
    hasDefaultSteps ? defaultSteps! : [EMPTY_STEP],
  );

  function handlePresetSelect(preset: WorkflowPreset) {
    setLiveSteps(preset.steps.map((s) => ({ ...s })));
    setPresetSelected(true);
  }

  function handleSkip() {
    setLiveSteps([EMPTY_STEP]);
    setPresetSelected(true);
  }

  function handleChangeTemplate() {
    setPresetSelected(false);
  }

  // Show preset selector for new campaigns (no default steps)
  if (!presetSelected && !readOnly) {
    return (
      <div className="space-y-4">
        <SequencePresetSelector
          onSelect={handlePresetSelect}
          onSkip={handleSkip}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="sequence">
              Sequence
            </TabsTrigger>
            <TabsTrigger value="visual">
              Visual Flow
            </TabsTrigger>
            <TabsTrigger value="settings">
              Settings
            </TabsTrigger>
          </TabsList>
          {!readOnly && !hasDefaultSteps && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleChangeTemplate}
            >
              Change template
            </Button>
          )}
        </div>

        <TabsContent value="sequence" className="mt-4">
          {readOnly ? (
            <ReadOnlySteps steps={liveSteps} />
          ) : (
            <SequenceStepEditor
              templates={templates}
              defaultSteps={liveSteps}
              onStepsChange={setLiveSteps}
            />
          )}
        </TabsContent>

        <TabsContent value="visual" className="mt-4">
          <WorkflowCanvas steps={liveSteps} />
        </TabsContent>

        <TabsContent value="settings" className="mt-4">
          <SendWindowConfig defaults={defaultSendWindow} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ReadOnlySteps({ steps }: { steps: SequenceStep[] }) {
  if (!steps.length) {
    return <p className="text-sm text-muted-foreground">No sequence steps configured.</p>;
  }
  return (
    <div className="space-y-2">
      {steps.map((step, index) => (
        <div key={index} className="flex items-center gap-3 rounded-lg border p-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
            {index + 1}
          </div>
          <div className="flex-1 text-sm">
            <p className="font-medium">
              {index === 0 ? "Initial Email" : `Follow-up ${index}`}
            </p>
            <p className="text-xs text-muted-foreground">
              {index === 0
                ? "Sent immediately on enrollment"
                : `Wait ${step.delay_days}d ${step.delay_hours}h after previous step`}
              {step.template_id ? " — Using template" : ""}
              {step.subject_override ? ` — "${step.subject_override}"` : ""}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
