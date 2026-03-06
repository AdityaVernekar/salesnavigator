import { DEFAULT_LLM_MODEL } from "@/lib/ai/default-model";
import type { ManagedAgentType, ResolvedRuntimeConfig, RuntimeGuardrails } from "@/lib/agents/runtime-types";
import { supabaseServer } from "@/lib/supabase/server";

type AgentConfigRow = {
  id: string;
  type: string;
  active_version_id: string | null;
  system_prompt: string;
  model: string;
  temperature: number;
  max_tokens: number;
  tools_enabled: string[] | null;
  tool_configs: Record<string, unknown> | null;
  prompt_vars: Record<string, unknown> | null;
  guardrails: Record<string, unknown> | null;
};

type AgentConfigVersionRow = {
  id: string;
  system_prompt: string;
  model: string;
  temperature: number;
  max_tokens: number;
  tools_enabled: string[] | null;
  tool_configs: Record<string, unknown> | null;
  prompt_vars: Record<string, unknown> | null;
  guardrails: Record<string, unknown> | null;
};

type ToolRegistryRow = {
  tool_key: string;
  status: "enabled" | "disabled";
  provider: "native" | "mcp";
  agent_types_allowed: string[] | null;
};

function interpolatePromptVars(prompt: string, promptVars: Record<string, unknown>) {
  return prompt.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (full, key) => {
    if (!(key in promptVars)) return full;
    const value = promptVars[key];
    if (typeof value === "string") return value;
    return JSON.stringify(value);
  });
}

function defaultConfig(): ResolvedRuntimeConfig {
  return {
    source: "static",
    configVersionId: null,
    model: DEFAULT_LLM_MODEL,
    instructions: "",
    temperature: 0.3,
    maxTokens: 4096,
    enabledToolKeys: [],
    rejectedToolKeys: [],
    promptVars: {},
    toolConfigs: {},
    guardrails: {
      prependInstructions: [],
      blockedPatterns: [],
      maxPromptChars: null,
    },
  };
}

function normalizeGuardrails(value: Record<string, unknown> | null | undefined): RuntimeGuardrails {
  const raw = value ?? {};
  const prependInstructions = Array.isArray(raw.prependInstructions)
    ? raw.prependInstructions.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean)
    : [];
  const blockedPatterns = Array.isArray(raw.blockedPatterns)
    ? raw.blockedPatterns.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean)
    : [];
  const maxPromptCharsRaw = raw.maxPromptChars;
  const maxPromptChars = typeof maxPromptCharsRaw === "number" && Number.isFinite(maxPromptCharsRaw) && maxPromptCharsRaw > 0
    ? Math.round(maxPromptCharsRaw)
    : null;

  return { prependInstructions, blockedPatterns, maxPromptChars };
}

export async function resolveAgentRuntimeConfig(agentType: ManagedAgentType): Promise<ResolvedRuntimeConfig> {
  const { data: configs, error } = await supabaseServer
    .from("agent_configs")
    .select("id,type,active_version_id,system_prompt,model,temperature,max_tokens,tools_enabled,tool_configs,prompt_vars,guardrails")
    .eq("type", agentType)
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(1);

  if (error || !configs?.length) {
    return defaultConfig();
  }

  const configRow = configs[0] as AgentConfigRow;
  let versionRow: AgentConfigVersionRow | null = null;
  if (configRow.active_version_id) {
    const { data: version } = await supabaseServer
      .from("agent_config_versions")
      .select("id,system_prompt,model,temperature,max_tokens,tools_enabled,tool_configs,prompt_vars,guardrails")
      .eq("id", configRow.active_version_id)
      .single();
    versionRow = (version as AgentConfigVersionRow | null) ?? null;
  }

  const sourceRow = versionRow ?? configRow;
  const requestedTools = sourceRow.tools_enabled ?? [];
  if (!requestedTools.length) {
    return {
      source: versionRow ? "db" : "static",
      configVersionId: versionRow?.id ?? null,
      model: sourceRow.model ?? DEFAULT_LLM_MODEL,
      instructions: interpolatePromptVars(sourceRow.system_prompt ?? "", sourceRow.prompt_vars ?? {}),
      temperature: sourceRow.temperature ?? 0.3,
      maxTokens: sourceRow.max_tokens ?? 4096,
      enabledToolKeys: [],
      rejectedToolKeys: [],
      promptVars: sourceRow.prompt_vars ?? {},
      toolConfigs: sourceRow.tool_configs ?? {},
      guardrails: normalizeGuardrails(sourceRow.guardrails),
    };
  }

  const { data: toolRows } = await supabaseServer
    .from("tool_registry")
    .select("tool_key,status,provider,agent_types_allowed")
    .in("tool_key", requestedTools);

  const toolsByKey = new Map<string, ToolRegistryRow>(
    ((toolRows ?? []) as ToolRegistryRow[]).map((row) => [row.tool_key, row]),
  );

  const enabledToolKeys: string[] = [];
  const rejectedToolKeys: string[] = [];
  for (const toolKey of requestedTools) {
    const row = toolsByKey.get(toolKey);
    const allowedTypes = row?.agent_types_allowed ?? [];
    const allowedForAgent = allowedTypes.length === 0 || allowedTypes.includes(agentType);
    if (!row || row.status !== "enabled" || !allowedForAgent) {
      rejectedToolKeys.push(toolKey);
      continue;
    }
    enabledToolKeys.push(toolKey);
  }

  return {
    source: "db",
    configVersionId: versionRow?.id ?? null,
    model: sourceRow.model ?? DEFAULT_LLM_MODEL,
    instructions: interpolatePromptVars(sourceRow.system_prompt ?? "", sourceRow.prompt_vars ?? {}),
    temperature: sourceRow.temperature ?? 0.3,
    maxTokens: sourceRow.max_tokens ?? 4096,
    enabledToolKeys,
    rejectedToolKeys,
    promptVars: sourceRow.prompt_vars ?? {},
    toolConfigs: sourceRow.tool_configs ?? {},
    guardrails: normalizeGuardrails(sourceRow.guardrails),
  };
}
