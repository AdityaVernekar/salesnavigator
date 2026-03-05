import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";
import {
  contactsOutputSchema,
  leadsOutputSchema,
  peopleOutputSchema,
  scoresOutputSchema,
} from "@/mastra/schemas";
import { logRunEvent, updateRunState } from "@/lib/pipeline/run-state";
import {
  EXECUTABLE_PIPELINE_STAGES,
  type ExecutablePipelineStage,
} from "@/lib/pipeline/stages";
import { supabaseServer } from "@/lib/supabase/server";
import { withRetries } from "@/lib/pipeline/retry";
import { buildRuntimeAgent } from "@/lib/agents/build-runtime-agent";
import { env } from "@/lib/config/env";
import { selectSendingAccount } from "@/lib/email/router";
import { sendEmailWithComposio } from "@/lib/composio/gmail";
import { getActiveExperimentForCampaign, chooseVariant, recordVariantSend } from "@/lib/email/experiments";
import { renderTemplate, renderTemplateBodies } from "@/lib/email/templates";
import { pipelineRunConfigSchema } from "@/lib/pipeline/run-config";

function safeParseJson(value: string | null): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return typeof parsed === "object" && parsed !== null ? parsed : { data: value };
  } catch {
    return { data: value };
  }
}

function normalizeText(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function normalizeLinkedinUrl(value: string | null | undefined) {
  if (!value) return "";
  return value.trim().toLowerCase().replace(/\/+$/, "");
}

function leadKey(value: { company_domain: string | null; company_name: string | null }) {
  const domain = normalizeText(value.company_domain).replace(/^www\./, "");
  if (domain) return `domain:${domain}`;
  const companyName = normalizeText(value.company_name);
  if (companyName) return `name:${companyName}`;
  return null;
}

function contactKey(value: { lead_id: string; linkedin_url: string | null; name: string | null }) {
  const linkedinUrl = normalizeLinkedinUrl(value.linkedin_url);
  if (linkedinUrl) return `${value.lead_id}|li:${linkedinUrl}`;
  const name = normalizeText(value.name);
  if (name) return `${value.lead_id}|name:${name}`;
  return null;
}

const pipelineInput = z.object({
  campaignId: z.string().uuid(),
  runId: z.string().uuid(),
  selectedStages: z.array(z.enum(EXECUTABLE_PIPELINE_STAGES)).optional(),
  runConfig: pipelineRunConfigSchema.optional(),
});

function shouldRunStage(
  selectedStages: ExecutablePipelineStage[] | undefined,
  stage: ExecutablePipelineStage,
) {
  if (!selectedStages?.length) return true;
  return selectedStages.includes(stage);
}

function takeWithLimit<T>(items: T[], limit?: number) {
  if (!limit || limit < 1) return items;
  return items.slice(0, limit);
}

function previewValue(value: unknown, maxLength = 1500) {
  if (value === null || value === undefined) return null;
  try {
    const asString = typeof value === "string" ? value : JSON.stringify(value);
    if (asString.length <= maxLength) return asString;
    return `${asString.slice(0, maxLength)}...<truncated>`;
  } catch {
    return String(value);
  }
}

async function consumeAgentStream(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  stream: any,
  runId: string,
  agentType: "lead_gen" | "people_gen" | "enrichment" | "scoring" | "cold_email",
) {
  let reasoningBuffer = "";
  let textBuffer = "";
  let toolCalls = 0;
  let toolResults = 0;

  for await (const chunk of stream.fullStream) {
    if (chunk.type === "tool-call") {
      toolCalls += 1;
      await logRunEvent(runId, agentType, "info", `Tool call: ${chunk.payload.toolName}`, {
        toolName: chunk.payload.toolName,
        toolCallId: chunk.payload.toolCallId,
        argsPreview: previewValue(chunk.payload.args),
      });
    }
    if (chunk.type === "tool-result") {
      toolResults += 1;
      await logRunEvent(runId, agentType, "info", `Tool result: ${chunk.payload.toolName}`, {
        toolName: chunk.payload.toolName,
        toolCallId: chunk.payload.toolCallId,
        isError: chunk.payload.isError ?? false,
        resultPreview: previewValue(chunk.payload.result),
      });
    }
    if (chunk.type === "reasoning-delta") {
      reasoningBuffer += String(chunk.payload.text ?? "");
    }
    if (chunk.type === "text-delta") {
      textBuffer += String(chunk.payload.text ?? "");
    }
    if (chunk.type === "step-finish") {
      await logRunEvent(runId, agentType, "info", "Agent step finished", {
        finishReason: chunk.payload.stepResult?.reason ?? null,
        usage: chunk.payload.output?.usage ?? null,
      });
    }
  }

  await logRunEvent(runId, agentType, "info", "Agent stream summary", {
    toolCalls,
    toolResults,
    reasoningPreview: previewValue(reasoningBuffer, 3000),
    responsePreview: previewValue(textBuffer, 3000),
  });
}

const personalizedEmailDraftSchema = z.object({
  subject: z.string().min(1).max(200),
  bodyText: z.string().min(1).max(6000),
});

function compactText(value: unknown, maxLength = 800) {
  if (value === null || value === undefined) return "";
  const raw = typeof value === "string" ? value : JSON.stringify(value);
  return raw.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

const leadGenStep = createStep({
  id: "lead-gen-step",
  inputSchema: pipelineInput,
  outputSchema: pipelineInput.extend({ leadsGenerated: z.number() }),
  execute: async ({ inputData }) => {
    const stage = "lead_generation";
    const startedAt = Date.now();
    if (!shouldRunStage(inputData.selectedStages, stage)) {
      await logRunEvent(inputData.runId, "lead_gen", "info", "Lead generation skipped", {
        campaignId: inputData.campaignId,
        selectedStages: inputData.selectedStages ?? [],
      });
      return { ...inputData, leadsGenerated: 0 };
    }
    await updateRunState(inputData.runId, { status: "running", current_stage: stage });
    await logRunEvent(inputData.runId, "lead_gen", "info", "Lead generation started", {
      campaignId: inputData.campaignId,
    });

    try {
      const { data: campaign } = await supabaseServer
        .from("campaigns")
        .select("icp_description,leads_per_run")
        .eq("id", inputData.campaignId)
        .single();

      const { data: existingLeads } = await supabaseServer
        .from("leads")
        .select("company_domain,company_name")
        .eq("campaign_id", inputData.campaignId);

      const leadTarget = inputData.runConfig?.leadGeneration?.maxLeads ?? (campaign?.leads_per_run ?? 20);
      const existingLeadCount = existingLeads?.length ?? 0;
      const remainingSlots = Math.max(leadTarget, 0);

      if (remainingSlots <= 0) {
        await updateRunState(inputData.runId, { leads_generated: 0 });
        await logRunEvent(inputData.runId, "lead_gen", "success", "Lead generation skipped due to zero per-run target", {
          campaignId: inputData.campaignId,
          perRunLeadTarget: leadTarget,
          existingLeadCount,
          durationMs: Date.now() - startedAt,
        });
        return { ...inputData, leadsGenerated: 0 };
      }

      const leadGenRuntime = await buildRuntimeAgent("lead_gen");
      await updateRunState(inputData.runId, { config_version_id: leadGenRuntime.config.configVersionId });
      const result = await withRetries(async () => {
        const stream = await leadGenRuntime.agent.stream(
          `Generate up to ${remainingSlots} leads for this campaign ICP: ${campaign?.icp_description ?? ""}`,
          { structuredOutput: { schema: leadsOutputSchema }, maxSteps: 8 },
        );
        await consumeAgentStream(stream, inputData.runId, "lead_gen");
        return { object: await stream.object };
      });

      const generatedLeads = result.object.leads.map((lead) => ({
        campaign_id: inputData.campaignId,
        pipeline_run_id: inputData.runId,
        source: lead.source,
        company_name: lead.company_name ?? null,
        company_domain: lead.company_domain ?? null,
        linkedin_url: lead.linkedin_url ?? null,
        exa_url: lead.exa_url ?? null,
        raw_data: safeParseJson(lead.raw_data),
      }));

      const existingKeys = new Set(
        (existingLeads ?? [])
          .map((lead) => leadKey(lead))
          .filter((key): key is string => Boolean(key)),
      );
      const seenBatchKeys = new Set<string>();
      const dedupedLeads = generatedLeads.filter((lead) => {
          const key = leadKey(lead);
          if (!key) return true;
          if (existingKeys.has(key) || seenBatchKeys.has(key)) return false;
          seenBatchKeys.add(key);
          return true;
        });
      const leadsToInsert = dedupedLeads.slice(0, remainingSlots);

      if (leadsToInsert.length) {
        await supabaseServer.from("leads").insert(leadsToInsert);
      }
      await updateRunState(inputData.runId, { leads_generated: leadsToInsert.length });
      await logRunEvent(inputData.runId, "lead_gen", "success", "Lead generation completed", {
        campaignId: inputData.campaignId,
        perRunLeadTarget: leadTarget,
        runConfiguredLeadTarget: inputData.runConfig?.leadGeneration?.maxLeads ?? null,
        existingLeadCount,
        remainingSlots,
        leadsGenerated: leadsToInsert.length,
        leadsDiscardedAsDuplicates: generatedLeads.length - dedupedLeads.length,
        leadsDiscardedForCap: Math.max(0, dedupedLeads.length - leadsToInsert.length),
        configVersionId: leadGenRuntime.config.configVersionId,
        toolsEnabled: leadGenRuntime.toolKeys,
        toolsRejected: leadGenRuntime.rejectedToolKeys,
        durationMs: Date.now() - startedAt,
      });

      return { ...inputData, leadsGenerated: leadsToInsert.length };
    } catch (error) {
      await logRunEvent(inputData.runId, "lead_gen", "error", "Lead generation failed", {
        campaignId: inputData.campaignId,
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startedAt,
      });
      throw error;
    }
  },
});

const peopleGenStep = createStep({
  id: "people-gen-step",
  inputSchema: pipelineInput.extend({ leadsGenerated: z.number() }),
  outputSchema: pipelineInput.extend({ leadsGenerated: z.number(), peopleDiscovered: z.number() }),
  execute: async ({ inputData }) => {
    const stage = "people_discovery";
    const startedAt = Date.now();
    if (!shouldRunStage(inputData.selectedStages, stage)) {
      await logRunEvent(inputData.runId, "people_gen", "info", "People discovery skipped", {
        campaignId: inputData.campaignId,
        selectedStages: inputData.selectedStages ?? [],
      });
      return { ...inputData, peopleDiscovered: 0 };
    }
    await updateRunState(inputData.runId, { status: "running", current_stage: stage });
    await logRunEvent(inputData.runId, "people_gen", "info", "People discovery started", {
      campaignId: inputData.campaignId,
    });

    try {
      const { data: campaign } = await supabaseServer
        .from("campaigns")
        .select("icp_description,target_roles")
        .eq("id", inputData.campaignId)
        .single();

      const { data: leads } = await supabaseServer
        .from("leads")
        .select("id,company_name,company_domain,linkedin_url,exa_url,raw_data,status")
        .eq("campaign_id", inputData.campaignId)
        .in("status", ["new", "enriching"]);

      if (!leads?.length) {
        await logRunEvent(inputData.runId, "people_gen", "success", "No company leads available for people discovery", {
          campaignId: inputData.campaignId,
          durationMs: Date.now() - startedAt,
        });
        return { ...inputData, peopleDiscovered: 0 };
      }

      const leadIds = leads.map((lead) => lead.id);
      const { data: existingContacts } = await supabaseServer
        .from("contacts")
        .select("lead_id,linkedin_url,name")
        .in("lead_id", leadIds);

      const existingContactKeys = new Set(
        (existingContacts ?? [])
          .map((contact) => contactKey(contact))
          .filter((key): key is string => Boolean(key)),
      );
      const knownLeadIds = new Set(leadIds);

      const peopleGenRuntime = await buildRuntimeAgent("people_gen");
      await updateRunState(inputData.runId, { config_version_id: peopleGenRuntime.config.configVersionId });
      const result = await withRetries(async () => {
        const stream = await peopleGenRuntime.agent.stream(
          [
            `Campaign ICP: ${campaign?.icp_description ?? ""}`,
            `Target roles: ${(campaign?.target_roles ?? []).join(", ")}`,
            `Find contacts in these companies: ${JSON.stringify(leads)}`,
          ].join("\n"),
          { structuredOutput: { schema: peopleOutputSchema }, maxSteps: 10 },
        );
        await consumeAgentStream(stream, inputData.runId, "people_gen");
        return { object: await stream.object };
      });

      const seenBatchKeys = new Set<string>();
      const maxContacts = inputData.runConfig?.peopleDiscovery?.maxContacts;
      const contactsToInsert = takeWithLimit(
        result.object.people
        .filter((person) => knownLeadIds.has(person.lead_id))
        .filter((person) => {
          const key = contactKey(person);
          if (!key) return true;
          if (existingContactKeys.has(key) || seenBatchKeys.has(key)) return false;
          seenBatchKeys.add(key);
          return true;
        })
        .map((person) => ({
          lead_id: person.lead_id,
          campaign_id: inputData.campaignId,
          name: person.name ?? null,
          first_name: person.first_name ?? null,
          email: null,
          email_verified: false,
          phone: null,
          linkedin_url: person.linkedin_url ?? null,
          headline: person.headline ?? null,
          company_name: person.company_name ?? null,
          clado_profile: safeParseJson(person.raw_data),
          exa_company_signals: {},
          contact_brief: null,
        })),
        maxContacts,
      );

      if (contactsToInsert.length) {
        await supabaseServer.from("contacts").insert(contactsToInsert);
      }

      const leadIdsWithContacts = new Set<string>([
        ...(existingContacts ?? []).map((contact) => contact.lead_id),
        ...contactsToInsert.map((contact) => contact.lead_id),
      ]);
      if (leadIdsWithContacts.size) {
        await supabaseServer
          .from("leads")
          .update({ status: "enriching" })
          .in("id", Array.from(leadIdsWithContacts));
      }

      await logRunEvent(inputData.runId, "people_gen", "success", "People discovery completed", {
        campaignId: inputData.campaignId,
        peopleDiscovered: contactsToInsert.length,
        runConfiguredContactCap: maxContacts ?? null,
        contactsDiscardedAsDuplicates: result.object.people.length - contactsToInsert.length,
        configVersionId: peopleGenRuntime.config.configVersionId,
        toolsEnabled: peopleGenRuntime.toolKeys,
        toolsRejected: peopleGenRuntime.rejectedToolKeys,
        durationMs: Date.now() - startedAt,
      });

      return { ...inputData, peopleDiscovered: contactsToInsert.length };
    } catch (error) {
      await logRunEvent(inputData.runId, "people_gen", "error", "People discovery failed", {
        campaignId: inputData.campaignId,
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startedAt,
      });
      throw error;
    }
  },
});

const enrichmentStep = createStep({
  id: "enrichment-step",
  inputSchema: pipelineInput.extend({ leadsGenerated: z.number(), peopleDiscovered: z.number() }),
  outputSchema: pipelineInput.extend({ leadsGenerated: z.number(), peopleDiscovered: z.number(), leadsEnriched: z.number() }),
  execute: async ({ inputData }) => {
    const stage = "enrichment";
    const startedAt = Date.now();
    if (!shouldRunStage(inputData.selectedStages, stage)) {
      await logRunEvent(inputData.runId, "enrichment", "info", "Enrichment skipped", {
        campaignId: inputData.campaignId,
        selectedStages: inputData.selectedStages ?? [],
      });
      return { ...inputData, leadsEnriched: 0 };
    }
    await updateRunState(inputData.runId, { status: "running", current_stage: stage });
    await logRunEvent(inputData.runId, "enrichment", "info", "Enrichment started", {
      campaignId: inputData.campaignId,
    });

    try {
      const { data: contactsToEnrich } = await supabaseServer
        .from("contacts")
        .select("id,lead_id,name,first_name,linkedin_url,headline,company_name")
        .eq("campaign_id", inputData.campaignId)
        .is("enriched_at", null);
      const maxContacts = inputData.runConfig?.enrichment?.maxContacts;
      const limitedContactsToEnrich = takeWithLimit(contactsToEnrich ?? [], maxContacts);

      if (!limitedContactsToEnrich.length) {
        const { data: leadsWithUnenrichedContacts } = await supabaseServer
          .from("contacts")
          .select("lead_id")
          .eq("campaign_id", inputData.campaignId)
          .is("enriched_at", null);
        const blockedLeadIds = new Set((leadsWithUnenrichedContacts ?? []).map((contact) => contact.lead_id));

        const { data: candidateLeads } = await supabaseServer
          .from("leads")
          .select("id")
          .eq("campaign_id", inputData.campaignId)
          .eq("status", "enriching");
        const leadsReadyForEnriched = (candidateLeads ?? [])
          .map((lead) => lead.id)
          .filter((leadId) => !blockedLeadIds.has(leadId));

        if (leadsReadyForEnriched.length) {
          await supabaseServer
            .from("leads")
            .update({ status: "enriched" })
            .in("id", leadsReadyForEnriched);
        }

        await updateRunState(inputData.runId, { leads_enriched: 0 });
        await logRunEvent(inputData.runId, "enrichment", "success", "No contacts pending enrichment", {
          campaignId: inputData.campaignId,
          leadsMarkedEnriched: leadsReadyForEnriched.length,
          durationMs: Date.now() - startedAt,
        });
        return { ...inputData, leadsEnriched: 0 };
      }

      const enrichmentRuntime = await buildRuntimeAgent("enrichment");
      await updateRunState(inputData.runId, { config_version_id: enrichmentRuntime.config.configVersionId });
      const result = await withRetries(async () => {
        const stream = await enrichmentRuntime.agent.stream(
          `Enrich these people candidates: ${JSON.stringify(limitedContactsToEnrich)}`,
          {
            structuredOutput: { schema: contactsOutputSchema },
            maxSteps: 8,
          },
        );
        await consumeAgentStream(stream, inputData.runId, "enrichment");
        return { object: await stream.object };
      });

      const contactsByLead = new Map<string, typeof limitedContactsToEnrich>();
      for (const contact of limitedContactsToEnrich) {
        const group = contactsByLead.get(contact.lead_id) ?? [];
        group.push(contact);
        contactsByLead.set(contact.lead_id, group);
      }

      const usedContactIds = new Set<string>();
      const nowIso = new Date().toISOString();
      const matchedUpdates: Array<{
        id: string;
        leadId: string;
        patch: Record<string, unknown>;
      }> = [];

      for (const enriched of result.object.contacts) {
        const candidates = contactsByLead.get(enriched.lead_id) ?? [];
        if (!candidates.length) continue;

        const linkedinUrl = normalizeLinkedinUrl(enriched.linkedin_url);
        const normalizedName = normalizeText(enriched.name);
        const matchingCandidate =
          candidates.find(
            (candidate) =>
              !usedContactIds.has(candidate.id) &&
              linkedinUrl &&
              normalizeLinkedinUrl(candidate.linkedin_url) === linkedinUrl,
          ) ??
          candidates.find(
            (candidate) =>
              !usedContactIds.has(candidate.id) &&
              normalizedName &&
              normalizeText(candidate.name) === normalizedName,
          ) ??
          candidates.find((candidate) => !usedContactIds.has(candidate.id));

        if (!matchingCandidate) continue;
        usedContactIds.add(matchingCandidate.id);

        matchedUpdates.push({
          id: matchingCandidate.id,
          leadId: matchingCandidate.lead_id,
          patch: {
            name: enriched.name ?? matchingCandidate.name ?? null,
            first_name: enriched.first_name ?? matchingCandidate.first_name ?? null,
            email: enriched.email ?? null,
            email_verified: enriched.email_verified,
            phone: enriched.phone ?? null,
            linkedin_url: enriched.linkedin_url ?? matchingCandidate.linkedin_url ?? null,
            headline: enriched.headline ?? matchingCandidate.headline ?? null,
            company_name: enriched.company_name ?? matchingCandidate.company_name ?? null,
            clado_profile: safeParseJson(enriched.clado_profile),
            exa_company_signals: safeParseJson(enriched.exa_company_signals),
            contact_brief: enriched.contact_brief ?? null,
            enriched_at: nowIso,
          },
        });
      }

      await Promise.all(
        matchedUpdates.map((item) =>
          supabaseServer.from("contacts").update(item.patch).eq("id", item.id),
        ),
      );

      const enrichedLeadIds = Array.from(new Set(matchedUpdates.map((item) => item.leadId)));
      if (enrichedLeadIds.length) {
        await supabaseServer
          .from("leads")
          .update({ status: "enriched" })
          .in("id", enrichedLeadIds);
      }

      await updateRunState(inputData.runId, { leads_enriched: matchedUpdates.length });
      await logRunEvent(inputData.runId, "enrichment", "success", "Enrichment completed", {
        campaignId: inputData.campaignId,
        leadsEnriched: matchedUpdates.length,
        runConfiguredContactCap: maxContacts ?? null,
        configVersionId: enrichmentRuntime.config.configVersionId,
        toolsEnabled: enrichmentRuntime.toolKeys,
        toolsRejected: enrichmentRuntime.rejectedToolKeys,
        durationMs: Date.now() - startedAt,
      });

      return { ...inputData, leadsEnriched: matchedUpdates.length };
    } catch (error) {
      await logRunEvent(inputData.runId, "enrichment", "error", "Enrichment failed", {
        campaignId: inputData.campaignId,
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startedAt,
      });
      throw error;
    }
  },
});

const scoringStep = createStep({
  id: "scoring-step",
  inputSchema: pipelineInput.extend({ leadsGenerated: z.number(), peopleDiscovered: z.number(), leadsEnriched: z.number() }),
  outputSchema: pipelineInput.extend({
    leadsGenerated: z.number(),
    peopleDiscovered: z.number(),
    leadsEnriched: z.number(),
    leadsScored: z.number(),
  }),
  execute: async ({ inputData }) => {
    const stage = "scoring";
    const startedAt = Date.now();
    if (!shouldRunStage(inputData.selectedStages, stage)) {
      await logRunEvent(inputData.runId, "scoring", "info", "Scoring skipped", {
        campaignId: inputData.campaignId,
        selectedStages: inputData.selectedStages ?? [],
      });
      return { ...inputData, leadsScored: 0 };
    }
    await updateRunState(inputData.runId, { status: "running", current_stage: stage });
    await logRunEvent(inputData.runId, "scoring", "info", "Scoring started", {
      campaignId: inputData.campaignId,
    });

    try {
      const { data: contacts } = await supabaseServer
        .from("contacts")
        .select("id,lead_id,name,email,email_verified,headline,company_name,contact_brief,exa_company_signals")
        .eq("campaign_id", inputData.campaignId)
        .not("enriched_at", "is", null);

      if (!contacts?.length) {
        await updateRunState(inputData.runId, { leads_scored: 0 });
        await logRunEvent(inputData.runId, "scoring", "success", "No enriched contacts available for scoring", {
          campaignId: inputData.campaignId,
          durationMs: Date.now() - startedAt,
        });
        return { ...inputData, leadsScored: 0 };
      }

      const contactIds = contacts.map((contact) => contact.id);
      const { data: existingScores } = await supabaseServer
        .from("icp_scores")
        .select("contact_id")
        .eq("campaign_id", inputData.campaignId)
        .in("contact_id", contactIds);

      const alreadyScoredIds = new Set((existingScores ?? []).map((score) => score.contact_id));
      const contactsToScore = contacts.filter((contact) => !alreadyScoredIds.has(contact.id));
      const maxContacts = inputData.runConfig?.scoring?.maxContacts;
      const limitedContactsToScore = takeWithLimit(contactsToScore, maxContacts);

      if (!limitedContactsToScore.length) {
        await updateRunState(inputData.runId, { leads_scored: 0 });
        await logRunEvent(inputData.runId, "scoring", "success", "All enriched contacts already scored", {
          campaignId: inputData.campaignId,
          runConfiguredContactCap: maxContacts ?? null,
          durationMs: Date.now() - startedAt,
        });
        return { ...inputData, leadsScored: 0 };
      }

      const { data: campaign } = await supabaseServer
        .from("campaigns")
        .select("*")
        .eq("id", inputData.campaignId)
        .single();

      const scoringRuntime = await buildRuntimeAgent("scoring");
      await updateRunState(inputData.runId, { config_version_id: scoringRuntime.config.configVersionId });
      const result = await withRetries(async () => {
        const stream = await scoringRuntime.agent.stream(
          `Score contacts with this rubric:\n${campaign?.scoring_rubric ?? ""}\nData:${JSON.stringify(limitedContactsToScore)}`,
          { structuredOutput: { schema: scoresOutputSchema }, maxSteps: 8 },
        );
        await consumeAgentStream(stream, inputData.runId, "scoring");
        return { object: await stream.object };
      });

      const allowedContactIds = new Set(limitedContactsToScore.map((contact) => contact.id));
      const seenContactIds = new Set<string>();
      const scores = result.object.scores
        .filter((score) => {
          if (!allowedContactIds.has(score.contact_id)) return false;
          if (seenContactIds.has(score.contact_id)) return false;
          seenContactIds.add(score.contact_id);
          return true;
        })
        .map((score) => ({
          contact_id: score.contact_id,
          campaign_id: inputData.campaignId,
          score: score.score,
          tier: score.tier,
          reasoning: score.reasoning,
          positive_signals: score.positive_signals,
          negative_signals: score.negative_signals,
          recommended_angle: score.recommended_angle ?? null,
          next_action: score.next_action,
        }));

      if (scores.length) {
        await supabaseServer.from("icp_scores").insert(scores);
      }

      const leadByContact = new Map(limitedContactsToScore.map((contact) => [contact.id, contact.lead_id]));
      const scoredLeadIds = Array.from(
        new Set(
          scores
            .map((score) => leadByContact.get(score.contact_id))
            .filter((leadId): leadId is string => Boolean(leadId)),
        ),
      );
      if (scoredLeadIds.length) {
        await supabaseServer
          .from("leads")
          .update({ status: "scored" })
          .in("id", scoredLeadIds);
      }

      await updateRunState(inputData.runId, { leads_scored: scores.length });
      await logRunEvent(inputData.runId, "scoring", "success", "Scoring completed", {
        campaignId: inputData.campaignId,
        leadsScored: scores.length,
        runConfiguredContactCap: maxContacts ?? null,
        configVersionId: scoringRuntime.config.configVersionId,
        toolsEnabled: scoringRuntime.toolKeys,
        toolsRejected: scoringRuntime.rejectedToolKeys,
        durationMs: Date.now() - startedAt,
      });

      return { ...inputData, leadsScored: scores.length };
    } catch (error) {
      await logRunEvent(inputData.runId, "scoring", "error", "Scoring failed", {
        campaignId: inputData.campaignId,
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startedAt,
      });
      throw error;
    }
  },
});

const emailStep = createStep({
  id: "email-step",
  inputSchema: pipelineInput.extend({
    leadsGenerated: z.number(),
    peopleDiscovered: z.number(),
    leadsEnriched: z.number(),
    leadsScored: z.number(),
  }),
  outputSchema: z.object({
    leadsGenerated: z.number(),
    leadsEnriched: z.number(),
    leadsScored: z.number(),
    emailsSent: z.number(),
  }),
  execute: async ({ inputData }) => {
    const stage = "email";
    const startedAt = Date.now();
    if (!shouldRunStage(inputData.selectedStages, stage)) {
      await logRunEvent(inputData.runId, "cold_email", "info", "Email stage skipped", {
        campaignId: inputData.campaignId,
        selectedStages: inputData.selectedStages ?? [],
      });
      return {
        leadsGenerated: inputData.leadsGenerated,
        leadsEnriched: inputData.leadsEnriched,
        leadsScored: inputData.leadsScored,
        emailsSent: 0,
      };
    }
    await updateRunState(inputData.runId, { status: "running", current_stage: stage });
    await logRunEvent(inputData.runId, "cold_email", "info", "Email stage started", {
      campaignId: inputData.campaignId,
    });

    try {
      const { data: campaign } = await supabaseServer
        .from("campaigns")
        .select(
          "account_ids,daily_send_limit,value_prop,icp_description,mailbox_selection_mode,primary_account_id,template_experiment_id,test_mode_enabled,test_recipient_emails",
        )
        .eq("id", inputData.campaignId)
        .single();

      const allowedAccountIds = (campaign?.account_ids ?? []) as string[];
      if (!allowedAccountIds.length) {
        throw new Error("No mailbox configured on campaign");
      }
      const campaignTestModeEnabled = Boolean(campaign?.test_mode_enabled);
      const campaignTestRecipients = Array.from(
        new Set(
          ((campaign?.test_recipient_emails ?? []) as string[])
            .map((email) => email.trim().toLowerCase())
            .filter((email) => Boolean(email)),
        ),
      );
      const runEmailConfig = inputData.runConfig?.email;
      const runTestRecipients = Array.from(
        new Set(
          (runEmailConfig?.testRecipientEmails ?? [])
            .map((email) => email.trim().toLowerCase())
            .filter((email) => Boolean(email)),
        ),
      );
      const testModeEnabled = runEmailConfig?.useTestMode ?? campaignTestModeEnabled;
      const testRecipientEmails = runTestRecipients.length
        ? runTestRecipients
        : campaignTestRecipients;
      if (testModeEnabled && !testRecipientEmails.length) {
        throw new Error("Test mode is enabled but no test recipient emails are configured");
      }
      if (testModeEnabled) {
        await logRunEvent(inputData.runId, "cold_email", "warn", "Test mode active: diverting outbound emails", {
          testRecipientEmails,
          testRecipientCount: testRecipientEmails.length,
          source: runTestRecipients.length ? "run_config" : "campaign",
        });
      }

      const { data: hotOrWarmScores } = await supabaseServer
        .from("icp_scores")
        .select("contact_id,tier,recommended_angle")
        .eq("campaign_id", inputData.campaignId)
        .eq("next_action", "email")
        .in("tier", ["hot", "warm"]);

      if (!hotOrWarmScores?.length) {
        await updateRunState(inputData.runId, { emails_sent: 0 });
        await logRunEvent(inputData.runId, "cold_email", "success", "No contacts ready for email", {
          campaignId: inputData.campaignId,
          durationMs: Date.now() - startedAt,
        });
        return {
          leadsGenerated: inputData.leadsGenerated,
          leadsEnriched: inputData.leadsEnriched,
          leadsScored: inputData.leadsScored,
          emailsSent: 0,
        };
      }

      const scoreByContact = new Map(hotOrWarmScores.map((item) => [item.contact_id, item]));
      const contactIds = hotOrWarmScores.map((item) => item.contact_id);
      const { data: contacts } = await supabaseServer
        .from("contacts")
        .select(
          "id,lead_id,name,first_name,email,email_verified,company_name,headline,contact_brief,exa_company_signals,enriched_at",
        )
        .in("id", contactIds);

      const allCandidateContacts = contacts ?? [];
      const sendableContacts = allCandidateContacts.filter(
        (contact) => Boolean(contact.enriched_at) && Boolean(contact.email) && Boolean(contact.email_verified),
      );
      const skippedForEligibility = allCandidateContacts.length - sendableContacts.length;
      if (skippedForEligibility > 0) {
        await logRunEvent(inputData.runId, "cold_email", "info", "Skipped contacts failing email eligibility", {
          skippedForEligibility,
          required: ["enriched_at", "email", "email_verified"],
        });
      }
      const sendCap = inputData.runConfig?.email?.maxSends ?? (campaign?.daily_send_limit ?? 50);
      const limitedContacts = sendableContacts.slice(0, sendCap);
      const leadIds = Array.from(new Set(limitedContacts.map((contact) => contact.lead_id).filter(Boolean)));
      const { data: leadRows } = leadIds.length
        ? await supabaseServer
            .from("leads")
            .select("id,company_name,company_domain,linkedin_url,exa_url,raw_data")
            .in("id", leadIds)
        : { data: [] as Array<Record<string, unknown>> };
      const leadById = new Map((leadRows ?? []).map((lead) => [String(lead.id), lead]));
      const useTemplateExperiments = env.ENABLE_TEMPLATE_EXPERIMENTS !== "false";
      const activeExperiment = useTemplateExperiments
        ? await getActiveExperimentForCampaign(inputData.campaignId)
        : null;

      let coldEmailRuntime: Awaited<ReturnType<typeof buildRuntimeAgent>> | null = null;
      try {
        coldEmailRuntime = await buildRuntimeAgent("cold_email");
        await updateRunState(inputData.runId, { config_version_id: coldEmailRuntime.config.configVersionId });
        await logRunEvent(inputData.runId, "cold_email", "info", "Email personalization runtime loaded", {
          configVersionId: coldEmailRuntime.config.configVersionId,
          toolsEnabled: coldEmailRuntime.toolKeys,
          toolsRejected: coldEmailRuntime.rejectedToolKeys,
        });
      } catch (runtimeError) {
        await logRunEvent(inputData.runId, "cold_email", "warn", "Email personalization runtime unavailable; using template fallback", {
          error: runtimeError instanceof Error ? runtimeError.message : String(runtimeError),
        });
      }

      const templateVersionCache = new Map<
        string,
        { id: string; subject_template: string; body_template: string; prompt_context: string | null }
      >();
      const sent: Array<{
        contactId: string;
        leadId: string;
        accountId: string;
        threadId: string | null;
        isTestSend: boolean;
      }> = [];
      const selectedVariantIds: string[] = [];
      const selectedTemplateVersionIds: string[] = [];

      for (const contact of limitedContacts) {
        const account = await selectSendingAccount(inputData.campaignId, {
          contactId: contact.id,
          preferredAccountId: campaign?.primary_account_id as string | null,
        });

        let variantId: string | null = null;
        let templateVersionId: string | null = null;
        let subjectTemplate = "Quick idea for {{company_name}}";
        let bodyTemplate =
          "<p>Hi {{first_name}},</p><p>I had one idea for {{company_name}} that could help with your current priorities.</p><p>Worth a quick chat this week?</p>";

        if (activeExperiment) {
          const variant = await chooseVariant({
            campaignId: inputData.campaignId,
            experimentId: activeExperiment.id,
            contactId: contact.id,
            explorationRate: Number(activeExperiment.exploration_rate ?? 0.2),
            minSampleSize: Number(activeExperiment.min_sample_size ?? 20),
          });
          variantId = variant.id;
          templateVersionId = variant.template_version_id as string;
          if (!templateVersionCache.has(templateVersionId)) {
            const { data: templateVersion } = await supabaseServer
              .from("email_template_versions")
              .select("id,subject_template,body_template,prompt_context")
              .eq("id", templateVersionId)
              .single();
            if (templateVersion) {
              templateVersionCache.set(templateVersionId, templateVersion);
            }
          }
          const cached = templateVersionCache.get(templateVersionId);
          if (cached) {
            subjectTemplate = cached.subject_template;
            bodyTemplate = cached.body_template;
          }
        }

        const variables = {
          name: contact.name ?? "",
          first_name: contact.first_name ?? contact.name ?? "",
          company_name: contact.company_name ?? "",
          headline: contact.headline ?? "",
          recommended_angle: String(scoreByContact.get(contact.id)?.recommended_angle ?? ""),
          value_prop: String(campaign?.value_prop ?? ""),
        };
        const fallbackSubject = renderTemplate(subjectTemplate, variables).trim() || "Quick idea";
        const { bodyText: fallbackBodyText } = renderTemplateBodies(bodyTemplate, variables);
        if (!fallbackBodyText) continue;

        let subject = fallbackSubject;
        let finalBodyText = fallbackBodyText;
        let personalizationSource: "agent_prompt" | "template_fallback" = "template_fallback";

        if (coldEmailRuntime) {
          try {
            const leadContext = leadById.get(String(contact.lead_id));
            const score = scoreByContact.get(contact.id);
            const templateContext = templateVersionId ? templateVersionCache.get(templateVersionId) : null;
            const personalizationPrompt = [
              "Write a highly personalized outbound email in plain text.",
              "Return JSON that strictly matches schema: { subject, bodyText }.",
              "Constraints:",
              "- No HTML tags, markdown, or placeholders like {{first_name}}.",
              "- Keep body under 120 words.",
              "- Use specific context from person + company below.",
              "- Include one clear CTA for a short call.",
              "",
              "Contact context:",
              `first_name: ${compactText(contact.first_name ?? contact.name)}`,
              `full_name: ${compactText(contact.name)}`,
              `headline: ${compactText(contact.headline)}`,
              `contact_brief: ${compactText(contact.contact_brief)}`,
              `contact_email: ${compactText(contact.email)}`,
              "",
              "Company context:",
              `company_name: ${compactText(contact.company_name ?? leadContext?.company_name)}`,
              `company_domain: ${compactText(leadContext?.company_domain)}`,
              `company_signals: ${compactText(contact.exa_company_signals)}`,
              `lead_raw_data: ${compactText(leadContext?.raw_data, 1200)}`,
              "",
              "Campaign context:",
              `value_prop: ${compactText(campaign?.value_prop)}`,
              `icp_description: ${compactText(campaign?.icp_description, 1200)}`,
              `recommended_angle: ${compactText(score?.recommended_angle)}`,
              `score_tier: ${compactText(score?.tier)}`,
              "",
              "Template context:",
              `template_subject_hint: ${compactText(fallbackSubject)}`,
              `template_body_hint: ${compactText(fallbackBodyText, 1200)}`,
              `template_prompt_context: ${compactText(templateContext?.prompt_context, 1200)}`,
            ].join("\n");

            const draftStream = await coldEmailRuntime.agent.stream(personalizationPrompt, {
              structuredOutput: { schema: personalizedEmailDraftSchema },
              maxSteps: 6,
            });
            await consumeAgentStream(draftStream, inputData.runId, "cold_email");
            const draft = await draftStream.object;
            const draftedSubject = draft.subject.trim();
            const draftedBody = draft.bodyText.trim();
            if (draftedSubject && draftedBody) {
              subject = draftedSubject;
              finalBodyText = draftedBody;
              personalizationSource = "agent_prompt";
            }
          } catch (personalizationError) {
            await logRunEvent(inputData.runId, "cold_email", "warn", "Prompt personalization failed; using template fallback", {
              contactId: contact.id,
              error: personalizationError instanceof Error ? personalizationError.message : String(personalizationError),
            });
          }
        }

        const deliveryTargets = testModeEnabled
          ? testRecipientEmails
          : [contact.email as string];
        const originalRecipient = contact.email ?? "(no-contact-email)";
        const nowIso = new Date().toISOString();

        for (const targetEmail of deliveryTargets) {
          await logRunEvent(inputData.runId, "cold_email", "info", "Email delivery prepared", {
            contactId: contact.id,
            originalRecipient,
            effectiveRecipient: targetEmail,
            effectiveRecipients: deliveryTargets,
            testModeEnabled,
            renderMode: "text/plain",
            personalizationSource,
          });
          const sendResult = await sendEmailWithComposio(
            account.id,
            targetEmail,
            subject,
            finalBodyText,
            finalBodyText,
            { forceTextMode: true },
          );
          await logRunEvent(inputData.runId, "cold_email", "info", "Email delivery provider accepted request", {
            contactId: contact.id,
            effectiveRecipient: targetEmail,
            deliveryMode: sendResult.mode,
            testModeEnabled,
          });

          const { data: enrollment } = !testModeEnabled
            ? await supabaseServer
                .from("enrollments")
                .upsert(
                  {
                    campaign_id: inputData.campaignId,
                    contact_id: contact.id,
                    account_id: account.id,
                    current_step: 1,
                    status: "active",
                    gmail_thread_id: sendResult.threadId ?? null,
                    enrolled_at: nowIso,
                  },
                  { onConflict: "campaign_id,contact_id" },
                )
                .select("id")
                .single()
            : { data: null as { id: string } | null };

          await supabaseServer.from("emails_sent").insert({
            enrollment_id: enrollment?.id ?? null,
            campaign_id: inputData.campaignId,
            contact_id: contact.id,
            account_id: account.id,
            step_number: 1,
            to_email: targetEmail,
            original_to_email: originalRecipient,
            effective_to_emails: deliveryTargets,
            is_test_send: testModeEnabled,
            render_mode: "text/plain",
            subject,
            body_html: finalBodyText,
            sent_at: nowIso,
            template_version_id: templateVersionId,
            variant_id: variantId,
            gmail_thread_id: sendResult.threadId ?? null,
          });
          await supabaseServer
            .from("email_accounts")
            .update({ sends_today: (account.sends_today ?? 0) + 1 })
            .eq("id", account.id);

          if (variantId && !testModeEnabled) {
            await recordVariantSend({
              campaignId: inputData.campaignId,
              contactId: contact.id,
              enrollmentId: enrollment?.id ?? null,
              variantId,
              templateVersionId,
              sentAt: nowIso,
            });
            selectedVariantIds.push(variantId);
          }
          if (templateVersionId) {
            selectedTemplateVersionIds.push(templateVersionId);
          }

          sent.push({
            contactId: contact.id,
            leadId: contact.lead_id,
            accountId: account.id,
            threadId: sendResult.threadId ?? null,
            isTestSend: testModeEnabled,
          });
        }
      }

      await updateRunState(inputData.runId, { emails_sent: sent.length });

      if (sent.length && !testModeEnabled) {
        const emailedLeadIds = Array.from(new Set(sent.map((item) => item.leadId)));
        if (emailedLeadIds.length) {
          await supabaseServer.from("leads").update({ status: "emailed" }).in("id", emailedLeadIds);
        }
      }

      await logRunEvent(inputData.runId, "cold_email", "success", "Email stage completed", {
        campaignId: inputData.campaignId,
        emailsSent: sent.length,
        runConfiguredSendCap: inputData.runConfig?.email?.maxSends ?? null,
        mailboxMode: campaign?.mailbox_selection_mode ?? "least_loaded",
        selectedAccountIds: Array.from(new Set(sent.map((item) => item.accountId))),
        selectedVariantIds: Array.from(new Set(selectedVariantIds)),
        selectedTemplateVersionIds: Array.from(new Set(selectedTemplateVersionIds)),
        experimentId: activeExperiment?.id ?? null,
        renderMode: "text/plain",
        testModeEnabled,
        testRecipientEmails,
        durationMs: Date.now() - startedAt,
      });

      return {
        leadsGenerated: inputData.leadsGenerated,
        leadsEnriched: inputData.leadsEnriched,
        leadsScored: inputData.leadsScored,
        emailsSent: sent.length,
      };
    } catch (error) {
      await logRunEvent(inputData.runId, "cold_email", "error", "Email stage failed", {
        campaignId: inputData.campaignId,
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startedAt,
      });
      throw error;
    }
  },
});

export const salesPipelineWorkflow = createWorkflow({
  id: "sales-pipeline-workflow",
  inputSchema: pipelineInput,
  outputSchema: z.object({
    leadsGenerated: z.number(),
    leadsEnriched: z.number(),
    leadsScored: z.number(),
    emailsSent: z.number(),
  }),
})
  .then(leadGenStep)
  .then(peopleGenStep)
  .then(enrichmentStep)
  .then(scoringStep)
  .then(emailStep)
  .commit();
