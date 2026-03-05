import { Agent } from "@mastra/core/agent";
import { resolveAgentRuntimeConfig } from "@/lib/agents/runtime-config";
import type { ManagedAgentType, ResolvedRuntimeConfig } from "@/lib/agents/runtime-types";
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
};

export async function buildRuntimeAgent(agentType: ManagedAgentType): Promise<RuntimeAgentResolution> {
  const resolvedConfig = await resolveAgentRuntimeConfig(agentType);

  if (resolvedConfig.source === "static" || !resolvedConfig.instructions.trim().length) {
    throw new Error(`Missing active DB runtime config for agent type: ${agentType}`);
  }

  const requestedTools = resolvedConfig.enabledToolKeys.length
    ? resolvedConfig.enabledToolKeys
    : (agentToolAllowlist[agentType] ?? []);

  const { tools, enabledToolKeys, rejectedToolKeys } = await resolveRuntimeTools(agentType, requestedTools);
  const meta = agentMeta[agentType];

  const runtimeAgent = new Agent({
    id: meta.id,
    name: meta.name,
    description: meta.description,
    model: resolvedConfig.model,
    tools: tools as Record<string, never>,
    instructions: resolvedConfig.instructions,
  });

  return {
    agent: runtimeAgent,
    config: resolvedConfig,
    toolKeys: enabledToolKeys,
    rejectedToolKeys: [...resolvedConfig.rejectedToolKeys, ...rejectedToolKeys],
  };
}
