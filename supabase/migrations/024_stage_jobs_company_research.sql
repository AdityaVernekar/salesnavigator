-- Add company_research to the stage_jobs stage check constraint
ALTER TABLE stage_jobs DROP CONSTRAINT stage_jobs_stage_check;
ALTER TABLE stage_jobs ADD CONSTRAINT stage_jobs_stage_check
  CHECK (stage IN ('lead_generation','people_discovery','enrichment','company_research','scoring','email'));
