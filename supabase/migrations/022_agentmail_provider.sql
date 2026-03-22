-- Add provider support to email_accounts for AgentMail integration
ALTER TABLE email_accounts
  ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'gmail_composio',
  ADD COLUMN IF NOT EXISTS agentmail_inbox_id TEXT;

-- Add provider tracking to emails_sent
ALTER TABLE emails_sent
  ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'gmail_composio',
  ADD COLUMN IF NOT EXISTS agentmail_message_id TEXT;

-- Delivery event tracking (bounces, complaints, deliveries)
CREATE TABLE IF NOT EXISTS email_delivery_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id),
  email_sent_id UUID REFERENCES emails_sent(id),
  event_type TEXT NOT NULL, -- delivered, bounced, complained, rejected
  inbox_id TEXT,            -- AgentMail inbox ID
  message_id TEXT,          -- AgentMail message ID
  thread_id TEXT,           -- AgentMail thread ID
  raw_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_delivery_events_email_sent
  ON email_delivery_events(email_sent_id);
CREATE INDEX IF NOT EXISTS idx_email_delivery_events_type
  ON email_delivery_events(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_delivery_events_company
  ON email_delivery_events(company_id, created_at DESC);

-- Index for fast lookup of AgentMail accounts
CREATE INDEX IF NOT EXISTS idx_email_accounts_provider
  ON email_accounts(provider) WHERE provider = 'agentmail';
CREATE INDEX IF NOT EXISTS idx_email_accounts_agentmail_inbox
  ON email_accounts(agentmail_inbox_id) WHERE agentmail_inbox_id IS NOT NULL;

-- Index for looking up emails_sent by agentmail_message_id
CREATE INDEX IF NOT EXISTS idx_emails_sent_agentmail_message
  ON emails_sent(agentmail_message_id) WHERE agentmail_message_id IS NOT NULL;

-- RLS for email_delivery_events
ALTER TABLE email_delivery_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_isolation_email_delivery_events"
  ON email_delivery_events
  FOR ALL
  USING (company_id IN (
    SELECT company_id FROM company_users WHERE user_id = auth.uid()
  ))
  WITH CHECK (company_id IN (
    SELECT company_id FROM company_users WHERE user_id = auth.uid()
  ));
