import { createWorkflow } from "@mastra/core/workflows";
import {
  enrichmentOutputSchema,
  buildEnrichmentStep,
  buildLeadGenStep,
  buildPeopleGenStep,
  buildScoringStep,
  leadGenerationOutputSchema,
  peopleDiscoveryOutputSchema,
  pipelineInput,
  scoringOutputSchema,
} from "@/mastra/workflows/sales-pipeline";

export const salesPipelineLeadGenerationWorkflow = createWorkflow({
  id: "sales-pipeline-lead-generation-workflow",
  inputSchema: pipelineInput,
  outputSchema: leadGenerationOutputSchema,
})
  .then(buildLeadGenStep())
  .commit();

export const salesPipelinePeopleDiscoveryWorkflow = createWorkflow({
  id: "sales-pipeline-people-discovery-workflow",
  inputSchema: pipelineInput,
  outputSchema: peopleDiscoveryOutputSchema,
})
  .then(buildLeadGenStep())
  .then(buildPeopleGenStep())
  .commit();

export const salesPipelineEnrichmentWorkflow = createWorkflow({
  id: "sales-pipeline-enrichment-workflow",
  inputSchema: pipelineInput,
  outputSchema: enrichmentOutputSchema,
})
  .then(buildLeadGenStep())
  .then(buildPeopleGenStep())
  .then(buildEnrichmentStep())
  .commit();

export const salesPipelineScoringWorkflow = createWorkflow({
  id: "sales-pipeline-scoring-workflow",
  inputSchema: pipelineInput,
  outputSchema: scoringOutputSchema,
})
  .then(buildLeadGenStep())
  .then(buildPeopleGenStep())
  .then(buildEnrichmentStep())
  .then(buildScoringStep())
  .commit();
