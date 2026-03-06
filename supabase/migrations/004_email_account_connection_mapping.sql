alter table email_accounts
  add column if not exists composio_connected_account_id text;

alter table email_accounts
  add column if not exists connection_status text
  default 'pending'
  check (connection_status in ('pending', 'connected', 'failed', 'revoked'));

alter table email_accounts
  add column if not exists last_connected_at timestamptz;

create unique index if not exists idx_email_accounts_composio_connected_account_id
  on email_accounts(composio_connected_account_id)
  where composio_connected_account_id is not null;
