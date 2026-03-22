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
import { buildRuntimeAgent, type RuntimeAgentResolution } from "@/lib/agents/build-runtime-agent";
import { env } from "@/lib/config/env";
import { selectSendingAccount } from "@/lib/email/router";
import { sendEmailWithComposio } from "@/lib/composio/gmail";
import { sendEmailWithAgentMail } from "@/lib/agentmail/send";
import { getActiveExperimentForCampaign, chooseVariant, recordVariantSend } from "@/lib/email/experiments";
import { renderTemplate, renderTemplateBodies, validateTemplateVariables } from "@/lib/email/templates";
import { appendSignatureText } from "@/lib/email/signature";
import { pipelineRunConfigSchema } from "@/lib/pipeline/run-config";
import { exaWebsetSearchPeopleTool, parseWebsetPeopleItems } from "@/mastra/tools/exa-websets";

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

export const pipelineInput = z.object({
  campaignId: z.string().uuid(),
  runId: z.string().uuid(),
  selectedStages: z.array(z.enum(EXECUTABLE_PIPELINE_STAGES)).optional(),
  runConfig: pipelineRunConfigSchema.optional(),
});

export const leadGenerationOutputSchema = pipelineInput.extend({
  leadsGenerated: z.number(),
});
export const peopleDiscoveryInputSchema = leadGenerationOutputSchema;
export const peopleDiscoveryOutputSchema = peopleDiscoveryInputSchema.extend({
  peopleDiscovered: z.number(),
});
export const enrichmentInputSchema = peopleDiscoveryOutputSchema;
export const enrichmentOutputSchema = enrichmentInputSchema.extend({
  leadsEnriched: z.number(),
});
export const companyResearchInputSchema = enrichmentOutputSchema;
export const companyResearchOutputSchema = companyResearchInputSchema.extend({
  leadsResearched: z.number(),
});
export const scoringInputSchema = companyResearchOutputSchema;
export const scoringOutputSchema = scoringInputSchema.extend({
  leadsScored: z.number(),
});
export const emailInputSchema = scoringOutputSchema;
export const fullPipelineOutputSchema = z.object({
  leadsGenerated: z.number(),
  leadsEnriched: z.number(),
  leadsScored: z.number(),
  emailsSent: z.number(),
});

function shouldRunStage(
  selectedStages: ExecutablePipelineStage[] | undefined,
  stage: ExecutablePipelineStage,
) {
  if (!selectedStages?.length) return true;
  return selectedStages.includes(stage);
}

/** Lead IDs when running pipeline on selected leads only (Clay-style). */
function getLeadIdsFilter(runConfig: { leadIds?: string[] } | undefined): string[] | undefined {
  const ids = runConfig?.leadIds;
  if (!ids?.length) return undefined;
  return ids;
}

/** Contact IDs when running pipeline on selected contacts only. */
function getContactIdsFilter(runConfig: { contactIds?: string[] } | undefined): string[] | undefined {
  const ids = runConfig?.contactIds;
  if (!ids?.length) return undefined;
  return ids;
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
  agentType: "lead_gen" | "people_gen" | "enrichment" | "company_research" | "scoring" | "cold_email",
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

type DiscoverySource = "clado" | "exa" | "exa-websets";

type SourceFallbackAttempt = {
  source: DiscoverySource;
  requestedToolKeys: string[];
  status: "success" | "empty" | "error";
  itemCount: number;
  configVersionId?: string | null;
  toolsEnabled?: string[];
  toolsRejected?: string[];
  error?: string;
};

type SourceFallbackBranch<T> = {
  source: DiscoverySource;
  requestedToolKeys: string[];
  execute: (runtime: RuntimeAgentResolution) => Promise<T[]>;
  hasData?: (items: T[]) => boolean;
};

async function runSourceFallback<T>(input: {
  runId: string;
  agentType: "people_gen" | "enrichment";
  stage: "people_discovery" | "enrichment";
  branches: SourceFallbackBranch<T>[];
}) {
  const attempts: SourceFallbackAttempt[] = [];

  for (const branch of input.branches) {
    await logRunEvent(
      input.runId,
      input.agentType,
      "info",
      `${branch.source.toUpperCase()} branch started`,
      {
        stage: input.stage,
        source: branch.source,
        requestedToolKeys: branch.requestedToolKeys,
      },
    );

    try {
      const runtime = await buildRuntimeAgent(input.agentType, {
        requestedToolKeys: branch.requestedToolKeys,
      });
      const items = await branch.execute(runtime);
      const hasData = branch.hasData ? branch.hasData(items) : items.length > 0;
      const attempt: SourceFallbackAttempt = {
        source: branch.source,
        requestedToolKeys: branch.requestedToolKeys,
        status: hasData ? "success" : "empty",
        itemCount: items.length,
        configVersionId: runtime.config.configVersionId,
        toolsEnabled: runtime.toolKeys,
        toolsRejected: runtime.rejectedToolKeys,
      };
      attempts.push(attempt);

      if (!hasData) {
        await logRunEvent(
          input.runId,
          input.agentType,
          "warn",
          `${branch.source.toUpperCase()} branch returned no usable data`,
          {
            stage: input.stage,
            source: branch.source,
            itemCount: items.length,
            requestedToolKeys: branch.requestedToolKeys,
            configVersionId: runtime.config.configVersionId,
            toolsEnabled: runtime.toolKeys,
            toolsRejected: runtime.rejectedToolKeys,
          },
        );
        continue;
      }

      await logRunEvent(
        input.runId,
        input.agentType,
        "success",
        `${branch.source.toUpperCase()} branch selected`,
        {
          stage: input.stage,
          source: branch.source,
          itemCount: items.length,
          requestedToolKeys: branch.requestedToolKeys,
          configVersionId: runtime.config.configVersionId,
          toolsEnabled: runtime.toolKeys,
          toolsRejected: runtime.rejectedToolKeys,
        },
      );
      return { items, sourceUsed: branch.source, attempts };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      attempts.push({
        source: branch.source,
        requestedToolKeys: branch.requestedToolKeys,
        status: "error",
        itemCount: 0,
        error: errorMessage,
      });
      await logRunEvent(
        input.runId,
        input.agentType,
        "warn",
        `${branch.source.toUpperCase()} branch failed; trying fallback`,
        {
          stage: input.stage,
          source: branch.source,
          requestedToolKeys: branch.requestedToolKeys,
          error: errorMessage,
        },
      );
    }
  }

  throw new Error(`All ${input.stage} source branches failed or returned no usable data`);
}

export function buildLeadGenStep() {
  return createStep({
  id: "lead-gen-step",
  inputSchema: pipelineInput,
  outputSchema: leadGenerationOutputSchema,
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

      const leadGenSource = inputData.runConfig?.source ?? "auto";

      // ── Exa Websets fast-path: single call produces leads + contacts + emails ──
      if (leadGenSource === "exa_websets") {
        await logRunEvent(inputData.runId, "lead_gen", "info", "Exa Websets fast-path: searching for people + companies", {
          campaignId: inputData.campaignId,
          icp: campaign?.icp_description ?? "",
          count: Math.min(remainingSlots, 100),
        });

        const websetRaw = await exaWebsetSearchPeopleTool.execute!(
          { query: campaign?.icp_description ?? "", count: Math.min(remainingSlots, 100) },
          {} as never,
        );
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const websetResult = websetRaw as { websetId: string; status: string; itemCount: number; items: any[] };

        if (!websetResult.items?.length) {
          await updateRunState(inputData.runId, { leads_generated: 0 });
          await logRunEvent(inputData.runId, "lead_gen", "success", "Exa Websets returned no results", {
            campaignId: inputData.campaignId,
            websetId: websetResult.websetId,
            websetStatus: websetResult.status,
            durationMs: Date.now() - startedAt,
          });
          return { ...inputData, leadsGenerated: 0 };
        }

        const { leads: parsedLeads, contactsByCompanyKey } = parseWebsetPeopleItems(
          websetResult.items,
          inputData.campaignId,
          inputData.runId,
        );

        // Dedup leads against existing ones
        const existingKeys = new Set(
          (existingLeads ?? [])
            .map((lead) => leadKey(lead))
            .filter((key): key is string => Boolean(key)),
        );
        const seenBatchKeys = new Set<string>();
        const companyKeys = Array.from(contactsByCompanyKey.keys());
        const dedupedLeads: typeof parsedLeads = [];
        const dedupedCompanyKeys: string[] = [];

        for (let i = 0; i < parsedLeads.length; i++) {
          const lead = parsedLeads[i];
          const key = leadKey(lead);
          if (key && (existingKeys.has(key) || seenBatchKeys.has(key))) continue;
          if (key) seenBatchKeys.add(key);
          dedupedLeads.push(lead);
          dedupedCompanyKeys.push(companyKeys[i]);
        }

        const leadsToInsert = dedupedLeads.slice(0, remainingSlots);
        const keysToInsert = dedupedCompanyKeys.slice(0, remainingSlots);

        if (!leadsToInsert.length) {
          await updateRunState(inputData.runId, { leads_generated: 0 });
          await logRunEvent(inputData.runId, "lead_gen", "success", "Exa Websets: all leads deduplicated", {
            campaignId: inputData.campaignId,
            websetId: websetResult.websetId,
            parsedLeads: parsedLeads.length,
            durationMs: Date.now() - startedAt,
          });
          return { ...inputData, leadsGenerated: 0 };
        }

        const { data: insertedLeads, error: leadsInsertError } = await supabaseServer
          .from("leads")
          .insert(leadsToInsert)
          .select("id,company_name,company_domain");

        if (leadsInsertError || !insertedLeads?.length) {
          throw new Error(`Failed to insert webset leads: ${leadsInsertError?.message ?? "no rows returned"}`);
        }

        // Insert contacts for each lead
        let contactsInserted = 0;
        for (let i = 0; i < insertedLeads.length; i++) {
          const leadId = insertedLeads[i].id;
          const contacts = contactsByCompanyKey.get(keysToInsert[i]) ?? [];
          if (!contacts.length) continue;
          const contactsWithLeadId = contacts.map((c) => ({ ...c, lead_id: leadId }));
          const { error: contactsErr } = await supabaseServer.from("contacts").insert(contactsWithLeadId);
          if (!contactsErr) contactsInserted += contactsWithLeadId.length;
        }

        await updateRunState(inputData.runId, { leads_generated: insertedLeads.length });
        await logRunEvent(inputData.runId, "lead_gen", "success", "Exa Websets fast-path completed", {
          campaignId: inputData.campaignId,
          websetId: websetResult.websetId,
          websetStatus: websetResult.status,
          websetItemCount: websetResult.items.length,
          leadsInserted: insertedLeads.length,
          contactsInserted,
          leadsDeduped: parsedLeads.length - dedupedLeads.length,
          durationMs: Date.now() - startedAt,
        });

        return { ...inputData, leadsGenerated: insertedLeads.length };
      }
      // ── End Exa Websets fast-path ──

      const leadGenSourceHint =
        leadGenSource === "clado"
          ? "\nUse Clado and Exa search tools for discovery. Do not use Webset tools."
          : "";
      const leadGenRuntime = await buildRuntimeAgent("lead_gen");
      await updateRunState(inputData.runId, { config_version_id: leadGenRuntime.config.configVersionId });
      const result = await withRetries(async () => {
        const stream = await leadGenRuntime.agent.stream(
          leadGenRuntime.preparePrompt(
            `Generate up to ${remainingSlots} leads for this campaign ICP: ${campaign?.icp_description ?? ""}${leadGenSourceHint}`,
          ),
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
}

export function buildPeopleGenStep() {
  type DiscoveredPerson = z.infer<typeof peopleOutputSchema>["people"][number] & {
    source: DiscoverySource;
  };

  return createStep({
  id: "people-gen-step",
  inputSchema: peopleDiscoveryInputSchema,
  outputSchema: peopleDiscoveryOutputSchema,
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

      const leadIdsFilter = getLeadIdsFilter(inputData.runConfig);
      let leadsQuery = supabaseServer
        .from("leads")
        .select("id,company_name,company_domain,linkedin_url,exa_url,raw_data,status")
        .eq("campaign_id", inputData.campaignId)
        .in("status", ["new", "enriching"]);
      if (leadIdsFilter?.length) {
        leadsQuery = leadsQuery.in("id", leadIdsFilter);
      }
      const { data: leads } = await leadsQuery;

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

      const discoveryPrompt = [
        `Campaign ICP: ${campaign?.icp_description ?? ""}`,
        `Target roles: ${(campaign?.target_roles ?? []).join(", ")}`,
        `Find contacts in these companies: ${JSON.stringify(leads)}`,
      ].join("\n");

      const configuredSource = inputData.runConfig?.source ?? "auto";

      const allPeopleBranches: SourceFallbackBranch<DiscoveredPerson>[] = [
        {
          source: "clado",
          requestedToolKeys: ["clado.search_people", "clado.deep_research"],
          execute: async (runtime) => {
            const stream = await runtime.agent.stream(runtime.preparePrompt(discoveryPrompt), {
              structuredOutput: { schema: peopleOutputSchema },
              maxSteps: 10,
            });
            await consumeAgentStream(stream, inputData.runId, "people_gen");
            const object = await stream.object;
            return object.people.map((person) => ({ ...person, source: "clado" as const }));
          },
          hasData: (items) => items.some((person) => knownLeadIds.has(person.lead_id)),
        },
        {
          source: "exa",
          requestedToolKeys: ["exa.search", "exa.research"],
          execute: async (runtime) => {
            const stream = await runtime.agent.stream(runtime.preparePrompt(discoveryPrompt), {
              structuredOutput: { schema: peopleOutputSchema },
              maxSteps: 10,
            });
            await consumeAgentStream(stream, inputData.runId, "people_gen");
            const object = await stream.object;
            return object.people.map((person) => ({ ...person, source: "exa" as const }));
          },
          hasData: (items) => items.some((person) => knownLeadIds.has(person.lead_id)),
        },
        {
          source: "exa-websets",
          requestedToolKeys: ["exa.webset_search_people"],
          execute: async (runtime) => {
            const stream = await runtime.agent.stream(
              runtime.preparePrompt(
                [
                  discoveryPrompt,
                  "",
                  "Use the Exa Webset people search tool to find contacts.",
                  "Request email enrichment so we get verified work emails.",
                ].join("\n"),
              ),
              {
                structuredOutput: { schema: peopleOutputSchema },
                maxSteps: 10,
              },
            );
            await consumeAgentStream(stream, inputData.runId, "people_gen");
            const object = await stream.object;
            return object.people.map((person) => ({ ...person, source: "exa" as const }));
          },
          hasData: (items) => items.some((person) => knownLeadIds.has(person.lead_id)),
        },
      ];

      const peopleBranches =
        configuredSource === "clado"
          ? allPeopleBranches.filter((b) => b.source === "clado")
          : configuredSource === "exa_websets"
            ? allPeopleBranches.filter((b) => b.source === "exa-websets")
            : allPeopleBranches.filter((b) => b.source !== "exa-websets");

      const discoveryResult = await withRetries(async () =>
        runSourceFallback<DiscoveredPerson>({
          runId: inputData.runId,
          agentType: "people_gen",
          stage: "people_discovery",
          branches: peopleBranches,
        }),
      );

      const resultPeople = discoveryResult.items;
      if (discoveryResult.attempts[0]?.configVersionId) {
        await updateRunState(inputData.runId, {
          config_version_id: discoveryResult.attempts[0].configVersionId,
        });
      }

      const seenBatchKeys = new Set<string>();
      const maxContacts = inputData.runConfig?.peopleDiscovery?.maxContacts;
      const contactsToInsert = takeWithLimit(
        resultPeople
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
          clado_profile: person.source === "clado" ? safeParseJson(person.raw_data) : {},
          exa_company_signals: person.source === "exa" ? safeParseJson(person.raw_data) : {},
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
        contactsDiscardedAsDuplicates: resultPeople.length - contactsToInsert.length,
        sourceUsed: discoveryResult.sourceUsed,
        sourceAttempts: discoveryResult.attempts,
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
}

export function buildEnrichmentStep() {
  return createStep({
  id: "enrichment-step",
  inputSchema: enrichmentInputSchema,
  outputSchema: enrichmentOutputSchema,
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
      const leadIdsFilter = getLeadIdsFilter(inputData.runConfig);
      const contactIdsFilter = getContactIdsFilter(inputData.runConfig);
      let contactsToEnrichQuery = supabaseServer
        .from("contacts")
        .select("id,lead_id,name,first_name,linkedin_url,headline,company_name")
        .eq("campaign_id", inputData.campaignId)
        .is("enriched_at", null);
      if (leadIdsFilter?.length) {
        contactsToEnrichQuery = contactsToEnrichQuery.in("lead_id", leadIdsFilter);
      }
      if (contactIdsFilter?.length) {
        contactsToEnrichQuery = contactsToEnrichQuery.in("id", contactIdsFilter);
      }
      const { data: contactsToEnrich } = await contactsToEnrichQuery;
      const maxContacts = inputData.runConfig?.enrichment?.maxContacts;
      const limitedContactsToEnrich = takeWithLimit(contactsToEnrich ?? [], maxContacts);

      if (!limitedContactsToEnrich.length) {
        let unenrichedQuery = supabaseServer
          .from("contacts")
          .select("lead_id")
          .eq("campaign_id", inputData.campaignId)
          .is("enriched_at", null);
        if (leadIdsFilter?.length) {
          unenrichedQuery = unenrichedQuery.in("lead_id", leadIdsFilter);
        }
        if (contactIdsFilter?.length) {
          unenrichedQuery = unenrichedQuery.in("id", contactIdsFilter);
        }
        const { data: leadsWithUnenrichedContacts } = await unenrichedQuery;
        const blockedLeadIds = new Set((leadsWithUnenrichedContacts ?? []).map((contact) => contact.lead_id));

        let candidateLeadsQuery = supabaseServer
          .from("leads")
          .select("id")
          .eq("campaign_id", inputData.campaignId)
          .eq("status", "enriching");
        if (leadIdsFilter?.length) {
          candidateLeadsQuery = candidateLeadsQuery.in("id", leadIdsFilter);
        }
        const { data: candidateLeads } = await candidateLeadsQuery;
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

      const enrichmentPrompt = `Enrich these people candidates: ${JSON.stringify(limitedContactsToEnrich)}`;
      const knownLeadIds = new Set(limitedContactsToEnrich.map((contact) => contact.lead_id));
      const enrichConfiguredSource = inputData.runConfig?.source ?? "auto";

      const allEnrichBranches: SourceFallbackBranch<z.infer<typeof contactsOutputSchema>["contacts"][number]>[] = [
        {
          source: "clado",
          requestedToolKeys: ["clado.get_profile", "clado.enrich_contact"],
          execute: async (runtime) => {
            const stream = await runtime.agent.stream(runtime.preparePrompt(enrichmentPrompt), {
              structuredOutput: { schema: contactsOutputSchema },
              maxSteps: 8,
            });
            await consumeAgentStream(stream, inputData.runId, "enrichment");
            const object = await stream.object;
            return object.contacts;
          },
          hasData: (items) => items.some((contact) => knownLeadIds.has(contact.lead_id)),
        },
        {
          source: "exa",
          requestedToolKeys: ["exa.search_contents"],
          execute: async (runtime) => {
            const stream = await runtime.agent.stream(runtime.preparePrompt(enrichmentPrompt), {
              structuredOutput: { schema: contactsOutputSchema },
              maxSteps: 8,
            });
            await consumeAgentStream(stream, inputData.runId, "enrichment");
            const object = await stream.object;
            return object.contacts;
          },
          hasData: (items) => items.some((contact) => knownLeadIds.has(contact.lead_id)),
        },
        {
          source: "exa-websets",
          requestedToolKeys: ["exa.webset_create", "exa.webset_get_items"],
          execute: async (runtime) => {
            const stream = await runtime.agent.stream(
              runtime.preparePrompt(
                [
                  enrichmentPrompt,
                  "",
                  "Use the Exa Webset create tool with enrichments to extract email and profile data for these contacts.",
                  "Use entity type 'person' and add enrichments for email and a brief professional summary.",
                ].join("\n"),
              ),
              {
                structuredOutput: { schema: contactsOutputSchema },
                maxSteps: 8,
              },
            );
            await consumeAgentStream(stream, inputData.runId, "enrichment");
            const object = await stream.object;
            return object.contacts;
          },
          hasData: (items) => items.some((contact) => knownLeadIds.has(contact.lead_id)),
        },
      ];

      const enrichBranches =
        enrichConfiguredSource === "clado"
          ? allEnrichBranches.filter((b) => b.source === "clado")
          : enrichConfiguredSource === "exa_websets"
            ? allEnrichBranches.filter((b) => b.source === "exa-websets")
            : allEnrichBranches.filter((b) => b.source !== "exa-websets");

      const enrichmentResult = await withRetries(async () =>
        runSourceFallback<z.infer<typeof contactsOutputSchema>["contacts"][number]>({
          runId: inputData.runId,
          agentType: "enrichment",
          stage: "enrichment",
          branches: enrichBranches,
        }),
      );
      if (enrichmentResult.attempts[0]?.configVersionId) {
        await updateRunState(inputData.runId, {
          config_version_id: enrichmentResult.attempts[0].configVersionId,
        });
      }

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

      for (const enriched of enrichmentResult.items) {
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
            industry: enriched.industry ?? null,
            website: enriched.website ?? null,
            product: enriched.product ?? null,
            pain_point: enriched.pain_point ?? null,
            company_size: enriched.company_size ?? null,
            location: enriched.location ?? null,
            role_summary: enriched.role_summary ?? null,
            recent_activity: enriched.recent_activity ?? null,
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
        sourceUsed: enrichmentResult.sourceUsed,
        sourceAttempts: enrichmentResult.attempts,
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
}

const deepResearchOutputSchema = z.object({
  company_description: z.string().min(1),
  fit_reasoning: z.string().min(1),
});

export function buildCompanyResearchStep() {
  return createStep({
  id: "company-research-step",
  inputSchema: companyResearchInputSchema,
  outputSchema: companyResearchOutputSchema,
  execute: async ({ inputData }) => {
    const stage = "company_research";
    const startedAt = Date.now();
    if (!shouldRunStage(inputData.selectedStages, stage)) {
      await logRunEvent(inputData.runId, "company_research", "info", "Company research skipped", {
        campaignId: inputData.campaignId,
        selectedStages: inputData.selectedStages ?? [],
      });
      return { ...inputData, leadsResearched: 0 };
    }
    await updateRunState(inputData.runId, { status: "running", current_stage: stage });
    await logRunEvent(inputData.runId, "company_research", "info", "Company research started", {
      campaignId: inputData.campaignId,
    });

    try {
      const leadIdsFilter = getLeadIdsFilter(inputData.runConfig);
      let leadsQuery = supabaseServer
        .from("leads")
        .select("id,campaign_id,company_name,company_domain,linkedin_url,exa_url,raw_data")
        .eq("campaign_id", inputData.campaignId)
        .is("researched_at", null);
      if (leadIdsFilter?.length) {
        leadsQuery = leadsQuery.in("id", leadIdsFilter);
      }
      const { data: leads } = await leadsQuery;

      if (!leads?.length) {
        await logRunEvent(inputData.runId, "company_research", "success", "No leads pending company research", {
          campaignId: inputData.campaignId,
          durationMs: Date.now() - startedAt,
        });
        return { ...inputData, leadsResearched: 0 };
      }

      const { data: campaign } = await supabaseServer
        .from("campaigns")
        .select("id,name,icp_description,scoring_rubric,target_roles,target_industries,company_size,company_signals,disqualify_signals")
        .eq("id", inputData.campaignId)
        .single();

      const runtime = await buildRuntimeAgent("people_gen", {
        requestedToolKeys: ["exa.research", "exa.search"],
      });

      let researched = 0;
      for (const lead of leads) {
        try {
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
          await consumeAgentStream(stream, inputData.runId, "company_research");
          const result = await stream.object;

          await supabaseServer
            .from("leads")
            .update({
              company_description: result.company_description,
              fit_reasoning: result.fit_reasoning,
              researched_at: new Date().toISOString(),
            })
            .eq("id", lead.id);

          researched++;
          await logRunEvent(inputData.runId, "company_research", "info", "Lead deep research completed", {
            leadId: lead.id,
            companyName: lead.company_name,
          });
        } catch (leadError) {
          const message = leadError instanceof Error ? leadError.message : String(leadError);
          await supabaseServer
            .from("leads")
            .update({
              researched_at: new Date().toISOString(),
              fit_reasoning: `Deep research failed: ${message}`,
            })
            .eq("id", lead.id);
          await logRunEvent(inputData.runId, "company_research", "warn", "Lead deep research failed, continuing", {
            leadId: lead.id,
            companyName: lead.company_name,
            error: message,
          });
        }
      }

      await logRunEvent(inputData.runId, "company_research", "success", "Company research completed", {
        campaignId: inputData.campaignId,
        leadsResearched: researched,
        leadsTotal: leads.length,
        durationMs: Date.now() - startedAt,
      });

      return { ...inputData, leadsResearched: researched };
    } catch (error) {
      await logRunEvent(inputData.runId, "company_research", "error", "Company research failed", {
        campaignId: inputData.campaignId,
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startedAt,
      });
      throw error;
    }
  },
  });
}

export function buildScoringStep() {
  return createStep({
  id: "scoring-step",
  inputSchema: scoringInputSchema,
  outputSchema: scoringOutputSchema,
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
      const leadIdsFilter = getLeadIdsFilter(inputData.runConfig);
      const contactIdsFilter = getContactIdsFilter(inputData.runConfig);
      let contactsQuery = supabaseServer
        .from("contacts")
        .select("id,lead_id,name,email,email_verified,headline,company_name,contact_brief,exa_company_signals")
        .eq("campaign_id", inputData.campaignId)
        .not("enriched_at", "is", null);
      if (leadIdsFilter?.length) {
        contactsQuery = contactsQuery.in("lead_id", leadIdsFilter);
      }
      if (contactIdsFilter?.length) {
        contactsQuery = contactsQuery.in("id", contactIdsFilter);
      }
      const { data: contacts } = await contactsQuery;

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

      // Fetch company-level deep research (company_description + fit_reasoning) for each lead
      const scoringLeadIds = Array.from(new Set(limitedContactsToScore.map((c) => c.lead_id)));
      const { data: scoringLeads } = await supabaseServer
        .from("leads")
        .select("id,company_description,fit_reasoning")
        .in("id", scoringLeadIds);
      const leadResearchMap = new Map(
        (scoringLeads ?? []).map((lead) => [lead.id, {
          company_description: lead.company_description as string | null,
          fit_reasoning: lead.fit_reasoning as string | null,
        }]),
      );

      // Enrich contacts with lead-level research for the scoring agent
      const contactsWithResearch = limitedContactsToScore.map((contact) => {
        const research = leadResearchMap.get(contact.lead_id);
        return {
          ...contact,
          company_description: research?.company_description ?? null,
          fit_reasoning: research?.fit_reasoning ?? null,
        };
      });

      const scoringRuntime = await buildRuntimeAgent("scoring");
      await updateRunState(inputData.runId, { config_version_id: scoringRuntime.config.configVersionId });
      const result = await withRetries(async () => {
        const stream = await scoringRuntime.agent.stream(
          scoringRuntime.preparePrompt(
            [
              `Score contacts with this rubric:`,
              campaign?.scoring_rubric ?? "",
              "",
              "Each contact includes company_description and fit_reasoning from deep company research. Use these to inform your scoring — they contain analysis of how well the company fits the ICP.",
              "",
              `Data:${JSON.stringify(contactsWithResearch)}`,
            ].join("\n"),
          ),
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
}

export function buildEmailStep() {
  return createStep({
  id: "email-step",
  inputSchema: emailInputSchema,
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
          "company_id,account_ids,daily_send_limit,value_prop,icp_description,mailbox_selection_mode,primary_account_id,template_experiment_id,test_mode_enabled,test_recipient_emails,persona_name,persona_title,persona_company",
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

      const leadIdsFilter = getLeadIdsFilter(inputData.runConfig);
      const contactIdsFilter = getContactIdsFilter(inputData.runConfig);
      const { data: hotOrWarmScores } = await supabaseServer
        .from("icp_scores")
        .select("contact_id,tier,recommended_angle")
        .eq("campaign_id", inputData.campaignId)
        .eq("next_action", "email")
        .in("tier", ["hot", "warm"]);

      let scoresToUse = hotOrWarmScores ?? [];
      if (contactIdsFilter?.length && scoresToUse.length) {
        const allowedContactIds = new Set(contactIdsFilter);
        scoresToUse = scoresToUse.filter((score) => allowedContactIds.has(score.contact_id));
      }
      if (leadIdsFilter?.length && scoresToUse.length) {
        const contactIds = [...new Set(scoresToUse.map((s) => s.contact_id))];
        const { data: contactsForLeads } = await supabaseServer
          .from("contacts")
          .select("id,lead_id")
          .in("id", contactIds)
          .in("lead_id", leadIdsFilter);
        const allowedContactIds = new Set((contactsForLeads ?? []).map((c) => c.id));
        scoresToUse = scoresToUse.filter((s) => allowedContactIds.has(s.contact_id));
      }

      if (!scoresToUse.length) {
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

      const scoreByContact = new Map(scoresToUse.map((item) => [item.contact_id, item]));
      const contactIds = scoresToUse.map((item) => item.contact_id);
      const { data: contacts } = await supabaseServer
        .from("contacts")
        .select(
          "id,lead_id,name,first_name,email,email_verified,company_name,headline,contact_brief,exa_company_signals,enriched_at,industry,website,product,pain_point,company_size,location,role_summary,recent_activity",
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
      const candidateContactIds = sendableContacts.map((contact) => contact.id);
      const { data: previouslySentRows } = candidateContactIds.length
        ? await supabaseServer
            .from("emails_sent")
            .select("contact_id")
            .eq("campaign_id", inputData.campaignId)
            .eq("step_number", 1)
            .eq("is_test_send", false)
            .in("contact_id", candidateContactIds)
        : { data: [] as Array<{ contact_id: string }> };
      const previouslySentContactIds = new Set((previouslySentRows ?? []).map((row) => row.contact_id));
      const unsentContacts = sendableContacts.filter((contact) => !previouslySentContactIds.has(contact.id));
      const skippedForDuplicate = sendableContacts.length - unsentContacts.length;
      if (skippedForDuplicate > 0) {
        await logRunEvent(inputData.runId, "cold_email", "info", "Skipped contacts already emailed in this campaign", {
          skippedForDuplicate,
          dedupeScope: "campaign_id + contact_id + step_number=1 + is_test_send=false",
        });
      }
      const limitedContacts = unsentContacts.slice(0, sendCap);
      if (!limitedContacts.length) {
        await updateRunState(inputData.runId, { emails_sent: 0 });
        await logRunEvent(inputData.runId, "cold_email", "success", "No unsent contacts available for email", {
          campaignId: inputData.campaignId,
          sendCap,
          skippedForEligibility,
          skippedForDuplicate,
          durationMs: Date.now() - startedAt,
        });
        return {
          leadsGenerated: inputData.leadsGenerated,
          leadsEnriched: inputData.leadsEnriched,
          leadsScored: inputData.leadsScored,
          emailsSent: 0,
        };
      }
      const useTemplateExperiments = env.ENABLE_TEMPLATE_EXPERIMENTS !== "false";
      const activeExperiment = useTemplateExperiments
        ? await getActiveExperimentForCampaign(inputData.campaignId)
        : null;

      // Fallback: if no experiment, use the most recent active template for this company
      let fallbackSubjectTemplate: string | null = null;
      let fallbackBodyTemplate: string | null = null;
      if (!activeExperiment && campaign?.company_id) {
        const { data: fallbackTemplate } = await supabaseServer
          .from("email_templates")
          .select("id,name,active_version_id")
          .eq("company_id", campaign.company_id as string)
          .eq("status", "active")
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (fallbackTemplate?.active_version_id) {
          const { data: fallbackVersion } = await supabaseServer
            .from("email_template_versions")
            .select("subject_template,body_template")
            .eq("id", fallbackTemplate.active_version_id)
            .single();
          if (fallbackVersion) {
            fallbackSubjectTemplate = fallbackVersion.subject_template;
            fallbackBodyTemplate = fallbackVersion.body_template;
            await logRunEvent(inputData.runId, "cold_email", "info", "Using fallback template (no experiment active)", {
              templateId: fallbackTemplate.id,
              templateName: fallbackTemplate.name,
              versionId: fallbackTemplate.active_version_id,
            });
          }
        }
      }

      const templateVersionCache = new Map<
        string,
        { id: string; subject_template: string; body_template: string; prompt_context: string | null }
      >();
      let routedToTemplatePath = 0;
      const sent: Array<{
        contactId: string;
        leadId: string;
        accountId: string;
        threadId: string | null;
        isTestSend: boolean;
      }> = [];
      const selectedVariantIds: string[] = [];
      const selectedTemplateVersionIds: string[] = [];

      let sendFailures = 0;
      for (const contact of limitedContacts) {
        try {
        const account = await selectSendingAccount(inputData.campaignId, {
          contactId: contact.id,
          preferredAccountId: campaign?.primary_account_id as string | null,
        });

        let variantId: string | null = null;
        let templateVersionId: string | null = null;
        let subjectTemplate = fallbackSubjectTemplate ?? "Quick idea for {{company_name}}";
        let bodyTemplate = fallbackBodyTemplate
          ?? "<p>Hi {{first_name}},</p><p>I had one idea for {{company_name}} that could help with your current priorities.</p><p>Worth a quick chat this week?</p>";

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

        const variables: Record<string, string> = {
          name: contact.name ?? "",
          first_name: contact.first_name ?? contact.name ?? "",
          company_name: contact.company_name ?? "",
          headline: contact.headline ?? "",
          recommended_angle: String(scoreByContact.get(contact.id)?.recommended_angle ?? ""),
          value_prop: String(campaign?.value_prop ?? ""),
          industry: contact.industry ?? "",
          website: contact.website ?? "",
          product: contact.product ?? "",
          pain_point: contact.pain_point ?? "",
          company_size: contact.company_size ?? "",
          location: contact.location ?? "",
          role_summary: contact.role_summary ?? "",
          recent_activity: contact.recent_activity ?? "",
          persona_name: String(campaign?.persona_name ?? ""),
          persona_title: String(campaign?.persona_title ?? ""),
          persona_company: String(campaign?.persona_company ?? ""),
        };

        // Validate template variables — warn if any placeholders have empty data
        const validation = validateTemplateVariables(subjectTemplate, bodyTemplate, variables);
        if (!validation.valid) {
          await logRunEvent(inputData.runId, "cold_email", "warn", "Template has placeholders with missing data", {
            contactId: contact.id,
            missing: validation.missing,
            empty: validation.empty,
          });
        }

        const subject = renderTemplate(subjectTemplate, variables).trim() || "Quick idea";
        const { bodyText: finalBodyText } = renderTemplateBodies(bodyTemplate, variables);
        if (!finalBodyText) continue;
        const personalizationSource = "template" as const;
        routedToTemplatePath += 1;

        const deliveryTargets = testModeEnabled
          ? testRecipientEmails
          : [contact.email as string];
        const originalRecipient = contact.email ?? "(no-contact-email)";
        const nowIso = new Date().toISOString();
        const finalBodyTextWithSignature =
          account.signature_enabled_by_default
            ? appendSignatureText(finalBodyText, account.signature_html)
            : finalBodyText;

        for (const targetEmail of deliveryTargets) {
          await logRunEvent(inputData.runId, "cold_email", "info", "Email delivery prepared", {
            contactId: contact.id,
            originalRecipient,
            effectiveRecipient: targetEmail,
            effectiveRecipients: deliveryTargets,
            testModeEnabled,
            renderMode: "text/plain",
            personalizationSource,
            signatureApplied: Boolean(account.signature_enabled_by_default && account.signature_html),
          });
          const sendFn =
            (account.provider ?? "gmail_composio") === "agentmail"
              ? sendEmailWithAgentMail
              : sendEmailWithComposio;
          const sendResult = await sendFn(
            account.id,
            targetEmail,
            subject,
            finalBodyTextWithSignature,
            finalBodyTextWithSignature,
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
            body_html: finalBodyTextWithSignature,
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
        } catch (contactError) {
          sendFailures++;
          await logRunEvent(inputData.runId, "cold_email", "warn", "Email send failed for contact, continuing to next", {
            contactId: contact.id,
            contactName: contact.name,
            contactEmail: contact.email,
            error: contactError instanceof Error ? contactError.message : String(contactError),
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
        sendFailures,
        runConfiguredSendCap: inputData.runConfig?.email?.maxSends ?? null,
        mailboxMode: campaign?.mailbox_selection_mode ?? "least_loaded",
        selectedAccountIds: Array.from(new Set(sent.map((item) => item.accountId))),
        selectedVariantIds: Array.from(new Set(selectedVariantIds)),
        selectedTemplateVersionIds: Array.from(new Set(selectedTemplateVersionIds)),
        experimentId: activeExperiment?.id ?? null,
        renderMode: "text/plain",
        routedToTemplatePath,
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
}

const leadGenStep = buildLeadGenStep();
const peopleGenStep = buildPeopleGenStep();
const enrichmentStep = buildEnrichmentStep();
const companyResearchStep = buildCompanyResearchStep();
const scoringStep = buildScoringStep();
const emailStep = buildEmailStep();

export const salesPipelineWorkflow = createWorkflow({
  id: "sales-pipeline-workflow",
  inputSchema: pipelineInput,
  outputSchema: fullPipelineOutputSchema,
})
  .then(leadGenStep)
  .then(peopleGenStep)
  .then(enrichmentStep)
  .then(companyResearchStep)
  .then(scoringStep)
  .then(emailStep)
  .commit();
