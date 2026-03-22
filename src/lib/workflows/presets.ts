import type { SequenceStep } from "./sequence-schema";

export type WorkflowPreset = {
  name: string;
  description: string;
  steps: SequenceStep[];
};

export const WORKFLOW_PRESETS: WorkflowPreset[] = [
  {
    name: "Standard Outreach",
    description: "4-step sequence: immediate, then 3, 5, and 7 day follow-ups",
    steps: [
      { step_number: 0, delay_days: 0, delay_hours: 0, step_type: "email", template_id: null, subject_override: null, body_override: null },
      { step_number: 1, delay_days: 3, delay_hours: 0, step_type: "email", template_id: null, subject_override: null, body_override: null },
      { step_number: 2, delay_days: 5, delay_hours: 0, step_type: "email", template_id: null, subject_override: null, body_override: null },
      { step_number: 3, delay_days: 7, delay_hours: 0, step_type: "email", template_id: null, subject_override: null, body_override: null },
    ],
  },
  {
    name: "Aggressive",
    description: "4-step sequence: immediate, then 1, 2, and 4 day follow-ups",
    steps: [
      { step_number: 0, delay_days: 0, delay_hours: 0, step_type: "email", template_id: null, subject_override: null, body_override: null },
      { step_number: 1, delay_days: 1, delay_hours: 0, step_type: "email", template_id: null, subject_override: null, body_override: null },
      { step_number: 2, delay_days: 2, delay_hours: 0, step_type: "email", template_id: null, subject_override: null, body_override: null },
      { step_number: 3, delay_days: 4, delay_hours: 0, step_type: "email", template_id: null, subject_override: null, body_override: null },
    ],
  },
  {
    name: "Gentle",
    description: "3-step sequence: immediate, then 5 and 10 day follow-ups",
    steps: [
      { step_number: 0, delay_days: 0, delay_hours: 0, step_type: "email", template_id: null, subject_override: null, body_override: null },
      { step_number: 1, delay_days: 5, delay_hours: 0, step_type: "email", template_id: null, subject_override: null, body_override: null },
      { step_number: 2, delay_days: 10, delay_hours: 0, step_type: "email", template_id: null, subject_override: null, body_override: null },
    ],
  },
];
