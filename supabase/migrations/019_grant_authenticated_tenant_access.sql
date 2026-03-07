grant usage on schema public to authenticated;

grant execute on function public.is_company_member(uuid) to authenticated;

grant select, insert, update, delete on table public.companies to authenticated;
grant select, insert, update, delete on table public.company_users to authenticated;
grant select, insert, update, delete on table public.campaigns to authenticated;
grant select, insert, update, delete on table public.leads to authenticated;
grant select, insert, update, delete on table public.contacts to authenticated;
grant select, insert, update, delete on table public.icp_scores to authenticated;
grant select, insert, update, delete on table public.pipeline_runs to authenticated;
grant select, insert, update, delete on table public.run_logs to authenticated;
grant select, insert, update, delete on table public.email_accounts to authenticated;
grant select, insert, update, delete on table public.enrollments to authenticated;
grant select, insert, update, delete on table public.emails_sent to authenticated;
grant select, insert, update, delete on table public.suppressions to authenticated;
grant select, insert, update, delete on table public.stage_jobs to authenticated;
grant select, insert, update, delete on table public.send_jobs to authenticated;
grant select, insert, update, delete on table public.email_templates to authenticated;
grant select, insert, update, delete on table public.email_template_versions to authenticated;
grant select, insert, update, delete on table public.template_generation_sessions to authenticated;
grant select, insert, update, delete on table public.template_generation_messages to authenticated;
grant select, insert, update, delete on table public.email_template_experiments to authenticated;
grant select, insert, update, delete on table public.email_template_variants to authenticated;
grant select, insert, update, delete on table public.email_variant_events to authenticated;
grant select, insert, update, delete on table public.agent_configs to authenticated;
grant select, insert, update, delete on table public.agent_config_versions to authenticated;
grant select, insert, update, delete on table public.tool_registry to authenticated;
grant select, insert, update, delete on table public.mcp_servers to authenticated;
