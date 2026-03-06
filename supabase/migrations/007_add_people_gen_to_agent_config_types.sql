alter table agent_configs
  drop constraint if exists agent_configs_type_check;

alter table agent_configs
  add constraint agent_configs_type_check
  check (type in ('lead_gen','people_gen','enrichment','scoring','cold_email','followup'));

alter table agent_config_versions
  drop constraint if exists agent_config_versions_type_check;

alter table agent_config_versions
  add constraint agent_config_versions_type_check
  check (type in ('lead_gen','people_gen','enrichment','scoring','cold_email','followup'));
