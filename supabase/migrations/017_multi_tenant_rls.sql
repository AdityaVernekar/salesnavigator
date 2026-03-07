create or replace function is_company_member(target_company_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from company_users cu
    where cu.company_id = target_company_id
      and cu.user_id = auth.uid()
  );
$$;

alter table companies enable row level security;
alter table company_users enable row level security;
alter table campaigns enable row level security;
alter table leads enable row level security;
alter table contacts enable row level security;
alter table icp_scores enable row level security;
alter table pipeline_runs enable row level security;
alter table run_logs enable row level security;
alter table email_accounts enable row level security;
alter table enrollments enable row level security;
alter table emails_sent enable row level security;
alter table suppressions enable row level security;
alter table stage_jobs enable row level security;
alter table send_jobs enable row level security;
alter table email_templates enable row level security;
alter table email_template_versions enable row level security;
alter table template_generation_sessions enable row level security;
alter table template_generation_messages enable row level security;
alter table email_template_experiments enable row level security;
alter table email_template_variants enable row level security;
alter table email_variant_events enable row level security;
alter table agent_configs enable row level security;
alter table agent_config_versions enable row level security;
alter table tool_registry enable row level security;
alter table mcp_servers enable row level security;

drop policy if exists "companies_select_member" on companies;
create policy "companies_select_member" on companies
for select using (is_company_member(id));

drop policy if exists "company_users_select_self_or_company_admin" on company_users;
create policy "company_users_select_self_or_company_admin" on company_users
for select using (
  user_id = auth.uid()
  or exists (
    select 1
    from company_users me
    where me.company_id = company_users.company_id
      and me.user_id = auth.uid()
      and me.role in ('owner', 'admin')
  )
);

drop policy if exists "company_users_manage_company_admin" on company_users;
create policy "company_users_manage_company_admin" on company_users
for all using (
  exists (
    select 1
    from company_users me
    where me.company_id = company_users.company_id
      and me.user_id = auth.uid()
      and me.role in ('owner', 'admin')
  )
)
with check (
  exists (
    select 1
    from company_users me
    where me.company_id = company_users.company_id
      and me.user_id = auth.uid()
      and me.role in ('owner', 'admin')
  )
);

drop policy if exists "tenant_isolation_campaigns" on campaigns;
create policy "tenant_isolation_campaigns" on campaigns
for all using (is_company_member(company_id))
with check (is_company_member(company_id));

drop policy if exists "tenant_isolation_leads" on leads;
create policy "tenant_isolation_leads" on leads
for all using (is_company_member(company_id))
with check (is_company_member(company_id));

drop policy if exists "tenant_isolation_contacts" on contacts;
create policy "tenant_isolation_contacts" on contacts
for all using (is_company_member(company_id))
with check (is_company_member(company_id));

drop policy if exists "tenant_isolation_icp_scores" on icp_scores;
create policy "tenant_isolation_icp_scores" on icp_scores
for all using (is_company_member(company_id))
with check (is_company_member(company_id));

drop policy if exists "tenant_isolation_pipeline_runs" on pipeline_runs;
create policy "tenant_isolation_pipeline_runs" on pipeline_runs
for all using (is_company_member(company_id))
with check (is_company_member(company_id));

drop policy if exists "tenant_isolation_run_logs" on run_logs;
create policy "tenant_isolation_run_logs" on run_logs
for all using (is_company_member(company_id))
with check (is_company_member(company_id));

drop policy if exists "tenant_isolation_email_accounts" on email_accounts;
create policy "tenant_isolation_email_accounts" on email_accounts
for all using (is_company_member(company_id))
with check (is_company_member(company_id));

drop policy if exists "tenant_isolation_enrollments" on enrollments;
create policy "tenant_isolation_enrollments" on enrollments
for all using (is_company_member(company_id))
with check (is_company_member(company_id));

drop policy if exists "tenant_isolation_emails_sent" on emails_sent;
create policy "tenant_isolation_emails_sent" on emails_sent
for all using (is_company_member(company_id))
with check (is_company_member(company_id));

drop policy if exists "tenant_isolation_suppressions" on suppressions;
create policy "tenant_isolation_suppressions" on suppressions
for all using (is_company_member(company_id))
with check (is_company_member(company_id));

drop policy if exists "tenant_isolation_stage_jobs" on stage_jobs;
create policy "tenant_isolation_stage_jobs" on stage_jobs
for all using (is_company_member(company_id))
with check (is_company_member(company_id));

drop policy if exists "tenant_isolation_send_jobs" on send_jobs;
create policy "tenant_isolation_send_jobs" on send_jobs
for all using (is_company_member(company_id))
with check (is_company_member(company_id));

drop policy if exists "tenant_isolation_email_templates" on email_templates;
create policy "tenant_isolation_email_templates" on email_templates
for all using (is_company_member(company_id))
with check (is_company_member(company_id));

drop policy if exists "tenant_isolation_email_template_versions" on email_template_versions;
create policy "tenant_isolation_email_template_versions" on email_template_versions
for all using (is_company_member(company_id))
with check (is_company_member(company_id));

drop policy if exists "tenant_isolation_template_generation_sessions" on template_generation_sessions;
create policy "tenant_isolation_template_generation_sessions" on template_generation_sessions
for all using (is_company_member(company_id))
with check (is_company_member(company_id));

drop policy if exists "tenant_isolation_template_generation_messages" on template_generation_messages;
create policy "tenant_isolation_template_generation_messages" on template_generation_messages
for all using (is_company_member(company_id))
with check (is_company_member(company_id));

drop policy if exists "tenant_isolation_email_template_experiments" on email_template_experiments;
create policy "tenant_isolation_email_template_experiments" on email_template_experiments
for all using (is_company_member(company_id))
with check (is_company_member(company_id));

drop policy if exists "tenant_isolation_email_template_variants" on email_template_variants;
create policy "tenant_isolation_email_template_variants" on email_template_variants
for all using (is_company_member(company_id))
with check (is_company_member(company_id));

drop policy if exists "tenant_isolation_email_variant_events" on email_variant_events;
create policy "tenant_isolation_email_variant_events" on email_variant_events
for all using (is_company_member(company_id))
with check (is_company_member(company_id));

drop policy if exists "tenant_isolation_agent_configs" on agent_configs;
create policy "tenant_isolation_agent_configs" on agent_configs
for all using (is_company_member(company_id))
with check (is_company_member(company_id));

drop policy if exists "tenant_isolation_agent_config_versions" on agent_config_versions;
create policy "tenant_isolation_agent_config_versions" on agent_config_versions
for all using (is_company_member(company_id))
with check (is_company_member(company_id));

drop policy if exists "tenant_isolation_tool_registry" on tool_registry;
create policy "tenant_isolation_tool_registry" on tool_registry
for all using (is_company_member(company_id))
with check (is_company_member(company_id));

drop policy if exists "tenant_isolation_mcp_servers" on mcp_servers;
create policy "tenant_isolation_mcp_servers" on mcp_servers
for all using (is_company_member(company_id))
with check (is_company_member(company_id));
