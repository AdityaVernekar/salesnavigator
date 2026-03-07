import { DEFAULT_LLM_MODEL } from "@/lib/ai/default-model";
import { supabaseServer } from "@/lib/supabase/server";

export const AGENT_CONFIG_TYPES = [
  "lead_gen",
  "people_gen",
  "enrichment",
  "scoring",
  "cold_email",
  "followup",
] as const;

export type AgentConfigType = (typeof AGENT_CONFIG_TYPES)[number];

export type AgentConfigRecord = {
  id: string;
  name: string;
  type: AgentConfigType;
  system_prompt: string;
  model: string;
  temperature: number;
  max_tokens: number;
  tools_enabled: string[] | null;
  tool_configs: Record<string, unknown> | null;
  prompt_vars: Record<string, unknown> | null;
  guardrails: Record<string, unknown> | null;
  active_version_id: string | null;
};

export type AgentConfigVersionRecord = {
  id: string;
  agent_config_id: string;
  version: number;
  name: string;
  type: AgentConfigType;
  system_prompt: string;
  model: string;
  temperature: number;
  max_tokens: number;
  tools_enabled: string[] | null;
  tool_configs: Record<string, unknown> | null;
  prompt_vars: Record<string, unknown> | null;
  guardrails: Record<string, unknown> | null;
  change_note: string | null;
  created_at: string;
};

export function isAgentConfigType(value: string): value is AgentConfigType {
  return AGENT_CONFIG_TYPES.includes(value as AgentConfigType);
}

export function normalizeAgentConfigType(value: string): AgentConfigType | null {
  const normalized = value.trim().toLowerCase().replace(/-/g, "_");
  if (!isAgentConfigType(normalized)) return null;
  return normalized;
}

async function resolveCompanyId(companyId?: string) {
  if (companyId) return companyId;
  const { data } = await supabaseServer
    .from("companies")
    .select("id")
    .eq("slug", "default-company")
    .maybeSingle();
  if (!data?.id) throw new Error("Default company is not provisioned");
  return data.id as string;
}

export async function getConfigByType(type: AgentConfigType, companyId?: string): Promise<AgentConfigRecord | null> {
  let query = supabaseServer
    .from("agent_configs")
    .select("id,name,type,system_prompt,model,temperature,max_tokens,tools_enabled,tool_configs,prompt_vars,guardrails,active_version_id")
    .eq("type", type)
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(1);
  if (companyId) query = query.eq("company_id", companyId);
  const { data, error } = await query;
  if (error || !data?.length) return null;
  return data[0] as AgentConfigRecord;
}

export async function getConfigVersions(configId: string, companyId?: string): Promise<AgentConfigVersionRecord[]> {
  let query = supabaseServer
    .from("agent_config_versions")
    .select(
      "id,agent_config_id,version,name,type,system_prompt,model,temperature,max_tokens,tools_enabled,tool_configs,prompt_vars,guardrails,change_note,created_at",
    )
    .eq("agent_config_id", configId)
    .order("version", { ascending: false });
  if (companyId) query = query.eq("company_id", companyId);
  const { data } = await query;
  return (data ?? []) as AgentConfigVersionRecord[];
}

export async function ensureConfig(type: AgentConfigType, companyId?: string): Promise<AgentConfigRecord> {
  const resolvedCompanyId = await resolveCompanyId(companyId);
  const existing = await getConfigByType(type, resolvedCompanyId);
  if (existing) return existing;

  const fallbackPrompt = `You are the ${type} agent. Follow provided workflow instructions and return schema-compliant output.`;
  const { data, error } = await supabaseServer
    .from("agent_configs")
    .insert({
      company_id: resolvedCompanyId,
      name: `${type}-config`,
      type,
      system_prompt: fallbackPrompt,
      model: DEFAULT_LLM_MODEL,
      temperature: 0.3,
      max_tokens: 4096,
      tools_enabled: [],
      tool_configs: {},
      prompt_vars: {},
      guardrails: {},
      is_active: true,
    })
    .select("id,name,type,system_prompt,model,temperature,max_tokens,tools_enabled,tool_configs,prompt_vars,guardrails,active_version_id")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to create agent config");
  }
  return data as AgentConfigRecord;
}

export async function listToolRegistry(companyId?: string) {
  let query = supabaseServer
    .from("tool_registry")
    .select("id,tool_key,provider,status,agent_types_allowed,mcp_server_name,mcp_tool_name,validation")
    .order("tool_key", { ascending: true });
  if (companyId) query = query.eq("company_id", companyId);
  const { data } = await query;
  return data ?? [];
}

export async function createConfigVersion(input: {
  companyId?: string;
  type: AgentConfigType;
  name: string;
  systemPrompt: string;
  model: string;
  temperature: number;
  maxTokens: number;
  toolsEnabled: string[];
  promptVars?: Record<string, unknown>;
  toolConfigs?: Record<string, unknown>;
  guardrails?: Record<string, unknown>;
  changeNote?: string;
  createdBy?: string;
  activate?: boolean;
}) {
  const resolvedCompanyId = await resolveCompanyId(input.companyId);
  const config = await ensureConfig(input.type, resolvedCompanyId);
  const versions = await getConfigVersions(config.id, resolvedCompanyId);
  const nextVersion = (versions[0]?.version ?? 0) + 1;

  const { data: version, error: versionError } = await supabaseServer
    .from("agent_config_versions")
    .insert({
      company_id: resolvedCompanyId,
      agent_config_id: config.id,
      version: nextVersion,
      name: input.name,
      type: input.type,
      system_prompt: input.systemPrompt,
      model: input.model,
      temperature: input.temperature,
      max_tokens: input.maxTokens,
      tools_enabled: input.toolsEnabled,
      tool_configs: input.toolConfigs ?? {},
      prompt_vars: input.promptVars ?? {},
      guardrails: input.guardrails ?? {},
      change_note: input.changeNote ?? null,
      created_by: input.createdBy ?? null,
    })
    .select(
      "id,agent_config_id,version,name,type,system_prompt,model,temperature,max_tokens,tools_enabled,tool_configs,prompt_vars,guardrails,change_note,created_at",
    )
    .single();

  if (versionError || !version) {
    throw new Error(versionError?.message ?? "Failed to create config version");
  }

  if (input.activate ?? true) {
    await activateConfigVersion(config.id, version.id, {
      systemPrompt: input.systemPrompt,
      model: input.model,
      temperature: input.temperature,
      maxTokens: input.maxTokens,
      toolsEnabled: input.toolsEnabled,
      promptVars: input.promptVars ?? {},
      toolConfigs: input.toolConfigs ?? {},
      guardrails: input.guardrails ?? {},
    }, { companyId: resolvedCompanyId });
  }

  return { config, version: version as AgentConfigVersionRecord };
}

export async function activateConfigVersion(
  configId: string,
  versionId: string,
  sync?: {
    systemPrompt: string;
    model: string;
    temperature: number;
    maxTokens: number;
    toolsEnabled: string[];
    promptVars: Record<string, unknown>;
    toolConfigs: Record<string, unknown>;
    guardrails: Record<string, unknown>;
  },
  options?: { companyId?: string },
) {
  let versionQuery = supabaseServer
    .from("agent_config_versions")
    .select("id,agent_config_id,system_prompt,model,temperature,max_tokens,tools_enabled,tool_configs,prompt_vars,guardrails")
    .eq("id", versionId);
  if (options?.companyId) versionQuery = versionQuery.eq("company_id", options.companyId);
  const { data: version, error: versionError } = await versionQuery.single();

  if (versionError || !version || version.agent_config_id !== configId) {
    throw new Error(versionError?.message ?? "Config version not found");
  }

  const patch = sync ?? {
    systemPrompt: version.system_prompt,
    model: version.model,
    temperature: version.temperature,
    maxTokens: version.max_tokens,
    toolsEnabled: version.tools_enabled ?? [],
    promptVars: (version.prompt_vars as Record<string, unknown>) ?? {},
    toolConfigs: (version.tool_configs as Record<string, unknown>) ?? {},
    guardrails: (version.guardrails as Record<string, unknown>) ?? {},
  };

  let patchQuery = supabaseServer
    .from("agent_configs")
    .update({
      active_version_id: versionId,
      system_prompt: patch.systemPrompt,
      model: patch.model,
      temperature: patch.temperature,
      max_tokens: patch.maxTokens,
      tools_enabled: patch.toolsEnabled,
      prompt_vars: patch.promptVars,
      tool_configs: patch.toolConfigs,
      guardrails: patch.guardrails,
      updated_at: new Date().toISOString(),
    })
    .eq("id", configId);
  if (options?.companyId) patchQuery = patchQuery.eq("company_id", options.companyId);
  const { error } = await patchQuery;

  if (error) {
    throw new Error(error.message);
  }
}
