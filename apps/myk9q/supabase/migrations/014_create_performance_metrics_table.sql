-- Performance Metrics Table
-- Stores performance and analytics data from user sessions
-- Only created when admin enables Performance Monitoring in settings

CREATE TABLE IF NOT EXISTS performance_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  license_key TEXT NOT NULL,
  session_id TEXT NOT NULL,
  user_role TEXT, -- admin, judge, steward, exhibitor

  -- Metric classification
  metric_type TEXT NOT NULL, -- 'web_vital', 'navigation', 'resource', 'action', 'error', 'rage'
  metric_name TEXT NOT NULL, -- e.g., 'web_vital.fcp', 'action.check_in.success'
  metric_value FLOAT NOT NULL,
  metric_unit TEXT, -- 'ms', 'score', 'count'

  -- Device information
  device_type TEXT, -- phone, tablet, desktop
  os_type TEXT, -- Windows, MacOS, Linux, Android, iOS
  browser_type TEXT, -- Chrome, Safari, Firefox, Edge
  device_memory INTEGER, -- GB
  hardware_concurrency INTEGER, -- CPU cores
  network_type TEXT, -- 4g, 3g, wifi, unknown

  -- Context information
  page_url TEXT,
  action_name TEXT, -- e.g., 'save_entry', 'check_in'
  success BOOLEAN, -- for action metrics
  error_message TEXT, -- if error occurred

  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,

  -- Timestamps
  event_timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),

  -- Indexes for efficient querying
  CONSTRAINT fk_license_key FOREIGN KEY (license_key) REFERENCES shows(license_key) ON DELETE CASCADE
);

-- Create indexes for efficient querying
CREATE INDEX idx_performance_metrics_license_key ON performance_metrics(license_key);
CREATE INDEX idx_performance_metrics_session_id ON performance_metrics(session_id);
CREATE INDEX idx_performance_metrics_created_at ON performance_metrics(created_at DESC);
CREATE INDEX idx_performance_metrics_metric_type ON performance_metrics(metric_type);
CREATE INDEX idx_performance_metrics_action ON performance_metrics(action_name) WHERE action_name IS NOT NULL;
CREATE INDEX idx_performance_metrics_error ON performance_metrics(error_message) WHERE error_message IS NOT NULL;
CREATE INDEX idx_performance_metrics_timestamp ON performance_metrics(event_timestamp DESC);

-- Composite index for common queries
CREATE INDEX idx_performance_metrics_license_time ON performance_metrics(license_key, event_timestamp DESC);

-- Performance Session Summaries Table
-- Aggregated data per session for faster queries
CREATE TABLE IF NOT EXISTS performance_session_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  license_key TEXT NOT NULL,
  session_id TEXT NOT NULL UNIQUE,

  -- Session info
  start_time TIMESTAMP WITH TIME ZONE NOT NULL,
  end_time TIMESTAMP WITH TIME ZONE,
  duration_ms INTEGER, -- milliseconds

  -- User info
  user_role TEXT,
  device_type TEXT,
  os_type TEXT,
  browser_type TEXT,

  -- Aggregated metrics
  total_events INTEGER,
  error_count INTEGER,
  warning_count INTEGER,
  rage_pattern_count INTEGER,

  -- Web Vitals (if available)
  fcp_ms FLOAT,
  lcp_ms FLOAT,
  cls_score FLOAT,
  fid_ms FLOAT,
  inp_ms FLOAT,

  -- Performance summary
  slow_actions_count INTEGER,
  failed_actions_count INTEGER,
  sync_conflicts INTEGER,
  offline_events INTEGER,

  -- Raw report JSON (for detail view)
  full_report JSONB,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),

  CONSTRAINT fk_session_license_key FOREIGN KEY (license_key) REFERENCES shows(license_key) ON DELETE CASCADE
);

-- Create indexes for session summaries
CREATE INDEX idx_session_summaries_license_key ON performance_session_summaries(license_key);
CREATE INDEX idx_session_summaries_created_at ON performance_session_summaries(created_at DESC);
CREATE INDEX idx_session_summaries_error_count ON performance_session_summaries(error_count DESC) WHERE error_count > 0;
CREATE INDEX idx_session_summaries_license_time ON performance_session_summaries(license_key, created_at DESC);

-- Enable RLS (Row Level Security)
ALTER TABLE performance_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE performance_session_summaries ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only see metrics for their show
CREATE POLICY performance_metrics_select_own_show ON performance_metrics
  FOR SELECT
  USING (
    license_key IN (
      SELECT license_key FROM shows
      WHERE license_key = current_setting('app.license_key', true)
    )
  );

CREATE POLICY performance_metrics_insert_own_show ON performance_metrics
  FOR INSERT
  WITH CHECK (
    license_key IN (
      SELECT license_key FROM shows
      WHERE license_key = current_setting('app.license_key', true)
    )
  );

CREATE POLICY session_summaries_select_own_show ON performance_session_summaries
  FOR SELECT
  USING (
    license_key IN (
      SELECT license_key FROM shows
      WHERE license_key = current_setting('app.license_key', true)
    )
  );

CREATE POLICY session_summaries_insert_own_show ON performance_session_summaries
  FOR INSERT
  WITH CHECK (
    license_key IN (
      SELECT license_key FROM shows
      WHERE license_key = current_setting('app.license_key', true)
    )
  );

-- Grant permissions to anon key (for API inserts)
GRANT SELECT, INSERT ON performance_metrics TO anon;
GRANT SELECT, INSERT ON performance_session_summaries TO anon;

-- Optional: Create a view for common queries
CREATE OR REPLACE VIEW performance_metrics_today AS
SELECT
  license_key,
  metric_type,
  COUNT(*) as count,
  AVG(metric_value) as avg_value,
  MIN(metric_value) as min_value,
  MAX(metric_value) as max_value,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY metric_value) as p95_value
FROM performance_metrics
WHERE created_at >= NOW() - INTERVAL '24 hours'
GROUP BY license_key, metric_type;

-- Create function to auto-create session summary
CREATE OR REPLACE FUNCTION create_session_summary()
RETURNS TRIGGER AS $$
BEGIN
  -- This will be called when a session ends (via API)
  -- Updates or creates session summary
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
