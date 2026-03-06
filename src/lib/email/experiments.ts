import { supabaseServer } from "@/lib/supabase/server";

type VariantScore = {
  variantId: string;
  sends: number;
  opens: number;
  replies: number;
  reward: number;
};

export async function getActiveExperimentForCampaign(campaignId: string) {
  const { data, error } = await supabaseServer
    .from("email_template_experiments")
    .select("id,campaign_id,template_id,status,optimization_mode,min_sample_size,exploration_rate,winner_variant_id")
    .eq("campaign_id", campaignId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function getExperimentVariants(experimentId: string) {
  const { data, error } = await supabaseServer
    .from("email_template_variants")
    .select("id,experiment_id,template_version_id,name,initial_weight,dynamic_weight,state")
    .eq("experiment_id", experimentId)
    .eq("state", "active");
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function chooseVariant(input: {
  campaignId: string;
  experimentId: string;
  contactId: string;
  explorationRate: number;
  minSampleSize: number;
}) {
  const { data: priorEvent } = await supabaseServer
    .from("email_variant_events")
    .select("variant_id")
    .eq("campaign_id", input.campaignId)
    .eq("contact_id", input.contactId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (priorEvent?.variant_id) {
    const { data: variant } = await supabaseServer
      .from("email_template_variants")
      .select("id,experiment_id,template_version_id,name,initial_weight,dynamic_weight,state")
      .eq("id", priorEvent.variant_id)
      .maybeSingle();
    if (variant) return variant;
  }

  const variants = await getExperimentVariants(input.experimentId);
  if (!variants.length) {
    throw new Error("No active variants configured");
  }

  const variantIds = variants.map((item) => item.id);
  const { data: aggregateEvents } = await supabaseServer
    .from("email_variant_events")
    .select("variant_id,reward,opened_at,replied_at,sent_at")
    .in("variant_id", variantIds);

  const byVariant = new Map<string, VariantScore>();
  for (const variant of variants) {
    byVariant.set(variant.id, { variantId: variant.id, sends: 0, opens: 0, replies: 0, reward: 0 });
  }
  for (const event of aggregateEvents ?? []) {
    const score = byVariant.get(event.variant_id);
    if (!score) continue;
    if (event.sent_at) score.sends += 1;
    if (event.opened_at) score.opens += 1;
    if (event.replied_at) score.replies += 1;
    score.reward += Number(event.reward ?? 0);
  }

  const totalSends = Array.from(byVariant.values()).reduce((sum, item) => sum + item.sends, 0);
  const epsilon = Math.max(0, Math.min(1, input.explorationRate));
  const shouldExplore = totalSends < input.minSampleSize || Math.random() < epsilon;
  if (shouldExplore) {
    const randomIndex = Math.floor(Math.random() * variants.length);
    return variants[randomIndex];
  }

  let bestVariant = variants[0];
  let bestScore = -Infinity;
  for (const variant of variants) {
    const score = byVariant.get(variant.id);
    if (!score) continue;
    const exploitationScore = score.sends > 0 ? score.reward / score.sends : 0;
    if (exploitationScore > bestScore) {
      bestScore = exploitationScore;
      bestVariant = variant;
    }
  }
  return bestVariant;
}

export async function recordVariantSend(input: {
  campaignId: string;
  contactId: string;
  enrollmentId?: string | null;
  variantId: string;
  templateVersionId?: string | null;
  sentAt: string;
}) {
  const { data, error } = await supabaseServer
    .from("email_variant_events")
    .insert({
      campaign_id: input.campaignId,
      contact_id: input.contactId,
      enrollment_id: input.enrollmentId ?? null,
      variant_id: input.variantId,
      template_version_id: input.templateVersionId ?? null,
      sent_at: input.sentAt,
      reward: 0,
    })
    .select("id,campaign_id,contact_id,variant_id,template_version_id,sent_at,reward")
    .single();
  if (error || !data) {
    throw new Error(error?.message ?? "Failed to record variant event");
  }
  return data;
}
