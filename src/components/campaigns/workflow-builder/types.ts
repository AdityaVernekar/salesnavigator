export type WorkflowNodeType =
  | "trigger"
  | "email"
  | "delay"
  | "condition"
  | "end";

export type ConditionBranch = "replied" | "not_replied" | "opened" | "not_opened" | "clicked" | "bounced";

export type WorkflowNodeData = {
  label: string;
  nodeType: WorkflowNodeType;
  // Email step fields
  stepNumber?: number;
  templateId?: string | null;
  subjectOverride?: string | null;
  bodyOverride?: string | null;
  // Delay fields
  delayDays?: number;
  delayHours?: number;
  // Condition fields
  conditionType?: ConditionBranch;
  // Common
  description?: string;
};
