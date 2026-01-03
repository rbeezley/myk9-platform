-- Create chatbot_query_log table for AskQ AI usage analytics
-- This logs all chatbot queries to track feature usage and improve the AI
-- License key is stored for analytics grouping (not user identification)

CREATE TABLE IF NOT EXISTS chatbot_query_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  query TEXT NOT NULL,
  tools_used TEXT[] DEFAULT '{}',
  license_key TEXT,
  organization_code TEXT,
  sport_code TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for time-based analytics queries
CREATE INDEX IF NOT EXISTS idx_chatbot_query_log_created_at
  ON chatbot_query_log (created_at DESC);

-- Index for filtering by license key (show-level analytics)
CREATE INDEX IF NOT EXISTS idx_chatbot_query_log_license_key
  ON chatbot_query_log (license_key)
  WHERE license_key IS NOT NULL;

-- Index for filtering by organization
CREATE INDEX IF NOT EXISTS idx_chatbot_query_log_org
  ON chatbot_query_log (organization_code)
  WHERE organization_code IS NOT NULL;

-- Grant access to service role (Edge Functions use service role)
GRANT INSERT ON chatbot_query_log TO service_role;
GRANT SELECT ON chatbot_query_log TO service_role;

-- RLS: Allow authenticated users to read their own show's queries (for admin analytics)
ALTER TABLE chatbot_query_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow service role full access" ON chatbot_query_log
  FOR ALL TO service_role USING (true);

-- Comment for documentation
COMMENT ON TABLE chatbot_query_log IS 'Usage log for AskQ AI chatbot queries. Used for analytics and improving the AI assistant.';
