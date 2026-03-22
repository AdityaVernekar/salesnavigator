import type { SequenceStep } from "./sequence-schema";

export type PresetCategory = "cold_outreach" | "nurture" | "follow_up" | "re_engagement";

export type WorkflowPreset = {
  id: string;
  name: string;
  description: string;
  category: PresetCategory;
  steps: SequenceStep[];
};

export const WORKFLOW_PRESETS: WorkflowPreset[] = [
  {
    id: "standard-outreach",
    name: "Standard Outreach",
    category: "cold_outreach",
    description: "4-step sequence: immediate, then 3, 5, and 7 day follow-ups",
    steps: [
      { step_number: 0, delay_days: 0, delay_hours: 0, step_type: "email", template_id: null, subject_override: "Quick question for {{first_name}}", body_override: null },
      { step_number: 1, delay_days: 3, delay_hours: 0, step_type: "email", template_id: null, subject_override: "Re: Quick question for {{first_name}}", body_override: null },
      { step_number: 2, delay_days: 5, delay_hours: 0, step_type: "email", template_id: null, subject_override: "One more thought, {{first_name}}", body_override: null },
      { step_number: 3, delay_days: 7, delay_hours: 0, step_type: "email", template_id: null, subject_override: "Last note — worth a quick look?", body_override: null },
    ],
  },
  {
    id: "aggressive",
    name: "Aggressive",
    category: "cold_outreach",
    description: "4-step sequence: immediate, then 1, 2, and 4 day follow-ups",
    steps: [
      { step_number: 0, delay_days: 0, delay_hours: 0, step_type: "email", template_id: null, subject_override: "{{first_name}}, quick intro", body_override: null },
      { step_number: 1, delay_days: 1, delay_hours: 0, step_type: "email", template_id: null, subject_override: "Following up — did you see this?", body_override: null },
      { step_number: 2, delay_days: 2, delay_hours: 0, step_type: "email", template_id: null, subject_override: "Re: quick intro", body_override: null },
      { step_number: 3, delay_days: 4, delay_hours: 0, step_type: "email", template_id: null, subject_override: "Last chance — closing the loop", body_override: null },
    ],
  },
  {
    id: "gentle",
    name: "Gentle",
    category: "nurture",
    description: "3-step sequence: immediate, then 5 and 10 day follow-ups",
    steps: [
      { step_number: 0, delay_days: 0, delay_hours: 0, step_type: "email", template_id: null, subject_override: "Thought this might help, {{first_name}}", body_override: null },
      { step_number: 1, delay_days: 5, delay_hours: 0, step_type: "email", template_id: null, subject_override: "A resource for {{company_name}}", body_override: null },
      { step_number: 2, delay_days: 10, delay_hours: 0, step_type: "email", template_id: null, subject_override: "Any interest, {{first_name}}?", body_override: null },
    ],
  },
  {
    id: "3-step-cold",
    name: "3-Step Cold Outreach",
    category: "cold_outreach",
    description: "Concise 3-step sequence over 7 days for cold leads",
    steps: [
      { step_number: 0, delay_days: 0, delay_hours: 0, step_type: "email", template_id: null, subject_override: "Idea for {{company_name}}", body_override: null },
      { step_number: 1, delay_days: 3, delay_hours: 0, step_type: "email", template_id: null, subject_override: "Re: Idea for {{company_name}}", body_override: null },
      { step_number: 2, delay_days: 7, delay_hours: 0, step_type: "email", template_id: null, subject_override: "Should I close the loop?", body_override: null },
    ],
  },
  {
    id: "5-step-nurture",
    name: "5-Step Nurture Sequence",
    category: "nurture",
    description: "Build rapport over 2 weeks with spaced value-driven touches",
    steps: [
      { step_number: 0, delay_days: 0, delay_hours: 0, step_type: "email", template_id: null, subject_override: "{{first_name}}, thought of you", body_override: null },
      { step_number: 1, delay_days: 2, delay_hours: 0, step_type: "email", template_id: null, subject_override: "A quick resource for {{company_name}}", body_override: null },
      { step_number: 2, delay_days: 5, delay_hours: 0, step_type: "email", template_id: null, subject_override: "What other teams are doing", body_override: null },
      { step_number: 3, delay_days: 9, delay_hours: 0, step_type: "email", template_id: null, subject_override: "Case study you might like", body_override: null },
      { step_number: 4, delay_days: 14, delay_hours: 0, step_type: "email", template_id: null, subject_override: "Worth a conversation, {{first_name}}?", body_override: null },
    ],
  },
  {
    id: "quick-2-touch",
    name: "Quick 2-Touch Follow-Up",
    category: "follow_up",
    description: "Minimal 2-step sequence for warm leads or event follow-ups",
    steps: [
      { step_number: 0, delay_days: 0, delay_hours: 0, step_type: "email", template_id: null, subject_override: "Great connecting, {{first_name}}", body_override: null },
      { step_number: 1, delay_days: 2, delay_hours: 0, step_type: "email", template_id: null, subject_override: "Following up on our chat", body_override: null },
    ],
  },
  {
    id: "re-engagement",
    name: "Re-Engagement Drip",
    category: "re_engagement",
    description: "Long-spaced 4-step sequence for dormant leads over 3 weeks",
    steps: [
      { step_number: 0, delay_days: 0, delay_hours: 0, step_type: "email", template_id: null, subject_override: "Been a while, {{first_name}}", body_override: null },
      { step_number: 1, delay_days: 4, delay_hours: 0, step_type: "email", template_id: null, subject_override: "New things at {{company_name}}?", body_override: null },
      { step_number: 2, delay_days: 10, delay_hours: 0, step_type: "email", template_id: null, subject_override: "Quick update you might find useful", body_override: null },
      { step_number: 3, delay_days: 21, delay_hours: 0, step_type: "email", template_id: null, subject_override: "One last reach out", body_override: null },
    ],
  },
];

/** Human-readable label for preset categories */
export const CATEGORY_LABELS: Record<PresetCategory, string> = {
  cold_outreach: "Cold Outreach",
  nurture: "Nurture",
  follow_up: "Follow-Up",
  re_engagement: "Re-Engagement",
};
