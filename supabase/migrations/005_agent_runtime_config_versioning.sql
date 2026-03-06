create table if not exists agent_config_versions (
  id uuid primary key default gen_random_uuid(),
  agent_config_id uuid not null references agent_configs(id) on delete cascade,
  version int not null,
  name text not null,
  type text not null check (type in ('lead_gen','enrichment','scoring','cold_email','followup')),
  system_prompt text not null,
  model text not null default 'openai/gpt-5.2',
  temperature float not null default 0.3,
  max_tokens int not null default 4096,
  tools_enabled text[] default '{}',
  tool_configs jsonb default '{}',
  prompt_vars jsonb default '{}',
  change_note text,
  created_by text,
  created_at timestamptz default now(),
  unique(agent_config_id, version)
);

alter table agent_configs
  add column if not exists active_version_id uuid;

alter table agent_configs
  add constraint fk_agent_configs_active_version
  foreign key (active_version_id) references agent_config_versions(id)
  on delete set null;

create table if not exists tool_registry (
  id uuid primary key default gen_random_uuid(),
  tool_key text not null unique,
  provider text not null check (provider in ('native', 'mcp')),
  status text not null default 'enabled' check (status in ('enabled', 'disabled')),
  agent_types_allowed text[] not null default '{}',
  mcp_server_name text,
  mcp_tool_name text,
  validation jsonb default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists mcp_servers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  status text not null default 'disabled' check (status in ('enabled', 'disabled')),
  endpoint text,
  auth_config jsonb default '{}',
  metadata jsonb default '{}',
  last_health_check_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table pipeline_runs
  add column if not exists config_version_id uuid references agent_config_versions(id) on delete set null;

insert into agent_config_versions (
  agent_config_id,
  version,
  name,
  type,
  system_prompt,
  model,
  temperature,
  max_tokens,
  tools_enabled,
  tool_configs,
  prompt_vars,
  change_note
)
select
  ac.id,
  1,
  ac.name,
  ac.type,
  ac.system_prompt,
  ac.model,
  ac.temperature,
  ac.max_tokens,
  ac.tools_enabled,
  ac.tool_configs,
  ac.prompt_vars,
  'Initial snapshot from agent_configs'
from agent_configs ac
where not exists (
  select 1
  from agent_config_versions v
  where v.agent_config_id = ac.id
);

update agent_configs ac
set active_version_id = v.id
from agent_config_versions v
where v.agent_config_id = ac.id
  and v.version = (
    select max(v2.version)
    from agent_config_versions v2
    where v2.agent_config_id = ac.id
  )
  and (ac.active_version_id is null or ac.active_version_id <> v.id);

insert into tool_registry (tool_key, provider, status, agent_types_allowed)
values
  ('exa.search', 'native', 'enabled', array['lead_gen', 'people_gen', 'cold_email']),
  ('exa.find_similar', 'native', 'enabled', array['lead_gen']),
  ('exa.search_contents', 'native', 'enabled', array['enrichment']),
  ('clado.search_people', 'native', 'enabled', array['people_gen']),
  ('clado.deep_research', 'native', 'enabled', array['people_gen']),
  ('clado.get_profile', 'native', 'enabled', array['enrichment']),
  ('clado.enrich_contact', 'native', 'enabled', array['enrichment']),
  ('gmail.send', 'native', 'enabled', array['cold_email', 'followup']),
  ('gmail.read', 'native', 'enabled', array['followup']),
  ('slack.notify', 'native', 'enabled', array['followup'])
on conflict (tool_key) do nothing;

create index if not exists idx_agent_config_versions_agent_config_id
  on agent_config_versions(agent_config_id, version desc);

create index if not exists idx_tool_registry_status_provider
  on tool_registry(status, provider);
