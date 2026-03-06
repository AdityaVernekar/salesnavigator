insert into tool_registry (tool_key, provider, status, agent_types_allowed)
values
  ('clado.scrape_linkedin_profile', 'native', 'enabled', array['cold_email']),
  ('clado.get_post_reactions', 'native', 'enabled', array['cold_email'])
on conflict (tool_key) do update
set
  provider = excluded.provider,
  status = excluded.status,
  agent_types_allowed = (
    select array(
      select distinct unnest(coalesce(tool_registry.agent_types_allowed, '{}') || excluded.agent_types_allowed)
    )
  ),
  updated_at = now();
