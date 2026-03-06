create extension if not exists pgcrypto;

create table if not exists agent_configs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null check (type in ('lead_gen','enrichment','scoring','cold_email','followup')),
  system_prompt text not null,
  model text not null default 'openai/gpt-5.2',
  temperature float not null default 0.3,
  max_tokens int not null default 4096,
  tools_enabled text[] default '{}',
  tool_configs jsonb default '{}',
  prompt_vars jsonb default '{}',
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text default 'draft' check (status in ('draft','active','paused','completed')),
  icp_description text not null,
  target_industries text[] default '{}',
  target_roles text[] default '{}',
  geography text,
  company_size text,
  company_signals text,
  exclude_domains text[] default '{}',
  leads_per_run int default 20,
  scoring_rubric text,
  hot_threshold int default 75,
  warm_threshold int default 50,
  disqualify_signals text,
  account_ids uuid[] default '{}',
  persona_name text,
  persona_title text,
  persona_company text,
  value_prop text,
  tone text default 'professional',
  cta_type text,
  cta_link text,
  sequence_steps jsonb default '[]',
  daily_send_limit int default 50,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists email_accounts (
  id uuid primary key default gen_random_uuid(),
  gmail_address text not null unique,
  display_name text,
  composio_user_id text not null,
  warmup_status text default 'new' check (warmup_status in ('new','warming','graduated','paused')),
  warmup_start_date date,
  daily_limit int default 50,
  sends_today int default 0,
  last_reset_at date default current_date,
  is_active boolean default true,
  created_at timestamptz default now()
);

create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references campaigns(id) on delete cascade,
  source text not null check (source in ('exa','clado','manual')),
  company_name text,
  company_domain text,
  linkedin_url text,
  exa_url text,
  raw_data jsonb default '{}',
  status text not null default 'new'
    check (status in ('new','enriching','enriched','scored','emailed','disqualified','error')),
  pipeline_run_id uuid,
  created_at timestamptz default now()
);

create table if not exists contacts (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references leads(id) on delete cascade,
  campaign_id uuid references campaigns(id),
  name text,
  first_name text,
  email text,
  email_verified boolean default false,
  phone text,
  linkedin_url text,
  headline text,
  company_name text,
  clado_profile jsonb default '{}',
  exa_company_signals jsonb default '{}',
  contact_brief text,
  enriched_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists icp_scores (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid references contacts(id) on delete cascade,
  campaign_id uuid references campaigns(id),
  score int not null,
  tier text not null check (tier in ('hot','warm','cold','disqualified')),
  reasoning text,
  positive_signals jsonb default '[]',
  negative_signals jsonb default '[]',
  recommended_angle text,
  next_action text check (next_action in ('email','manual_review','discard')),
  scored_at timestamptz default now()
);

create table if not exists enrollments (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references campaigns(id) on delete cascade,
  contact_id uuid references contacts(id) on delete cascade,
  account_id uuid references email_accounts(id),
  current_step int default 0,
  status text default 'active' check (status in ('active','paused','completed','unsubscribed','bounced','replied')),
  gmail_thread_id text,
  next_step_at timestamptz,
  enrolled_at timestamptz default now(),
  unique(campaign_id, contact_id)
);

create table if not exists emails_sent (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid references enrollments(id) on delete cascade,
  account_id uuid references email_accounts(id),
  step_number int,
  to_email text,
  subject text,
  body_html text,
  sent_at timestamptz default now(),
  opened_at timestamptz,
  replied_at timestamptz,
  bounced boolean default false,
  classification text
);

create table if not exists pipeline_runs (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references campaigns(id),
  trigger text default 'manual' check (trigger in ('manual','cron','webhook')),
  status text default 'running' check (status in ('running','completed','failed','cancelled')),
  current_stage text,
  leads_generated int default 0,
  leads_enriched int default 0,
  leads_scored int default 0,
  emails_sent int default 0,
  started_at timestamptz default now(),
  finished_at timestamptz,
  error text
);

create table if not exists run_logs (
  id bigint primary key generated always as identity,
  run_id uuid references pipeline_runs(id) on delete cascade,
  agent_type text,
  level text default 'info' check (level in ('info','warn','error','success')),
  message text,
  metadata jsonb default '{}',
  ts timestamptz default now()
);

create table if not exists warmup_logs (
  id bigint primary key generated always as identity,
  from_account_id uuid references email_accounts(id),
  to_account_id uuid references email_accounts(id),
  direction text check (direction in ('sent','replied','opened')),
  sent_at timestamptz default now()
);

create table if not exists suppressions (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  reason text,
  added_at timestamptz default now()
);

create index if not exists idx_leads_campaign_status on leads(campaign_id, status);
create index if not exists idx_leads_pipeline_run on leads(pipeline_run_id);
create index if not exists idx_contacts_lead_id on contacts(lead_id);
create index if not exists idx_contacts_campaign_id on contacts(campaign_id);
create index if not exists idx_contacts_email on contacts(email);
create index if not exists idx_scores_contact_id on icp_scores(contact_id);
create index if not exists idx_scores_campaign_tier on icp_scores(campaign_id, tier);
create index if not exists idx_enrollments_status_next_step on enrollments(status, next_step_at);
create index if not exists idx_enrollments_campaign on enrollments(campaign_id);
create index if not exists idx_emails_sent_enrollment on emails_sent(enrollment_id);
create index if not exists idx_run_logs_run_id on run_logs(run_id);
create index if not exists idx_warmup_logs_from_sent on warmup_logs(from_account_id, sent_at);

alter table agent_configs disable row level security;
alter table campaigns disable row level security;
alter table email_accounts disable row level security;
alter table leads disable row level security;
alter table contacts disable row level security;
alter table icp_scores disable row level security;
alter table enrollments disable row level security;
alter table emails_sent disable row level security;
alter table pipeline_runs disable row level security;
alter table run_logs disable row level security;
alter table warmup_logs disable row level security;
alter table suppressions disable row level security;

create or replace function increment_sends_today(p_account_id uuid)
returns void as $$
  update email_accounts
  set sends_today = sends_today + 1
  where id = p_account_id;
$$ language sql;

create or replace function reset_daily_sends()
returns void as $$
  update email_accounts
  set sends_today = 0, last_reset_at = current_date
  where last_reset_at < current_date;
$$ language sql;
