"use client";

import { useState, useMemo } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { WorkflowCanvas } from "./workflow-canvas";
import { SequenceStepEditor } from "@/components/campaigns/sequence-step-editor";
import { SendWindowConfig } from "@/components/campaigns/send-window-config";
import type { SequenceStep } from "@/lib/workflows/sequence-schema";

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

export function WorkflowBuilder({
  templates,
  defaultSteps,
  defaultSendWindow,
  readOnly = false,
}: WorkflowBuilderProps) {
  const [activeTab, setActiveTab] = useState("sequence");

  // For the visual canvas, parse steps from the hidden input
  const [liveSteps, setLiveSteps] = useState<SequenceStep[]>(
    defaultSteps?.length
      ? defaultSteps
      : [
          {
            step_number: 0,
            delay_days: 0,
            delay_hours: 0,
            step_type: "email" as const,
            template_id: null,
            subject_override: null,
            body_override: null,
          },
        ],
  );

  return (
    <div className="space-y-4">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-zinc-900 border border-zinc-800">
          <TabsTrigger value="sequence" className="data-[state=active]:bg-violet-600 data-[state=active]:text-white">
            Sequence
          </TabsTrigger>
          <TabsTrigger value="visual" className="data-[state=active]:bg-violet-600 data-[state=active]:text-white">
            Visual Flow
          </TabsTrigger>
          <TabsTrigger value="settings" className="data-[state=active]:bg-violet-600 data-[state=active]:text-white">
            Settings
          </TabsTrigger>
        </TabsList>

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
        <div key={index} className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900 p-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
            {index + 1}
          </div>
          <div className="flex-1 text-sm">
            <p className="font-medium text-zinc-100">
              {index === 0 ? "Initial Email" : `Follow-up ${index}`}
            </p>
            <p className="text-xs text-zinc-400">
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
