alter table emails_sent
  add column if not exists reply_from_email text;

alter table emails_sent
  add column if not exists reply_snippet text;

alter table emails_sent
  add column if not exists reply_message_id text;

alter table emails_sent
  add column if not exists last_reply_at timestamptz;

create index if not exists idx_emails_sent_gmail_thread_id
  on emails_sent(gmail_thread_id)
  where gmail_thread_id is not null;
