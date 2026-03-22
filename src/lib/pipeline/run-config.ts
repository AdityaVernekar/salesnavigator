import { z } from "zod";
import { EXECUTABLE_PIPELINE_STAGES, type ExecutablePipelineStage } from "@/lib/pipeline/stages";

const boundedInt = (min: number, max: number) => z.number().int().min(min).max(max);

export const pipelineRunConfigSchema = z
  .object({
    /** When set, pipeline stages only process these leads (Clay-style run from leads list). */
    leadIds: z.array(z.string().uuid()).max(500).optional(),
    /** When set, contact-based stages only process these selected contacts. */
    contactIds: z.array(z.string().uuid()).max(2000).optional(),
    /** Data source for lead/people discovery and enrichment. */
    source: z.enum(["auto", "clado", "exa_websets"]).optional(),
    leadGeneration: z
      .object({
        maxLeads: boundedInt(1, 500),
      })
      .optional(),
    peopleDiscovery: z
      .object({
        maxContacts: boundedInt(1, 2000),
      })
      .optional(),
    enrichment: z
      .object({
        maxContacts: boundedInt(1, 2000),
      })
      .optional(),
    scoring: z
      .object({
        maxContacts: boundedInt(1, 2000),
      })
      .optional(),
    email: z
      .object({
        maxSends: boundedInt(1, 500),
        useTestMode: z.boolean().optional(),
        testRecipientEmails: z.array(z.string().email()).max(50).optional(),
      })
      .optional(),
  })
  .default({});

export type PipelineRunConfig = z.infer<typeof pipelineRunConfigSchema>;

const stageToConfigKey: Record<ExecutablePipelineStage, keyof PipelineRunConfig> = {
  lead_generation: "leadGeneration",
  people_discovery: "peopleDiscovery",
  enrichment: "enrichment",
  company_research: "enrichment",
  scoring: "scoring",
  email: "email",
};

export function normalizeRunConfig(
  runConfig: PipelineRunConfig | undefined,
  selectedStages: ExecutablePipelineStage[],
): PipelineRunConfig {
  const parsed = pipelineRunConfigSchema.parse(runConfig ?? {});
  const selected = new Set(selectedStages);
  const normalized: PipelineRunConfig = {};

  if (parsed.leadIds?.length) {
    normalized.leadIds = parsed.leadIds;
  }
  if (parsed.contactIds?.length) {
    normalized.contactIds = parsed.contactIds;
  }
  if (parsed.source) {
    normalized.source = parsed.source;
  }
  for (const stage of EXECUTABLE_PIPELINE_STAGES) {
    if (!selected.has(stage)) continue;
    if (stage === "lead_generation" && parsed.leadGeneration) {
      normalized.leadGeneration = parsed.leadGeneration;
    }
    if (stage === "people_discovery" && parsed.peopleDiscovery) {
      normalized.peopleDiscovery = parsed.peopleDiscovery;
    }
    if (stage === "enrichment" && parsed.enrichment) {
      normalized.enrichment = parsed.enrichment;
    }
    if (stage === "scoring" && parsed.scoring) {
      normalized.scoring = parsed.scoring;
    }
    if (stage === "email" && parsed.email) {
      normalized.email = parsed.email;
    }
  }

  return normalized;
}

export function getStageConfigKey(stage: ExecutablePipelineStage): keyof PipelineRunConfig {
  return stageToConfigKey[stage];
}
