import { Mastra } from "@mastra/core/mastra";
import { PostgresStore } from "@mastra/pg";
import { followUpWorkflow } from "@/mastra/workflows/follow-up";
import { salesPipelineWorkflow } from "@/mastra/workflows/sales-pipeline";
import {
  salesPipelineEnrichmentWorkflow,
  salesPipelineLeadGenerationWorkflow,
  salesPipelinePeopleDiscoveryWorkflow,
  salesPipelineScoringWorkflow,
} from "@/mastra/workflows/sales-pipeline-stage";
import { env } from "@/lib/config/env";

export const mastra = new Mastra({
  storage: new PostgresStore({
    id: "salesnav-mastra-storage",
    connectionString: env.SUPABASE_DB_POOLER_URL || env.SUPABASE_DB_URL,
    ssl: { rejectUnauthorized: false },
  }),
  workflows: {
    salesPipelineWorkflow,
    salesPipelineLeadGenerationWorkflow,
    salesPipelinePeopleDiscoveryWorkflow,
    salesPipelineEnrichmentWorkflow,
    salesPipelineScoringWorkflow,
    followUpWorkflow,
  },
});
