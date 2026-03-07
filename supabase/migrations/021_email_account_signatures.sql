alter table email_accounts
  add column if not exists signature_html text;

alter table email_accounts
  add column if not exists signature_enabled_by_default boolean not null default true;
