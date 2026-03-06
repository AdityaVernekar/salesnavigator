import {
  cladoDeepResearchTool,
  cladoEnrichContactTool,
  cladoGetPostReactionsTool,
  cladoGetProfileTool,
  cladoScrapeLinkedinProfileTool,
  cladoSearchPeopleTool,
} from "@/mastra/tools/clado";
import {
  exaFindSimilarTool,
  exaResearchTool,
  exaSearchAndContentsTool,
  exaSearchTool,
} from "@/mastra/tools/exa";
import { gmailReadTool, gmailSendTool } from "@/mastra/tools/gmail";
import { slackNotifyTool } from "@/mastra/tools/slack";
import type { ManagedAgentType, NativeToolKey } from "@/lib/agents/runtime-types";
import { supabaseServer } from "@/lib/supabase/server";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";

type RuntimeToolDescriptor = {
  runtimeName: string;
  tool: unknown;
};

const nativeToolRegistry: Record<NativeToolKey, RuntimeToolDescriptor> = {
  "exa.search": { runtimeName: "exaSearchTool", tool: exaSearchTool },
  "exa.find_similar": { runtimeName: "exaFindSimilarTool", tool: exaFindSimilarTool },
  "exa.search_contents": { runtimeName: "exaSearchAndContentsTool", tool: exaSearchAndContentsTool },
  "exa.research": { runtimeName: "exaResearchTool", tool: exaResearchTool },
  "clado.search_people": { runtimeName: "cladoSearchPeopleTool", tool: cladoSearchPeopleTool },
  "clado.deep_research": { runtimeName: "cladoDeepResearchTool", tool: cladoDeepResearchTool },
  "clado.get_profile": { runtimeName: "cladoGetProfileTool", tool: cladoGetProfileTool },
  "clado.enrich_contact": { runtimeName: "cladoEnrichContactTool", tool: cladoEnrichContactTool },
  "clado.scrape_linkedin_profile": { runtimeName: "cladoScrapeLinkedinProfileTool", tool: cladoScrapeLinkedinProfileTool },
  "clado.get_post_reactions": { runtimeName: "cladoGetPostReactionsTool", tool: cladoGetPostReactionsTool },
  "gmail.send": { runtimeName: "gmailSendTool", tool: gmailSendTool },
  "gmail.read": { runtimeName: "gmailReadTool", tool: gmailReadTool },
  "slack.notify": { runtimeName: "slackNotifyTool", tool: slackNotifyTool },
};

export const agentToolAllowlist: Record<ManagedAgentType, string[]> = {
  lead_gen: ["exa.search", "exa.find_similar", "exa.research"],
  people_gen: ["clado.search_people", "clado.deep_research", "exa.search", "exa.research"],
  enrichment: ["clado.get_profile", "clado.enrich_contact", "exa.search_contents"],
  scoring: [],
  cold_email: ["gmail.send", "exa.search", "clado.scrape_linkedin_profile", "clado.get_post_reactions"],
  followup: ["gmail.read", "gmail.send", "slack.notify"],
};

function toRuntimeToolName(toolKey: string) {
  return `${toolKey.replace(/[^a-zA-Z0-9]/g, "_")}Tool`;
}

type McpRegistryRow = {
  tool_key: string;
  mcp_server_name: string | null;
  mcp_tool_name: string | null;
};

type McpServerRow = {
  name: string;
  status: "enabled" | "disabled";
  endpoint: string | null;
  auth_config: Record<string, unknown> | null;
};

function buildMcpProxyTool(def: { toolKey: string; serverName: string; toolName: string; endpoint: string; headers: Record<string, string> }) {
  return createTool({
    id: `mcp-${def.toolKey}`.replace(/[^a-zA-Z0-9-_]/g, "-"),
    description: `Calls MCP tool ${def.serverName}.${def.toolName} via configured HTTP endpoint.`,
    inputSchema: z.record(z.any()),
    outputSchema: z.object({
      ok: z.boolean(),
      data: z.any().optional(),
      error: z.string().nullable(),
    }),
    execute: async (inputData) => {
      try {
        const response = await fetch(def.endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...def.headers,
          },
          body: JSON.stringify({
            server: def.serverName,
            tool: def.toolName,
            arguments: inputData,
          }),
        });
        const data = await response.json().catch(() => null);
        if (!response.ok) {
          return {
            ok: false,
            data,
            error: `MCP call failed with status ${response.status}`,
          };
        }
        return { ok: true, data, error: null };
      } catch (error) {
        return {
          ok: false,
          data: null,
          error: error instanceof Error ? error.message : "MCP call failed",
        };
      }
    },
  });
}

export async function resolveRuntimeTools(
  agentType: ManagedAgentType,
  requestedToolKeys: string[],
): Promise<{
  tools: Record<string, unknown>;
  enabledToolKeys: string[];
  rejectedToolKeys: string[];
}> {
  const allowlist = new Set(agentToolAllowlist[agentType] ?? []);
  const enabledToolKeys: string[] = [];
  const rejectedToolKeys: string[] = [];
  const tools: Record<string, unknown> = {};
  const requestedMcpKeys: string[] = [];

  for (const key of requestedToolKeys) {
    if (!allowlist.has(key) && !key.startsWith("mcp.")) {
      rejectedToolKeys.push(key);
      continue;
    }
    const descriptor = nativeToolRegistry[key as NativeToolKey];
    if (!descriptor) {
      requestedMcpKeys.push(key);
      continue;
    }
    tools[descriptor.runtimeName] = descriptor.tool;
    enabledToolKeys.push(key);
  }

  if (requestedMcpKeys.length) {
    const { data: mcpToolRows } = await supabaseServer
      .from("tool_registry")
      .select("tool_key,mcp_server_name,mcp_tool_name")
      .in("tool_key", requestedMcpKeys)
      .eq("provider", "mcp")
      .eq("status", "enabled");

    const toolRows = (mcpToolRows ?? []) as McpRegistryRow[];
    const serverNames = Array.from(new Set(toolRows.map((row) => row.mcp_server_name).filter((name): name is string => Boolean(name))));
    const { data: mcpServers } = serverNames.length
      ? await supabaseServer
          .from("mcp_servers")
          .select("name,status,endpoint,auth_config")
          .in("name", serverNames)
      : { data: [] as McpServerRow[] };
    const serversByName = new Map<string, McpServerRow>(
      ((mcpServers ?? []) as McpServerRow[]).map((server) => [server.name, server]),
    );

    for (const toolKey of requestedMcpKeys) {
      const toolRow = toolRows.find((row) => row.tool_key === toolKey);
      if (!toolRow?.mcp_server_name || !toolRow.mcp_tool_name) {
        rejectedToolKeys.push(toolKey);
        continue;
      }
      const server = serversByName.get(toolRow.mcp_server_name);
      if (!server || server.status !== "enabled" || !server.endpoint) {
        rejectedToolKeys.push(toolKey);
        continue;
      }

      const authConfig = (server.auth_config ?? {}) as Record<string, unknown>;
      const headers = Object.fromEntries(
        Object.entries(authConfig).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
      );
      tools[toRuntimeToolName(toolKey)] = buildMcpProxyTool({
        toolKey,
        serverName: toolRow.mcp_server_name,
        toolName: toolRow.mcp_tool_name,
        endpoint: server.endpoint,
        headers,
      });
      enabledToolKeys.push(toolKey);
    }
  }

  return { tools, enabledToolKeys, rejectedToolKeys };
}
