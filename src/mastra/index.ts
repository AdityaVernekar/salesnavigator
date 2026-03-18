import { Mastra } from "@mastra/core/mastra";
import { LibSQLStore } from "@mastra/libsql";
import { followUpWorkflow } from "@/mastra/workflows/follow-up";
import { salesPipelineWorkflow } from "@/mastra/workflows/sales-pipeline";
import {
  salesPipelineEnrichmentWorkflow,
  salesPipelineLeadGenerationWorkflow,
  salesPipelinePeopleDiscoveryWorkflow,
  salesPipelineScoringWorkflow,
} from "@/mastra/workflows/sales-pipeline-stage";

// Use in-memory LibSQL instead of PostgresStore to avoid DDL lock contention
// on Supabase. Mastra workflow execution state is ephemeral — actual pipeline
// state is persisted in pipeline_runs / stage_jobs via supabaseServer.
export const mastra = new Mastra({
  storage: new LibSQLStore({
    id: "salesnav-mastra-storage",
    url: ":memory:",
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
