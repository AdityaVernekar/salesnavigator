create table if not exists companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists company_users (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  unique(company_id, user_id)
);

create index if not exists idx_company_users_user_id on company_users(user_id);

insert into companies (name, slug)
values ('Default Company', 'default-company')
on conflict (slug) do nothing;

alter table campaigns add column if not exists company_id uuid references companies(id) on delete restrict;
alter table leads add column if not exists company_id uuid references companies(id) on delete restrict;
alter table contacts add column if not exists company_id uuid references companies(id) on delete restrict;
alter table icp_scores add column if not exists company_id uuid references companies(id) on delete restrict;
alter table pipeline_runs add column if not exists company_id uuid references companies(id) on delete restrict;
alter table run_logs add column if not exists company_id uuid references companies(id) on delete restrict;
alter table email_accounts add column if not exists company_id uuid references companies(id) on delete restrict;
alter table enrollments add column if not exists company_id uuid references companies(id) on delete restrict;
alter table emails_sent add column if not exists company_id uuid references companies(id) on delete restrict;
alter table suppressions add column if not exists company_id uuid references companies(id) on delete restrict;
alter table stage_jobs add column if not exists company_id uuid references companies(id) on delete restrict;
alter table send_jobs add column if not exists company_id uuid references companies(id) on delete restrict;
alter table email_templates add column if not exists company_id uuid references companies(id) on delete restrict;
alter table email_template_versions add column if not exists company_id uuid references companies(id) on delete restrict;
alter table template_generation_sessions add column if not exists company_id uuid references companies(id) on delete restrict;
alter table template_generation_messages add column if not exists company_id uuid references companies(id) on delete restrict;
alter table email_template_experiments add column if not exists company_id uuid references companies(id) on delete restrict;
alter table email_template_variants add column if not exists company_id uuid references companies(id) on delete restrict;
alter table email_variant_events add column if not exists company_id uuid references companies(id) on delete restrict;
alter table agent_configs add column if not exists company_id uuid references companies(id) on delete restrict;
alter table agent_config_versions add column if not exists company_id uuid references companies(id) on delete restrict;
alter table tool_registry add column if not exists company_id uuid references companies(id) on delete restrict;
alter table mcp_servers add column if not exists company_id uuid references companies(id) on delete restrict;

update campaigns
set company_id = (select id from companies where slug = 'default-company')
where company_id is null;

update leads l
set company_id = coalesce(
  l.company_id,
  (select c.company_id from campaigns c where c.id = l.campaign_id),
  (select id from companies where slug = 'default-company')
)
where l.company_id is null;

update contacts c
set company_id = coalesce(
  c.company_id,
  (select l.company_id from leads l where l.id = c.lead_id),
  (select ca.company_id from campaigns ca where ca.id = c.campaign_id),
  (select id from companies where slug = 'default-company')
)
where c.company_id is null;

update icp_scores s
set company_id = coalesce(
  s.company_id,
  (select c.company_id from contacts c where c.id = s.contact_id),
  (select ca.company_id from campaigns ca where ca.id = s.campaign_id),
  (select id from companies where slug = 'default-company')
)
where s.company_id is null;

update pipeline_runs r
set company_id = coalesce(
  r.company_id,
  (select c.company_id from campaigns c where c.id = r.campaign_id),
  (select id from companies where slug = 'default-company')
)
where r.company_id is null;

update run_logs l
set company_id = coalesce(
  l.company_id,
  (select r.company_id from pipeline_runs r where r.id = l.run_id),
  (select id from companies where slug = 'default-company')
)
where l.company_id is null;

update email_accounts
set company_id = (select id from companies where slug = 'default-company')
where company_id is null;

update enrollments e
set company_id = coalesce(
  e.company_id,
  (select c.company_id from campaigns c where c.id = e.campaign_id),
  (select ct.company_id from contacts ct where ct.id = e.contact_id),
  (select id from companies where slug = 'default-company')
)
where e.company_id is null;

update emails_sent e
set company_id = coalesce(
  e.company_id,
  (select en.company_id from enrollments en where en.id = e.enrollment_id),
  (select c.company_id from campaigns c where c.id = e.campaign_id),
  (select id from companies where slug = 'default-company')
)
where e.company_id is null;

update suppressions
set company_id = (select id from companies where slug = 'default-company')
where company_id is null;

update stage_jobs j
set company_id = coalesce(
  j.company_id,
  (select r.company_id from pipeline_runs r where r.id = j.run_id),
  (select c.company_id from campaigns c where c.id = j.campaign_id),
  (select id from companies where slug = 'default-company')
)
where j.company_id is null;

update send_jobs j
set company_id = coalesce(
  j.company_id,
  (select r.company_id from pipeline_runs r where r.id = j.run_id),
  (select c.company_id from campaigns c where c.id = j.campaign_id),
  (select id from companies where slug = 'default-company')
)
where j.company_id is null;

update email_templates
set company_id = (select id from companies where slug = 'default-company')
where company_id is null;

update email_template_versions v
set company_id = coalesce(
  v.company_id,
  (select t.company_id from email_templates t where t.id = v.template_id),
  (select id from companies where slug = 'default-company')
)
where v.company_id is null;

update template_generation_sessions s
set company_id = coalesce(
  s.company_id,
  (select t.company_id from email_templates t where t.id = s.template_id),
  (select id from companies where slug = 'default-company')
)
where s.company_id is null;

update template_generation_messages m
set company_id = coalesce(
  m.company_id,
  (select s.company_id from template_generation_sessions s where s.id = m.session_id),
  (select id from companies where slug = 'default-company')
)
where m.company_id is null;

update email_template_experiments e
set company_id = coalesce(
  e.company_id,
  (select c.company_id from campaigns c where c.id = e.campaign_id),
  (select t.company_id from email_templates t where t.id = e.template_id),
  (select id from companies where slug = 'default-company')
)
where e.company_id is null;

update email_template_variants v
set company_id = coalesce(
  v.company_id,
  (select e.company_id from email_template_experiments e where e.id = v.experiment_id),
  (select id from companies where slug = 'default-company')
)
where v.company_id is null;

update email_variant_events e
set company_id = coalesce(
  e.company_id,
  (select c.company_id from campaigns c where c.id = e.campaign_id),
  (select ct.company_id from contacts ct where ct.id = e.contact_id),
  (select id from companies where slug = 'default-company')
)
where e.company_id is null;

update agent_configs
set company_id = (select id from companies where slug = 'default-company')
where company_id is null;

update agent_config_versions v
set company_id = coalesce(
  v.company_id,
  (select c.company_id from agent_configs c where c.id = v.agent_config_id),
  (select id from companies where slug = 'default-company')
)
where v.company_id is null;

update tool_registry
set company_id = (select id from companies where slug = 'default-company')
where company_id is null;

update mcp_servers
set company_id = (select id from companies where slug = 'default-company')
where company_id is null;

alter table campaigns alter column company_id set not null;
alter table leads alter column company_id set not null;
alter table contacts alter column company_id set not null;
alter table icp_scores alter column company_id set not null;
alter table pipeline_runs alter column company_id set not null;
alter table run_logs alter column company_id set not null;
alter table email_accounts alter column company_id set not null;
alter table enrollments alter column company_id set not null;
alter table emails_sent alter column company_id set not null;
alter table suppressions alter column company_id set not null;
alter table stage_jobs alter column company_id set not null;
alter table send_jobs alter column company_id set not null;
alter table email_templates alter column company_id set not null;
alter table email_template_versions alter column company_id set not null;
alter table template_generation_sessions alter column company_id set not null;
alter table template_generation_messages alter column company_id set not null;
alter table email_template_experiments alter column company_id set not null;
alter table email_template_variants alter column company_id set not null;
alter table email_variant_events alter column company_id set not null;
alter table agent_configs alter column company_id set not null;
alter table agent_config_versions alter column company_id set not null;
alter table tool_registry alter column company_id set not null;
alter table mcp_servers alter column company_id set not null;

create index if not exists idx_campaigns_company_created on campaigns(company_id, created_at desc);
create index if not exists idx_leads_company_created on leads(company_id, created_at desc);
create index if not exists idx_contacts_company_created on contacts(company_id, created_at desc);
create index if not exists idx_scores_company_tier on icp_scores(company_id, tier);
create index if not exists idx_pipeline_runs_company_started on pipeline_runs(company_id, started_at desc);
create index if not exists idx_run_logs_company_ts on run_logs(company_id, ts desc);
create index if not exists idx_enrollments_company_status on enrollments(company_id, status);
create index if not exists idx_emails_sent_company_sent on emails_sent(company_id, sent_at desc);
create index if not exists idx_stage_jobs_company_status on stage_jobs(company_id, status, available_at asc);
create index if not exists idx_send_jobs_company_status on send_jobs(company_id, status, available_at asc);
create index if not exists idx_email_accounts_company_active on email_accounts(company_id, is_active);

create or replace function set_company_id_from_relations()
returns trigger as $$
begin
  if new.company_id is not null then
    return new;
  end if;

  if tg_table_name = 'leads' then
    select c.company_id into new.company_id from campaigns c where c.id = new.campaign_id;
  elsif tg_table_name = 'contacts' then
    select l.company_id into new.company_id from leads l where l.id = new.lead_id;
    if new.company_id is null then
      select c.company_id into new.company_id from campaigns c where c.id = new.campaign_id;
    end if;
  elsif tg_table_name = 'icp_scores' then
    select c.company_id into new.company_id from contacts c where c.id = new.contact_id;
    if new.company_id is null then
      select c2.company_id into new.company_id from campaigns c2 where c2.id = new.campaign_id;
    end if;
  elsif tg_table_name = 'pipeline_runs' then
    select c.company_id into new.company_id from campaigns c where c.id = new.campaign_id;
  elsif tg_table_name = 'run_logs' then
    select r.company_id into new.company_id from pipeline_runs r where r.id = new.run_id;
  elsif tg_table_name = 'enrollments' then
    select c.company_id into new.company_id from campaigns c where c.id = new.campaign_id;
    if new.company_id is null then
      select ct.company_id into new.company_id from contacts ct where ct.id = new.contact_id;
    end if;
  elsif tg_table_name = 'emails_sent' then
    select e.company_id into new.company_id from enrollments e where e.id = new.enrollment_id;
    if new.company_id is null then
      select c.company_id into new.company_id from campaigns c where c.id = new.campaign_id;
    end if;
  elsif tg_table_name = 'stage_jobs' then
    select r.company_id into new.company_id from pipeline_runs r where r.id = new.run_id;
    if new.company_id is null then
      select c.company_id into new.company_id from campaigns c where c.id = new.campaign_id;
    end if;
  elsif tg_table_name = 'send_jobs' then
    select r.company_id into new.company_id from pipeline_runs r where r.id = new.run_id;
    if new.company_id is null then
      select c.company_id into new.company_id from campaigns c where c.id = new.campaign_id;
    end if;
  elsif tg_table_name = 'email_template_versions' then
    select t.company_id into new.company_id from email_templates t where t.id = new.template_id;
  elsif tg_table_name = 'template_generation_sessions' then
    select t.company_id into new.company_id from email_templates t where t.id = new.template_id;
  elsif tg_table_name = 'template_generation_messages' then
    select s.company_id into new.company_id from template_generation_sessions s where s.id = new.session_id;
  elsif tg_table_name = 'email_template_experiments' then
    select c.company_id into new.company_id from campaigns c where c.id = new.campaign_id;
    if new.company_id is null then
      select t.company_id into new.company_id from email_templates t where t.id = new.template_id;
    end if;
  elsif tg_table_name = 'email_template_variants' then
    select e.company_id into new.company_id from email_template_experiments e where e.id = new.experiment_id;
  elsif tg_table_name = 'email_variant_events' then
    select c.company_id into new.company_id from campaigns c where c.id = new.campaign_id;
    if new.company_id is null then
      select ct.company_id into new.company_id from contacts ct where ct.id = new.contact_id;
    end if;
  elsif tg_table_name = 'agent_config_versions' then
    select c.company_id into new.company_id from agent_configs c where c.id = new.agent_config_id;
  end if;

  if new.company_id is null then
    select id into new.company_id from companies where slug = 'default-company';
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_set_company_id_leads on leads;
create trigger trg_set_company_id_leads before insert on leads
for each row execute function set_company_id_from_relations();

drop trigger if exists trg_set_company_id_contacts on contacts;
create trigger trg_set_company_id_contacts before insert on contacts
for each row execute function set_company_id_from_relations();

drop trigger if exists trg_set_company_id_scores on icp_scores;
create trigger trg_set_company_id_scores before insert on icp_scores
for each row execute function set_company_id_from_relations();

drop trigger if exists trg_set_company_id_runs on pipeline_runs;
create trigger trg_set_company_id_runs before insert on pipeline_runs
for each row execute function set_company_id_from_relations();

drop trigger if exists trg_set_company_id_logs on run_logs;
create trigger trg_set_company_id_logs before insert on run_logs
for each row execute function set_company_id_from_relations();

drop trigger if exists trg_set_company_id_enrollments on enrollments;
create trigger trg_set_company_id_enrollments before insert on enrollments
for each row execute function set_company_id_from_relations();

drop trigger if exists trg_set_company_id_emails_sent on emails_sent;
create trigger trg_set_company_id_emails_sent before insert on emails_sent
for each row execute function set_company_id_from_relations();

drop trigger if exists trg_set_company_id_stage_jobs on stage_jobs;
create trigger trg_set_company_id_stage_jobs before insert on stage_jobs
for each row execute function set_company_id_from_relations();

drop trigger if exists trg_set_company_id_send_jobs on send_jobs;
create trigger trg_set_company_id_send_jobs before insert on send_jobs
for each row execute function set_company_id_from_relations();

drop trigger if exists trg_set_company_id_template_versions on email_template_versions;
create trigger trg_set_company_id_template_versions before insert on email_template_versions
for each row execute function set_company_id_from_relations();

drop trigger if exists trg_set_company_id_template_sessions on template_generation_sessions;
create trigger trg_set_company_id_template_sessions before insert on template_generation_sessions
for each row execute function set_company_id_from_relations();

drop trigger if exists trg_set_company_id_template_messages on template_generation_messages;
create trigger trg_set_company_id_template_messages before insert on template_generation_messages
for each row execute function set_company_id_from_relations();

drop trigger if exists trg_set_company_id_template_experiments on email_template_experiments;
create trigger trg_set_company_id_template_experiments before insert on email_template_experiments
for each row execute function set_company_id_from_relations();

drop trigger if exists trg_set_company_id_template_variants on email_template_variants;
create trigger trg_set_company_id_template_variants before insert on email_template_variants
for each row execute function set_company_id_from_relations();

drop trigger if exists trg_set_company_id_variant_events on email_variant_events;
create trigger trg_set_company_id_variant_events before insert on email_variant_events
for each row execute function set_company_id_from_relations();

drop trigger if exists trg_set_company_id_agent_config_versions on agent_config_versions;
create trigger trg_set_company_id_agent_config_versions before insert on agent_config_versions
for each row execute function set_company_id_from_relations();
