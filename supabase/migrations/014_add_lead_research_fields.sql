alter table leads
  add column if not exists company_description text,
  add column if not exists fit_reasoning text,
  add column if not exists researched_at timestamptz;
