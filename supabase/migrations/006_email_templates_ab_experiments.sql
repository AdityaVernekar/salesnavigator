create table if not exists email_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  status text not null default 'active' check (status in ('active', 'archived')),
  active_version_id uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists email_template_versions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references email_templates(id) on delete cascade,
  version int not null,
  subject_template text not null,
  body_template text not null,
  prompt_context text,
  placeholders text[] default '{}',
  change_note text,
  created_by text,
  created_at timestamptz default now(),
  unique(template_id, version)
);

alter table email_templates
  add constraint fk_email_templates_active_version
  foreign key (active_version_id) references email_template_versions(id)
  on delete set null;

create table if not exists template_generation_sessions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid references email_templates(id) on delete set null,
  status text not null default 'active' check (status in ('active', 'completed', 'failed')),
  created_by text,
  created_at timestamptz default now()
);

create table if not exists template_generation_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references template_generation_sessions(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  metadata jsonb default '{}',
  created_at timestamptz default now()
);

create table if not exists email_template_experiments (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  template_id uuid not null references email_templates(id) on delete cascade,
  status text not null default 'active' check (status in ('draft', 'active', 'paused', 'completed')),
  optimization_mode text not null default 'bandit' check (optimization_mode in ('bandit')),
  min_sample_size int not null default 20,
  exploration_rate numeric(4,3) not null default 0.2,
  winner_variant_id uuid,
  winner_version_id uuid references email_template_versions(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists email_template_variants (
  id uuid primary key default gen_random_uuid(),
  experiment_id uuid not null references email_template_experiments(id) on delete cascade,
  template_version_id uuid not null references email_template_versions(id) on delete cascade,
  name text not null,
  initial_weight numeric(5,4) not null default 0.5,
  dynamic_weight numeric(8,6) not null default 0.5,
  state text not null default 'active' check (state in ('active', 'paused', 'winner', 'loser')),
  created_at timestamptz default now(),
  unique(experiment_id, template_version_id)
);

alter table email_template_experiments
  add constraint fk_experiments_winner_variant
  foreign key (winner_variant_id) references email_template_variants(id)
  on delete set null;

create table if not exists email_variant_events (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  enrollment_id uuid references enrollments(id) on delete set null,
  variant_id uuid not null references email_template_variants(id) on delete cascade,
  template_version_id uuid references email_template_versions(id) on delete set null,
  sent_at timestamptz,
  opened_at timestamptz,
  replied_at timestamptz,
  bounced_at timestamptz,
  reward numeric(8,6) not null default 0,
  created_at timestamptz default now()
);

alter table campaigns
  add column if not exists mailbox_selection_mode text not null default 'least_loaded'
  check (mailbox_selection_mode in ('explicit_single', 'round_robin', 'least_loaded'));

alter table campaigns
  add column if not exists primary_account_id uuid references email_accounts(id) on delete set null;

alter table campaigns
  add column if not exists template_experiment_id uuid references email_template_experiments(id) on delete set null;

alter table emails_sent
  add column if not exists campaign_id uuid references campaigns(id) on delete cascade;

alter table emails_sent
  add column if not exists contact_id uuid references contacts(id) on delete set null;

alter table emails_sent
  add column if not exists variant_id uuid references email_template_variants(id) on delete set null;

alter table emails_sent
  add column if not exists template_version_id uuid references email_template_versions(id) on delete set null;

alter table emails_sent
  add column if not exists gmail_thread_id text;

create index if not exists idx_email_template_versions_template_id
  on email_template_versions(template_id, version desc);

create index if not exists idx_template_messages_session
  on template_generation_messages(session_id, created_at asc);

create index if not exists idx_template_experiments_campaign_status
  on email_template_experiments(campaign_id, status);

create index if not exists idx_template_variants_experiment_state
  on email_template_variants(experiment_id, state);

create index if not exists idx_email_variant_events_variant_contact
  on email_variant_events(variant_id, contact_id);

create index if not exists idx_emails_sent_campaign_contact
  on emails_sent(campaign_id, contact_id, sent_at desc);

alter table email_templates disable row level security;
alter table email_template_versions disable row level security;
alter table template_generation_sessions disable row level security;
alter table template_generation_messages disable row level security;
alter table email_template_experiments disable row level security;
alter table email_template_variants disable row level security;
alter table email_variant_events disable row level security;
