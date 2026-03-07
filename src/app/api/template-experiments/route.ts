import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRouteContext } from "@/lib/auth/route-context";
import { supabaseServer } from "@/lib/supabase/server";

const createExperimentSchema = z.object({
  campaignId: z.string().uuid(),
  templateId: z.string().uuid(),
  variantVersionIds: z.array(z.string().uuid()).min(2),
  explorationRate: z.number().min(0).max(1).optional().default(0.2),
  minSampleSize: z.number().int().min(1).optional().default(20),
});

export async function GET(request: NextRequest) {
  try {
    const contextResult = await requireRouteContext();
    if (!contextResult.ok) return contextResult.response;
    const { companyId } = contextResult.context;

    const campaignId = request.nextUrl.searchParams.get("campaignId");
    const query = supabaseServer
      .from("email_template_experiments")
      .select("id,campaign_id,template_id,status,optimization_mode,min_sample_size,exploration_rate,winner_variant_id,created_at,updated_at")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false });
    const response = campaignId ? query.eq("campaign_id", campaignId) : query;
    const { data, error } = await response;
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, experiments: data ?? [] });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to list experiments" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const contextResult = await requireRouteContext();
  if (!contextResult.ok) return contextResult.response;
  const { companyId } = contextResult.context;

  const parsed = createExperimentSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.message }, { status: 400 });
  }

  try {
    const payload = parsed.data;
    const { data: experiment, error: experimentError } = await supabaseServer
      .from("email_template_experiments")
      .insert({
        company_id: companyId,
        campaign_id: payload.campaignId,
        template_id: payload.templateId,
        status: "active",
        optimization_mode: "bandit",
        exploration_rate: payload.explorationRate,
        min_sample_size: payload.minSampleSize,
      })
      .select("id,campaign_id,template_id,status,optimization_mode,min_sample_size,exploration_rate")
      .single();
    if (experimentError || !experiment) {
      throw new Error(experimentError?.message ?? "Failed to create experiment");
    }

    const uniqueVariantIds = Array.from(new Set(payload.variantVersionIds));
    const initialWeight = Number((1 / uniqueVariantIds.length).toFixed(4));
    const rows = uniqueVariantIds.map((versionId, index) => ({
      company_id: companyId,
      experiment_id: experiment.id,
      template_version_id: versionId,
      name: `Variant ${String.fromCharCode(65 + index)}`,
      initial_weight: initialWeight,
      dynamic_weight: initialWeight,
      state: "active" as const,
    }));
    const { data: variants, error: variantsError } = await supabaseServer
      .from("email_template_variants")
      .insert(rows)
      .select("id,experiment_id,template_version_id,name,initial_weight,dynamic_weight,state");
    if (variantsError) {
      throw new Error(variantsError.message);
    }

    await supabaseServer
      .from("campaigns")
      .update({ template_experiment_id: experiment.id, updated_at: new Date().toISOString() })
      .eq("company_id", companyId)
      .eq("id", payload.campaignId);

    return NextResponse.json({ ok: true, experiment, variants: variants ?? [] });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to create experiment" },
      { status: 400 },
    );
  }
}
