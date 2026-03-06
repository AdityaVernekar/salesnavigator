export const EXECUTABLE_PIPELINE_STAGES = [
  "lead_generation",
  "people_discovery",
  "enrichment",
  "scoring",
  "email",
] as const;

export type ExecutablePipelineStage = (typeof EXECUTABLE_PIPELINE_STAGES)[number];

export function isExecutablePipelineStage(value: string): value is ExecutablePipelineStage {
  return EXECUTABLE_PIPELINE_STAGES.includes(value as ExecutablePipelineStage);
}

export function expandStageRange(
  startStage: ExecutablePipelineStage,
  endStage: ExecutablePipelineStage,
): ExecutablePipelineStage[] {
  const startIdx = EXECUTABLE_PIPELINE_STAGES.indexOf(startStage);
  const endIdx = EXECUTABLE_PIPELINE_STAGES.indexOf(endStage);
  if (startIdx === -1 || endIdx === -1) return [...EXECUTABLE_PIPELINE_STAGES];
  const from = Math.min(startIdx, endIdx);
  const to = Math.max(startIdx, endIdx);
  return EXECUTABLE_PIPELINE_STAGES.slice(from, to + 1);
}
