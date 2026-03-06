import { supabaseServer } from "@/lib/supabase/server";

export type RunLogLevel = "info" | "warn" | "error" | "success";
export type RunAgentType =
  | "pipeline"
  | "lead_gen"
  | "people_gen"
  | "enrichment"
  | "scoring"
  | "cold_email"
  | "worker";

export type PipelineStage =
  | "queued"
  | "lead_generation"
  | "people_discovery"
  | "enrichment"
  | "scoring"
  | "email"
  | "completed"
  | "failed";

type RunUpdate = Partial<{
  status: "running" | "completed" | "failed" | "cancelled";
  current_stage: PipelineStage;
  leads_generated: number;
  leads_enriched: number;
  leads_scored: number;
  emails_sent: number;
  error: string | null;
  finished_at: string;
  config_version_id: string | null;
}>;

export async function logRunEvent(
  runId: string,
  agentType: RunAgentType,
  level: RunLogLevel,
  message: string,
  metadata: Record<string, unknown> = {},
) {
  await supabaseServer.from("run_logs").insert({
    run_id: runId,
    agent_type: agentType,
    level,
    message,
    metadata,
  });
}

export async function updateRunState(runId: string, patch: RunUpdate) {
  await supabaseServer.from("pipeline_runs").update(patch).eq("id", runId);
}
