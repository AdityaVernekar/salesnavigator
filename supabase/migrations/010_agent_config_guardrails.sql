alter table agent_configs
  add column if not exists guardrails jsonb default '{}'::jsonb;

alter table agent_config_versions
  add column if not exists guardrails jsonb default '{}'::jsonb;

update agent_config_versions v
set guardrails = coalesce(ac.guardrails, '{}'::jsonb)
from agent_configs ac
where v.agent_config_id = ac.id
  and (v.guardrails is null or v.guardrails = '{}'::jsonb);
