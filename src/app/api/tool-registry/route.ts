import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRouteContext } from "@/lib/auth/route-context";
import { supabaseServer } from "@/lib/supabase/server";

const registerMcpToolSchema = z.object({
  toolKey: z.string().min(3),
  agentTypesAllowed: z.array(z.string()).default([]),
  mcpServerName: z.string().min(2),
  mcpToolName: z.string().min(2),
  serverEndpoint: z.string().url().optional(),
  validation: z
    .object({
      hasSchema: z.boolean().optional(),
      authConfigured: z.boolean().optional(),
      dryRunPassed: z.boolean().optional(),
      notes: z.string().optional(),
    })
    .default({}),
});

const registerCursorMcpJsonSchema = z.object({
  action: z.literal("register_cursor_mcp_json"),
  config: z.object({
    mcpServers: z.record(
      z.string(),
      z.object({
        url: z.string().url().optional(),
        endpoint: z.string().url().optional(),
        command: z.string().optional(),
        args: z.array(z.string()).optional(),
        env: z.record(z.string(), z.string()).optional(),
        headers: z.record(z.string(), z.string()).optional(),
        tools: z.array(z.string()).optional(),
      }),
    ),
  }),
  agentTypesAllowed: z.array(z.string()).default([]),
});

const activateToolSchema = z.object({
  action: z.literal("activate_tool"),
  toolKey: z.string().min(3),
});

export async function GET() {
  const contextResult = await requireRouteContext();
  if (!contextResult.ok) return contextResult.response;
  const { companyId } = contextResult.context;

  const [toolsResp, serversResp] = await Promise.all([
    supabaseServer
      .from("tool_registry")
      .select("id,tool_key,provider,status,agent_types_allowed,mcp_server_name,mcp_tool_name,validation,updated_at")
      .eq("company_id", companyId)
      .order("tool_key", { ascending: true }),
    supabaseServer
      .from("mcp_servers")
      .select("id,name,status,endpoint,metadata,last_health_check_at,updated_at")
      .eq("company_id", companyId)
      .order("name", { ascending: true }),
  ]);

  if (toolsResp.error || serversResp.error) {
    return NextResponse.json(
      { ok: false, error: toolsResp.error?.message ?? serversResp.error?.message ?? "Failed to load tool registry" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    tools: toolsResp.data ?? [],
    mcpServers: serversResp.data ?? [],
  });
}

export async function POST(request: NextRequest) {
  const contextResult = await requireRouteContext();
  if (!contextResult.ok) return contextResult.response;
  const { companyId } = contextResult.context;

  const body = await request.json();

  const cursorConfigParsed = registerCursorMcpJsonSchema.safeParse(body);
  if (cursorConfigParsed.success) {
    const now = new Date().toISOString();
    const { mcpServers } = cursorConfigParsed.data.config;
    const createdToolKeys: string[] = [];

    for (const [serverName, serverConfig] of Object.entries(mcpServers)) {
      const endpoint = serverConfig.url ?? serverConfig.endpoint ?? null;
      const transport = endpoint ? "json_http_v1" : "stdio_cursor_like";
      const hasSchema = Boolean(serverConfig.tools?.length);
      const authConfigured = Boolean(serverConfig.headers && Object.keys(serverConfig.headers).length > 0);
      const dryRunPassed = false;

      await supabaseServer.from("mcp_servers").upsert(
        {
          company_id: companyId,
          name: serverName,
          endpoint,
          status: "disabled",
          auth_config: serverConfig.headers ?? {},
          metadata: {
            transport,
            cursor_config: serverConfig,
            command: serverConfig.command ?? null,
            args: serverConfig.args ?? [],
            env: serverConfig.env ?? {},
            authConfigured,
            schemaValidated: hasSchema,
            dryRunPassed,
          },
          updated_at: now,
        },
        { onConflict: "name" },
      );

      for (const toolName of serverConfig.tools ?? []) {
        const toolKey = `mcp.${serverName}.${toolName}`;
        createdToolKeys.push(toolKey);
        await supabaseServer.from("tool_registry").upsert(
          {
            company_id: companyId,
            tool_key: toolKey,
            provider: "mcp",
            status: "disabled",
            agent_types_allowed: cursorConfigParsed.data.agentTypesAllowed,
            mcp_server_name: serverName,
            mcp_tool_name: toolName,
            validation: {
              hasSchema,
              authConfigured,
              dryRunPassed,
              notes: "Registered from Cursor-style MCP JSON",
            },
            updated_at: now,
          },
          { onConflict: "tool_key" },
        );
      }
    }

    return NextResponse.json({
      ok: true,
      registeredServers: Object.keys(mcpServers),
      createdToolKeys,
    });
  }

  const parsed = registerMcpToolSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.message }, { status: 400 });
  }

  const now = new Date().toISOString();
  const { mcpServerName, serverEndpoint, validation } = parsed.data;
  const validationPayload = {
    hasSchema: validation.hasSchema ?? false,
    authConfigured: validation.authConfigured ?? false,
    dryRunPassed: validation.dryRunPassed ?? false,
    notes: validation.notes ?? "",
  };

  await supabaseServer.from("mcp_servers").upsert(
    {
      company_id: companyId,
      name: mcpServerName,
      endpoint: serverEndpoint ?? null,
      status: "disabled",
      metadata: {},
      updated_at: now,
    },
    { onConflict: "name" },
  );

  const { data, error } = await supabaseServer
    .from("tool_registry")
    .upsert(
      {
        company_id: companyId,
        tool_key: parsed.data.toolKey,
        provider: "mcp",
        status: "disabled",
        agent_types_allowed: parsed.data.agentTypesAllowed,
        mcp_server_name: parsed.data.mcpServerName,
        mcp_tool_name: parsed.data.mcpToolName,
        validation: validationPayload,
        updated_at: now,
      },
      { onConflict: "tool_key" },
    )
    .select("id,tool_key,provider,status,agent_types_allowed,mcp_server_name,mcp_tool_name,validation")
    .single();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, tool: data });
}

export async function PATCH(request: NextRequest) {
  const contextResult = await requireRouteContext();
  if (!contextResult.ok) return contextResult.response;
  const { companyId } = contextResult.context;

  const body = await request.json();
  const parsed = activateToolSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.message }, { status: 400 });
  }

  const { data: tool, error: toolError } = await supabaseServer
    .from("tool_registry")
    .select("tool_key,provider,mcp_server_name,validation")
    .eq("company_id", companyId)
    .eq("tool_key", parsed.data.toolKey)
    .single();

  if (toolError || !tool) {
    return NextResponse.json({ ok: false, error: toolError?.message ?? "Tool not found" }, { status: 404 });
  }

  if (tool.provider !== "mcp") {
    const { error } = await supabaseServer
      .from("tool_registry")
      .update({ status: "enabled", updated_at: new Date().toISOString() })
      .eq("company_id", companyId)
      .eq("tool_key", parsed.data.toolKey);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  const validation = (tool.validation ?? {}) as {
    hasSchema?: boolean;
    authConfigured?: boolean;
    dryRunPassed?: boolean;
  };
  const serverName = tool.mcp_server_name;
  if (!serverName) {
    return NextResponse.json({ ok: false, error: "MCP server name missing for tool" }, { status: 400 });
  }

  const { data: server, error: serverError } = await supabaseServer
    .from("mcp_servers")
    .select("name,status")
    .eq("company_id", companyId)
    .eq("name", serverName)
    .single();

  if (serverError || !server) {
    return NextResponse.json({ ok: false, error: serverError?.message ?? "MCP server not found" }, { status: 400 });
  }

  if (!validation.hasSchema || !validation.authConfigured || !validation.dryRunPassed) {
    return NextResponse.json(
      { ok: false, error: "Cannot activate MCP tool before schema, auth, and dry-run checks pass" },
      { status: 400 },
    );
  }

  if (server.status !== "enabled") {
    return NextResponse.json({ ok: false, error: "MCP server must be enabled before tool activation" }, { status: 400 });
  }

  const { error } = await supabaseServer
    .from("tool_registry")
    .update({ status: "enabled", updated_at: new Date().toISOString() })
    .eq("company_id", companyId)
    .eq("tool_key", parsed.data.toolKey);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
