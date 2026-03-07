create table if not exists waitlist (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  is_allowed boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint waitlist_email_lowercase check (email = lower(email))
);

create unique index if not exists idx_waitlist_email_unique on waitlist(email);
