alter table pipeline_runs
  add column if not exists run_config jsonb default '{}'::jsonb;
