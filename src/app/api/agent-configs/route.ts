import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  activateConfigVersion,
  createConfigVersion,
  getConfigByType,
  getConfigVersions,
  listToolRegistry,
  normalizeAgentConfigType,
} from "@/lib/agents/config-db";
import { DEFAULT_LLM_MODEL } from "@/lib/ai/default-model";
import { supabaseServer } from "@/lib/supabase/server";

const createVersionSchema = z.object({
  type: z.string(),
  name: z.string().min(1),
  systemPrompt: z.string().min(1),
  model: z.string().min(1).default(DEFAULT_LLM_MODEL),
  temperature: z.number().min(0).max(2).default(0.3),
  maxTokens: z.number().int().min(256).max(32000).default(4096),
  toolsEnabled: z.array(z.string()).default([]),
  promptVars: z.record(z.string(), z.any()).default({}),
  toolConfigs: z.record(z.string(), z.any()).default({}),
  guardrails: z.record(z.string(), z.any()).default({}),
  changeNote: z.string().optional(),
  createdBy: z.string().optional(),
  activate: z.boolean().optional().default(true),
});

const activateSchema = z.object({
  configId: z.string().uuid(),
  versionId: z.string().uuid(),
});

const rollbackSchema = z.object({
  action: z.literal("rollback"),
  configId: z.string().uuid(),
});

export async function GET(request: NextRequest) {
  const typeParam = request.nextUrl.searchParams.get("type");
  if (!typeParam) {
    const { data, error } = await supabaseServer.from("agent_configs").select("*").eq("is_active", true);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, configs: data ?? [] });
  }

  const type = normalizeAgentConfigType(typeParam);
  if (!type) {
    return NextResponse.json({ ok: false, error: "Invalid agent type" }, { status: 400 });
  }

  const config = await getConfigByType(type);
  if (!config) {
    return NextResponse.json({ ok: true, config: null, versions: [], tools: [] });
  }
  const [versions, tools] = await Promise.all([getConfigVersions(config.id), listToolRegistry()]);
  return NextResponse.json({ ok: true, config, versions, tools });
}

export async function POST(request: NextRequest) {
  const body = await request.json();

  if (body?.action === "activate") {
    const parsed = activateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: parsed.error.message }, { status: 400 });
    }
    try {
      await activateConfigVersion(parsed.data.configId, parsed.data.versionId);
      return NextResponse.json({ ok: true });
    } catch (error) {
      return NextResponse.json(
        { ok: false, error: error instanceof Error ? error.message : "Activation failed" },
        { status: 400 },
      );
    }
  }

  if (body?.action === "rollback") {
    const parsed = rollbackSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: parsed.error.message }, { status: 400 });
    }
    try {
      const versions = await getConfigVersions(parsed.data.configId);
      if (versions.length < 2) {
        return NextResponse.json({ ok: false, error: "No previous version available to rollback" }, { status: 400 });
      }
      await activateConfigVersion(parsed.data.configId, versions[1].id);
      return NextResponse.json({ ok: true, rolledBackToVersionId: versions[1].id });
    } catch (error) {
      return NextResponse.json(
        { ok: false, error: error instanceof Error ? error.message : "Rollback failed" },
        { status: 400 },
      );
    }
  }

  const parsed = createVersionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.message }, { status: 400 });
  }

  const normalizedType = normalizeAgentConfigType(parsed.data.type);
  if (!normalizedType) {
    return NextResponse.json({ ok: false, error: "Invalid agent type" }, { status: 400 });
  }

  try {
    const result = await createConfigVersion({
      ...parsed.data,
      type: normalizedType,
    });
    return NextResponse.json({ ok: true, config: result.config, version: result.version });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Version creation failed" },
      { status: 400 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  const body = await request.json();
  const { id, ...updates } = body;
  const { data, error } = await supabaseServer
    .from("agent_configs")
    .update(updates)
    .eq("id", id)
    .select("*")
    .single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, config: data });
}
