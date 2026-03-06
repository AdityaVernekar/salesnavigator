create table if not exists stage_jobs (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references pipeline_runs(id) on delete cascade,
  campaign_id uuid not null references campaigns(id) on delete cascade,
  stage text not null check (stage in ('lead_generation','people_discovery','enrichment','scoring','email')),
  status text not null default 'queued' check (status in ('queued','processing','completed','failed','cancelled')),
  priority int not null default 0,
  idempotency_key text not null,
  chunk_index int not null default 0,
  chunk_size int not null default 0,
  payload jsonb not null default '{}'::jsonb,
  attempt int not null default 0,
  max_attempts int not null default 5,
  last_error text,
  worker_id text,
  lease_expires_at timestamptz,
  available_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(run_id, idempotency_key)
);

create table if not exists send_jobs (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references pipeline_runs(id) on delete cascade,
  campaign_id uuid not null references campaigns(id) on delete cascade,
  stage_job_id uuid references stage_jobs(id) on delete set null,
  status text not null default 'queued' check (status in ('queued','processing','completed','failed','cancelled')),
  priority int not null default 0,
  idempotency_key text not null,
  payload jsonb not null default '{}'::jsonb,
  attempt int not null default 0,
  max_attempts int not null default 5,
  last_error text,
  worker_id text,
  lease_expires_at timestamptz,
  available_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(run_id, idempotency_key)
);

create index if not exists idx_stage_jobs_status_priority_created
  on stage_jobs(status, priority desc, created_at asc);

create index if not exists idx_stage_jobs_stage_status
  on stage_jobs(stage, status, available_at asc);

create index if not exists idx_stage_jobs_campaign_created
  on stage_jobs(campaign_id, created_at desc);

create index if not exists idx_send_jobs_status_priority_created
  on send_jobs(status, priority desc, created_at asc);

create index if not exists idx_send_jobs_campaign_created
  on send_jobs(campaign_id, created_at desc);

create index if not exists idx_send_jobs_available
  on send_jobs(status, available_at asc);
