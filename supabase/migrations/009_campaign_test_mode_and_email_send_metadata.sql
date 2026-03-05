alter table campaigns
  add column if not exists test_mode_enabled boolean default false;

alter table campaigns
  add column if not exists test_recipient_emails text[] default '{}';

alter table emails_sent
  add column if not exists is_test_send boolean default false;

alter table emails_sent
  add column if not exists original_to_email text;

alter table emails_sent
  add column if not exists effective_to_emails text[] default '{}';

alter table emails_sent
  add column if not exists render_mode text default 'html';
