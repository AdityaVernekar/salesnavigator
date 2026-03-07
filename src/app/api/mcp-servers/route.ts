import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRouteContext } from "@/lib/auth/route-context";
import { supabaseServer } from "@/lib/supabase/server";

const updateServerSchema = z.object({
  name: z.string().min(2),
  status: z.enum(["enabled", "disabled"]),
  endpoint: z.string().url().optional(),
  authConfigured: z.boolean().optional(),
  schemaValidated: z.boolean().optional(),
  dryRunPassed: z.boolean().optional(),
});

export async function GET() {
  const contextResult = await requireRouteContext();
  if (!contextResult.ok) return contextResult.response;
  const { companyId } = contextResult.context;

  const { data, error } = await supabaseServer
    .from("mcp_servers")
    .select("id,name,status,endpoint,auth_config,metadata,last_health_check_at,updated_at")
    .eq("company_id", companyId)
    .order("name", { ascending: true });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, servers: data ?? [] });
}

export async function PATCH(request: NextRequest) {
  const contextResult = await requireRouteContext();
  if (!contextResult.ok) return contextResult.response;
  const { companyId } = contextResult.context;

  const body = await request.json();
  const parsed = updateServerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.message }, { status: 400 });
  }

  const metadataPatch = {
    authConfigured: parsed.data.authConfigured ?? false,
    schemaValidated: parsed.data.schemaValidated ?? false,
    dryRunPassed: parsed.data.dryRunPassed ?? false,
  };

  const { error } = await supabaseServer
    .from("mcp_servers")
    .update({
      status: parsed.data.status,
      endpoint: parsed.data.endpoint ?? null,
      metadata: metadataPatch,
      last_health_check_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("company_id", companyId)
    .eq("name", parsed.data.name);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
