alter table pipeline_runs
  add column if not exists run_mode text default 'full'
  check (run_mode in ('full', 'custom'));

alter table pipeline_runs
  add column if not exists start_stage text;

alter table pipeline_runs
  add column if not exists end_stage text;

alter table pipeline_runs
  add column if not exists selected_stages text[] default '{}';

create table if not exists cron_run_logs (
  id uuid primary key default gen_random_uuid(),
  job_name text not null,
  status text not null check (status in ('running','success','failed')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  duration_ms int,
  details jsonb default '{}',
  error text
);

create index if not exists idx_cron_run_logs_job_started
  on cron_run_logs(job_name, started_at desc);

alter table cron_run_logs disable row level security;
