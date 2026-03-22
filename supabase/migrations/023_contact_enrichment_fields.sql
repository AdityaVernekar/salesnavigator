-- Add structured enrichment fields to contacts for template variable replacement
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS industry text;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS website text;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS product text;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS pain_point text;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS company_size text;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS location text;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS role_summary text;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS recent_activity text;
