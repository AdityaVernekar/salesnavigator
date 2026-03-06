import { NextResponse } from "next/server";
import { z } from "zod";
import { buildRuntimeAgent } from "@/lib/agents/build-runtime-agent";
import { logRunEvent, updateRunState } from "@/lib/pipeline/run-state";
import { supabaseServer } from "@/lib/supabase/server";

const paramsSchema = z.object({
  id: z.string().uuid(),
});

const deepResearchOutputSchema = z.object({
  company_description: z.string().min(1),
  fit_reasoning: z.string().min(1),
});

async function runLeadDeepResearch(runId: string, leadId: string) {
  await updateRunState(runId, {
    status: "running",
    current_stage: "enrichment",
  });
  const { data: lead } = await supabaseServer
    .from("leads")
    .select("id,campaign_id,company_name,company_domain,linkedin_url,exa_url,raw_data")
    .eq("id", leadId)
    .maybeSingle();

  if (!lead) {
    await updateRunState(runId, {
      status: "failed",
      current_stage: "failed",
      error: "Lead not found",
      finished_at: new Date().toISOString(),
    });
    await logRunEvent(runId, "enrichment", "error", "Lead deep research failed: lead not found", {
      leadId,
    });
    return;
  }

  const { data: campaign } = lead.campaign_id
    ? await supabaseServer
        .from("campaigns")
        .select("id,name,icp_description,scoring_rubric,target_roles,target_industries,company_size,company_signals,disqualify_signals")
        .eq("id", lead.campaign_id)
        .maybeSingle()
    : { data: null };

  try {
    await logRunEvent(runId, "enrichment", "info", "Lead deep research started", {
      leadId,
      campaignId: lead.campaign_id,
      companyName: lead.company_name,
      companyDomain: lead.company_domain,
    });
    const runtime = await buildRuntimeAgent("people_gen", {
      requestedToolKeys: ["exa.research", "exa.search"],
    });
    await logRunEvent(runId, "enrichment", "info", "Deep research runtime loaded", {
      configVersionId: runtime.config.configVersionId,
      toolsEnabled: runtime.toolKeys,
      toolsRejected: runtime.rejectedToolKeys,
    });
    const prompt = [
      "Research this company deeply for outbound campaign fit.",
      "Use available Exa tools and return only factual synthesis.",
      "Return JSON with exactly these fields: company_description, fit_reasoning.",
      "",
      "Lead context:",
      `company_name: ${lead.company_name ?? ""}`,
      `company_domain: ${lead.company_domain ?? ""}`,
      `linkedin_url: ${lead.linkedin_url ?? ""}`,
      `exa_url: ${lead.exa_url ?? ""}`,
      `lead_raw_data: ${JSON.stringify(lead.raw_data ?? {})}`,
      "",
      "Campaign context:",
      `campaign_name: ${campaign?.name ?? ""}`,
      `icp_description: ${campaign?.icp_description ?? ""}`,
      `scoring_rubric: ${campaign?.scoring_rubric ?? ""}`,
      `target_roles: ${JSON.stringify(campaign?.target_roles ?? [])}`,
      `target_industries: ${JSON.stringify(campaign?.target_industries ?? [])}`,
      `company_size: ${campaign?.company_size ?? ""}`,
      `company_signals: ${campaign?.company_signals ?? ""}`,
      `disqualify_signals: ${campaign?.disqualify_signals ?? ""}`,
    ].join("\n");

    const stream = await runtime.agent.stream(runtime.preparePrompt(prompt), {
      structuredOutput: { schema: deepResearchOutputSchema },
      maxSteps: 8,
    });
    const result = await stream.object;

    await supabaseServer
      .from("leads")
      .update({
        company_description: result.company_description,
        fit_reasoning: result.fit_reasoning,
        researched_at: new Date().toISOString(),
      })
      .eq("id", lead.id);

    await logRunEvent(runId, "enrichment", "success", "Lead deep research completed", {
      leadId: lead.id,
      companyDescriptionChars: result.company_description.length,
      fitReasoningChars: result.fit_reasoning.length,
      companyDescriptionPreview: result.company_description.slice(0, 240),
      fitReasoningPreview: result.fit_reasoning.slice(0, 240),
    });
    await updateRunState(runId, {
      status: "completed",
      current_stage: "completed",
      leads_enriched: 1,
      finished_at: new Date().toISOString(),
      error: null,
    });
  } catch (error) {
    await supabaseServer
      .from("leads")
      .update({
        researched_at: new Date().toISOString(),
        fit_reasoning: `Deep research failed: ${error instanceof Error ? error.message : String(error)}`,
      })
      .eq("id", lead.id);
    const message =
      error instanceof Error ? error.message : String(error);
    await logRunEvent(runId, "enrichment", "error", "Lead deep research failed", {
      leadId: lead.id,
      error: message,
    });
    await updateRunState(runId, {
      status: "failed",
      current_stage: "failed",
      error: message,
      finished_at: new Date().toISOString(),
    });
  }
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const parsed = paramsSchema.safeParse(await params);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid lead id" }, { status: 400 });
  }

  const { data: lead } = await supabaseServer
    .from("leads")
    .select("id,campaign_id,company_name,company_domain")
    .eq("id", parsed.data.id)
    .maybeSingle();

  if (!lead) {
    return NextResponse.json({ ok: false, error: "Lead not found" }, { status: 404 });
  }

  const { data: run, error: runError } = await supabaseServer
    .from("pipeline_runs")
    .insert({
      campaign_id: lead.campaign_id,
      trigger: "manual",
      status: "running",
      current_stage: "queued",
      run_mode: "custom",
      start_stage: "enrichment",
      end_stage: "enrichment",
      selected_stages: ["enrichment"],
      run_config: {
        action: "lead_deep_research",
        leadId: lead.id,
      },
    })
    .select("id")
    .single();

  if (runError || !run) {
    return NextResponse.json(
      { ok: false, error: runError?.message ?? "Failed to create run" },
      { status: 500 },
    );
  }

  await logRunEvent(run.id, "pipeline", "info", "Lead deep research queued", {
    leadId: lead.id,
    campaignId: lead.campaign_id,
    companyName: lead.company_name,
    companyDomain: lead.company_domain,
  });

  void runLeadDeepResearch(run.id, parsed.data.id);
  return NextResponse.json({
    ok: true,
    queued: true,
    leadId: parsed.data.id,
    runId: run.id,
  });
}
