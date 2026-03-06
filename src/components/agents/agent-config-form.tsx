import { revalidatePath } from "next/cache";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DEFAULT_LLM_MODEL } from "@/lib/ai/default-model";
import {
  activateConfigVersion,
  createConfigVersion,
  ensureConfig,
  getConfigByType,
  getConfigVersions,
  listToolRegistry,
  type AgentConfigType,
} from "@/lib/agents/config-db";
import { supabaseServer } from "@/lib/supabase/server";

function safeJsonParse(value: string, fallback: Record<string, unknown>) {
  if (!value.trim()) return fallback;
  try {
    const parsed = JSON.parse(value);
    return typeof parsed === "object" && parsed !== null ? parsed : fallback;
  } catch {
    return fallback;
  }
}

export async function AgentConfigForm({ type }: { type: AgentConfigType }) {
  const config = (await getConfigByType(type)) ?? (await ensureConfig(type));
  const [versions, registry] = await Promise.all([getConfigVersions(config.id), listToolRegistry()]);
  const activeVersionId = config.active_version_id;
  const selectableTools = registry;

  async function saveVersion(formData: FormData) {
    "use server";
    const model = String(formData.get("model") ?? DEFAULT_LLM_MODEL).trim();
    const name = String(formData.get("name") ?? `${type}-config`).trim();
    const systemPrompt = String(formData.get("prompt") ?? "").trim();
    const changeNote = String(formData.get("changeNote") ?? "").trim();
    const temperature = Number(formData.get("temperature") ?? 0.3);
    const maxTokens = Number(formData.get("maxTokens") ?? 4096);
    const toolsEnabled = formData.getAll("toolsEnabled").map((value) => String(value));
    const promptVars = safeJsonParse(String(formData.get("promptVars") ?? "{}"), {});
    const toolConfigs = safeJsonParse(String(formData.get("toolConfigs") ?? "{}"), {});
    const guardrails = safeJsonParse(String(formData.get("guardrails") ?? "{}"), {});

    await createConfigVersion({
      type,
      name,
      model,
      systemPrompt,
      changeNote: changeNote || "Updated from settings",
      temperature: Number.isFinite(temperature) ? temperature : 0.3,
      maxTokens: Number.isFinite(maxTokens) ? maxTokens : 4096,
      toolsEnabled,
      promptVars,
      toolConfigs,
      guardrails,
      activate: true,
      createdBy: "settings-ui",
    });
    revalidatePath(`/settings/agents/${type}`);
  }

  async function activateVersion(formData: FormData) {
    "use server";
    const versionId = String(formData.get("versionId") ?? "");
    if (!versionId) return;
    await activateConfigVersion(config.id, versionId);
    revalidatePath(`/settings/agents/${type}`);
  }

  async function rollbackVersion() {
    "use server";
    const latest = await getConfigVersions(config.id);
    if (latest.length < 2) return;
    await activateConfigVersion(config.id, latest[1].id);
    revalidatePath(`/settings/agents/${type}`);
  }

  async function registerMcpTool(formData: FormData) {
    "use server";
    const serverName = String(formData.get("mcpServerName") ?? "").trim();
    const toolName = String(formData.get("mcpToolName") ?? "").trim();
    const toolKey = String(formData.get("mcpToolKey") ?? "").trim();
    const endpoint = String(formData.get("mcpEndpoint") ?? "").trim();
    if (!serverName || !toolName || !toolKey) return;

    await supabaseServer.from("mcp_servers").upsert(
      {
        name: serverName,
        endpoint: endpoint || null,
        status: "disabled",
        metadata: {
          authConfigured: false,
          schemaValidated: false,
          dryRunPassed: false,
        },
        updated_at: new Date().toISOString(),
      },
      { onConflict: "name" },
    );

    await supabaseServer.from("tool_registry").upsert(
      {
        tool_key: toolKey,
        provider: "mcp",
        status: "disabled",
        agent_types_allowed: [type],
        mcp_server_name: serverName,
        mcp_tool_name: toolName,
        validation: {
          hasSchema: false,
          authConfigured: false,
          dryRunPassed: false,
          notes: "Pending validation",
        },
        updated_at: new Date().toISOString(),
      },
      { onConflict: "tool_key" },
    );

    revalidatePath(`/settings/agents/${type}`);
  }

  async function registerCursorMcpJson(formData: FormData) {
    "use server";
    const rawJson = String(formData.get("cursorMcpJson") ?? "").trim();
    if (!rawJson) return;

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawJson);
    } catch {
      return;
    }
    if (!parsed || typeof parsed !== "object" || !("mcpServers" in parsed)) return;

    const mcpServers = (parsed as { mcpServers?: Record<string, unknown> }).mcpServers;
    if (!mcpServers || typeof mcpServers !== "object") return;

    const now = new Date().toISOString();
    for (const [server, config] of Object.entries(mcpServers)) {
      if (!config || typeof config !== "object") continue;
      const cfg = config as {
        url?: string;
        endpoint?: string;
        command?: string;
        args?: string[];
        env?: Record<string, string>;
        headers?: Record<string, string>;
        tools?: string[];
      };
      const endpoint = cfg.url ?? cfg.endpoint ?? null;
      const tools = Array.isArray(cfg.tools) ? cfg.tools.filter((tool) => typeof tool === "string") : [];
      const hasSchema = tools.length > 0;
      const authConfigured = Boolean(cfg.headers && Object.keys(cfg.headers).length > 0);

      await supabaseServer.from("mcp_servers").upsert(
        {
          name: server,
          endpoint,
          status: "disabled",
          auth_config: cfg.headers ?? {},
          metadata: {
            transport: endpoint ? "json_http_v1" : "stdio_cursor_like",
            cursor_config: cfg,
            command: cfg.command ?? null,
            args: cfg.args ?? [],
            env: cfg.env ?? {},
            authConfigured,
            schemaValidated: hasSchema,
            dryRunPassed: false,
          },
          updated_at: now,
        },
        { onConflict: "name" },
      );

      for (const toolName of tools) {
        const toolKey = `mcp.${server}.${toolName}`;
        await supabaseServer.from("tool_registry").upsert(
          {
            tool_key: toolKey,
            provider: "mcp",
            status: "disabled",
            agent_types_allowed: [type],
            mcp_server_name: server,
            mcp_tool_name: toolName,
            validation: {
              hasSchema: true,
              authConfigured,
              dryRunPassed: false,
              notes: "Registered from Cursor-style JSON",
            },
            updated_at: now,
          },
          { onConflict: "tool_key" },
        );
      }
    }
    revalidatePath(`/settings/agents/${type}`);
  }

  const currentVersion = versions.find((version) => version.id === activeVersionId) ?? versions[0] ?? null;
  const defaultTools = (currentVersion?.tools_enabled ?? config.tools_enabled ?? []) as string[];

  return (
    <div className="space-y-6">
      <form action={saveVersion} className="space-y-4 rounded border p-4">
        <div className="space-y-2">
          <Label htmlFor="name">Config Name</Label>
          <Input id="name" name="name" defaultValue={currentVersion?.name ?? config.name} />
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="model">Model</Label>
            <Input
              id="model"
              name="model"
              defaultValue={currentVersion?.model ?? config.model ?? DEFAULT_LLM_MODEL}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="temperature">Temperature</Label>
            <Input
              id="temperature"
              name="temperature"
              type="number"
              step="0.1"
              min="0"
              max="2"
              defaultValue={String(currentVersion?.temperature ?? config.temperature ?? 0.3)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="maxTokens">Max Tokens</Label>
            <Input
              id="maxTokens"
              name="maxTokens"
              type="number"
              min="256"
              max="32000"
              defaultValue={String(currentVersion?.max_tokens ?? config.max_tokens ?? 4096)}
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="prompt">System Prompt</Label>
          <Textarea
            id="prompt"
            name="prompt"
            defaultValue={currentVersion?.system_prompt ?? config.system_prompt}
            className="min-h-56"
          />
        </div>
        <div className="space-y-2">
          <Label>Enabled Tools</Label>
          <div className="grid gap-2 md:grid-cols-2">
            {selectableTools.map((tool) => (
              <label key={tool.tool_key} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="toolsEnabled"
                  value={tool.tool_key as string}
                  defaultChecked={defaultTools.includes(tool.tool_key as string)}
                />
                <span>
                  {String(tool.tool_key)} ({String(tool.provider)}/{String(tool.status)})
                </span>
              </label>
            ))}
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="promptVars">Prompt Vars (JSON)</Label>
            <Textarea
              id="promptVars"
              name="promptVars"
              className="min-h-28 font-mono text-xs"
              defaultValue={JSON.stringify(currentVersion?.prompt_vars ?? config.prompt_vars ?? {}, null, 2)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="toolConfigs">Tool Configs (JSON)</Label>
            <Textarea
              id="toolConfigs"
              name="toolConfigs"
              className="min-h-28 font-mono text-xs"
              defaultValue={JSON.stringify(currentVersion?.tool_configs ?? config.tool_configs ?? {}, null, 2)}
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="guardrails">Guardrails (JSON)</Label>
          <Textarea
            id="guardrails"
            name="guardrails"
            className="min-h-28 font-mono text-xs"
            defaultValue={JSON.stringify(
              currentVersion?.guardrails ??
                config.guardrails ?? {
                  prependInstructions: [],
                  blockedPatterns: [],
                  maxPromptChars: null,
                },
              null,
              2,
            )}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="changeNote">Change Note</Label>
          <Input id="changeNote" name="changeNote" placeholder="Why this version was created" />
        </div>
        <Button type="submit">Save as New Version and Activate</Button>
      </form>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <CardTitle>Version History</CardTitle>
            <form action={rollbackVersion}>
              <Button type="submit" size="sm" variant="outline" disabled={versions.length < 2}>
                Rollback to Previous
              </Button>
            </form>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {versions.map((version) => (
            <div key={version.id} className="flex flex-wrap items-center justify-between gap-2 rounded border p-2 text-sm">
              <div>
                <p className="font-medium">
                  v{version.version} - {version.name}
                </p>
                <p className="text-muted-foreground">
                  model={version.model} | tools={version.tools_enabled?.length ?? 0} | {new Date(version.created_at).toLocaleString()}
                </p>
                {version.change_note ? <p className="text-muted-foreground">{version.change_note}</p> : null}
              </div>
              {version.id === activeVersionId ? (
                <span className="rounded border px-2 py-1 text-xs">Active</span>
              ) : (
                <form action={activateVersion}>
                  <input type="hidden" name="versionId" value={version.id} />
                  <Button type="submit" size="sm" variant="outline">
                    Activate
                  </Button>
                </form>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <form action={registerMcpTool} className="space-y-3 rounded border p-4">
        <h2 className="text-lg font-medium">Register MCP Tool</h2>
        <p className="text-sm text-muted-foreground">
          New MCP tools are created in disabled state and require activation checks before use.
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="mcpServerName">MCP Server Name</Label>
            <Input id="mcpServerName" name="mcpServerName" placeholder="hubspot-mcp" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="mcpToolName">MCP Tool Name</Label>
            <Input id="mcpToolName" name="mcpToolName" placeholder="create_contact" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="mcpToolKey">Tool Key</Label>
            <Input id="mcpToolKey" name="mcpToolKey" placeholder="mcp.hubspot.create_contact" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="mcpEndpoint">Endpoint (optional)</Label>
            <Input id="mcpEndpoint" name="mcpEndpoint" placeholder="https://mcp.example.com" />
          </div>
        </div>
        <Button type="submit" variant="outline">
          Register Disabled MCP Tool
        </Button>
      </form>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle>MCP Activation Checklist</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Use the API endpoints to set server status and validation flags before enabling MCP tools.
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            <li>PATCH `/api/mcp-servers` to mark server enabled and health-checked.</li>
            <li>PATCH `/api/tool-registry` with `action=activate_tool` after schema/auth/dry-run checks are true.</li>
            <li>For runtime usage, MCP server endpoint must expose JSON HTTP execution: <code>{`{ server, tool, arguments }`}</code>.</li>
          </ul>
        </CardContent>
      </Card>

      <form action={registerCursorMcpJson} className="space-y-3 rounded border p-4">
        <h2 className="text-lg font-medium">Import Cursor MCP JSON</h2>
        <p className="text-sm text-muted-foreground">
          Paste a Cursor-style JSON object with `mcpServers`. Each tool is registered as `mcp.&lt;server&gt;.&lt;tool&gt;` in disabled state.
        </p>
        <Textarea
          id="cursorMcpJson"
          name="cursorMcpJson"
          className="min-h-40 font-mono text-xs"
          placeholder={JSON.stringify(
            {
              mcpServers: {
                hubspot: {
                  url: "https://mcp.example.com/execute",
                  headers: { Authorization: "Bearer token" },
                  tools: ["create_contact", "search_contacts"],
                },
              },
            },
            null,
            2,
          )}
        />
        <Button type="submit" variant="outline">
          Import MCP JSON
        </Button>
      </form>
    </div>
  );
}
