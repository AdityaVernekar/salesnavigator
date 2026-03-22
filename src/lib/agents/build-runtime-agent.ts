import { Agent } from "@mastra/core/agent";
import { withSupermemory } from "@supermemory/tools/mastra";
import { resolveAgentRuntimeConfig } from "@/lib/agents/runtime-config";
import { env } from "@/lib/config/env";
import type { ManagedAgentType, ResolvedRuntimeConfig, RuntimeGuardrails } from "@/lib/agents/runtime-types";
import { agentToolAllowlist, resolveRuntimeTools } from "@/lib/agents/tool-registry";

const agentMeta: Record<ManagedAgentType, { id: string; name: string; description: string }> = {
  lead_gen: {
    id: "lead-gen-agent-runtime",
    name: "Lead Generation Agent",
    description: "Finds ICP-fit B2B companies for outbound prospecting.",
  },
  people_gen: {
    id: "people-gen-agent-runtime",
    name: "People Generation Agent",
    description: "Finds target contacts inside shortlisted companies.",
  },
  enrichment: {
    id: "enrichment-agent-runtime",
    name: "Enrichment Agent",
    description: "Deep-enriches discovered people with profile and company context.",
  },
  scoring: {
    id: "scoring-agent-runtime",
    name: "Scoring Agent",
    description: "Scores enriched contacts against campaign ICP rubrics.",
  },
  cold_email: {
    id: "cold-email-agent-runtime",
    name: "Cold Email Agent",
    description: "Writes and sends personalized cold emails.",
  },
  followup: {
    id: "follow-up-agent-runtime",
    name: "Follow-Up Agent",
    description: "Reads replies, classifies intent, and sends due follow-ups.",
  },
};

export type RuntimeAgentResolution = {
  agent: Agent;
  config: ResolvedRuntimeConfig;
  toolKeys: string[];
  rejectedToolKeys: string[];
  preparePrompt: (prompt: string) => string;
};

export type BuildRuntimeAgentOptions = {
  requestedToolKeys?: string[];
  contactId?: string;
  threadId?: string;
};

function buildGuardrailInstruction(guardrails: RuntimeGuardrails) {
  const lines: string[] = [];
  if (guardrails.prependInstructions.length) {
    lines.push("Always follow these runtime guardrails:");
    for (const item of guardrails.prependInstructions) {
      lines.push(`- ${item}`);
    }
  }
  if (guardrails.blockedPatterns.length) {
    lines.push("Never include or process these blocked patterns:");
    for (const item of guardrails.blockedPatterns) {
      lines.push(`- ${item}`);
    }
  }
  if (guardrails.maxPromptChars) {
    lines.push(`Reject prompts exceeding ${guardrails.maxPromptChars} characters.`);
  }
  return lines.length ? `\n\n${lines.join("\n")}` : "";
}

function enforcePromptGuardrails(prompt: string, guardrails: RuntimeGuardrails) {
  const normalized = String(prompt ?? "");
  if (guardrails.maxPromptChars && normalized.length > guardrails.maxPromptChars) {
    throw new Error(`Prompt exceeds guardrail maxPromptChars (${guardrails.maxPromptChars})`);
  }
  const lowered = normalized.toLowerCase();
  for (const blocked of guardrails.blockedPatterns) {
    if (lowered.includes(blocked.toLowerCase())) {
      throw new Error(`Prompt blocked by guardrail pattern: ${blocked}`);
    }
  }
  return normalized;
}

export async function buildRuntimeAgent(
  agentType: ManagedAgentType,
  options?: BuildRuntimeAgentOptions,
): Promise<RuntimeAgentResolution> {
  const resolvedConfig = await resolveAgentRuntimeConfig(agentType);

  if (resolvedConfig.source === "static" || !resolvedConfig.instructions.trim().length) {
    throw new Error(`Missing active DB runtime config for agent type: ${agentType}`);
  }

  const requestedTools = options?.requestedToolKeys?.length
    ? options.requestedToolKeys
    : resolvedConfig.enabledToolKeys.length
      ? resolvedConfig.enabledToolKeys
      : (agentToolAllowlist[agentType] ?? []);

  const { tools, enabledToolKeys, rejectedToolKeys } = await resolveRuntimeTools(agentType, requestedTools);
  const meta = agentMeta[agentType];
  const guardrailInstruction = buildGuardrailInstruction(resolvedConfig.guardrails);
  const instructions = `${resolvedConfig.instructions}${guardrailInstruction}`.trim();

  const useSupermemory =
    (agentType === "followup" || agentType === "cold_email") &&
    options?.contactId &&
    env.SUPERMEMORY_API_KEY;

  const baseConfig = {
    id: meta.id,
    name: meta.name,
    description: meta.description,
    model: resolvedConfig.model,
    tools: tools as Record<string, never>,
    instructions,
  };

  const agentConfig = useSupermemory
    ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
      withSupermemory(baseConfig as any, options.contactId!, {
        apiKey: env.SUPERMEMORY_API_KEY,
        mode: "full",
        addMemory: "always",
        threadId: options.threadId ?? options.contactId!,
      })
    : baseConfig;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const runtimeAgent = new Agent(agentConfig as any);

  return {
    agent: runtimeAgent,
    config: resolvedConfig,
    toolKeys: enabledToolKeys,
    rejectedToolKeys: [...resolvedConfig.rejectedToolKeys, ...rejectedToolKeys],
    preparePrompt: (prompt: string) => enforcePromptGuardrails(prompt, resolvedConfig.guardrails),
  };
}
