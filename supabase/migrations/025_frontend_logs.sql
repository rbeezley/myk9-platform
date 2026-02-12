-- Frontend Logs Table
-- Stores structured log entries sent from the myk9show frontend via RemoteTransport.
-- Used for production error visibility, debugging, and monitoring.

CREATE TABLE IF NOT EXISTS public.frontend_logs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  level smallint NOT NULL,           -- 0=DEBUG, 1=INFO, 2=WARN, 3=ERROR, 4=FATAL
  message text NOT NULL,
  category text NOT NULL DEFAULT 'general',
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  session_id text,
  fingerprint text,
  stack text,
  metadata jsonb,
  source text NOT NULL DEFAULT 'frontend',  -- 'frontend', 'myk9show', 'myk9q'
  user_agent text,
  page_url text
);

-- Index for querying by severity (most common: find errors/fatals)
CREATE INDEX idx_frontend_logs_level ON public.frontend_logs (level) WHERE level >= 3;

-- Index for querying by time range
CREATE INDEX idx_frontend_logs_created_at ON public.frontend_logs (created_at DESC);

-- Index for querying by category
CREATE INDEX idx_frontend_logs_category ON public.frontend_logs (category);

-- Index for querying by user
CREATE INDEX idx_frontend_logs_user_id ON public.frontend_logs (user_id) WHERE user_id IS NOT NULL;

-- Index for fingerprint-based deduplication/grouping
CREATE INDEX idx_frontend_logs_fingerprint ON public.frontend_logs (fingerprint);

-- Enable RLS
ALTER TABLE public.frontend_logs ENABLE ROW LEVEL SECURITY;

-- Only the service role can insert (edge function uses service role key)
-- No select policy for regular users — logs are admin-only via service role or SQL editor
CREATE POLICY "Service role can insert logs"
  ON public.frontend_logs
  FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role can read logs"
  ON public.frontend_logs
  FOR SELECT
  TO service_role
  USING (true);

-- Auto-cleanup: delete logs older than 30 days (run via pg_cron or manual cleanup)
-- This is a comment-only reminder; enable pg_cron separately if desired:
-- SELECT cron.schedule('cleanup-frontend-logs', '0 3 * * *',
--   $$DELETE FROM public.frontend_logs WHERE created_at < now() - interval '30 days'$$
-- );

COMMENT ON TABLE public.frontend_logs IS 'Structured frontend log entries from production apps. Auto-populated by receive-logs edge function.';
