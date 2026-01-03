-- Create rules_query_log table for anonymous usage analytics
-- This logs all Rules Assistant queries to track feature usage
-- No personal data is stored - queries are completely anonymous

CREATE TABLE IF NOT EXISTS rules_query_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  query TEXT NOT NULL,
  results_count INTEGER,
  answer_generated BOOLEAN DEFAULT false,
  organization_code TEXT,
  sport_code TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for time-based analytics queries
CREATE INDEX IF NOT EXISTS idx_rules_query_log_created_at
  ON rules_query_log (created_at DESC);

-- Index for filtering by organization
CREATE INDEX IF NOT EXISTS idx_rules_query_log_org
  ON rules_query_log (organization_code)
  WHERE organization_code IS NOT NULL;

-- Grant access to service role (Edge Functions use service role)
GRANT INSERT ON rules_query_log TO service_role;
GRANT SELECT ON rules_query_log TO service_role;

-- Comment for documentation
COMMENT ON TABLE rules_query_log IS 'Anonymous usage log for Rules Assistant queries. Used for analytics only - no user identifiers stored.';
