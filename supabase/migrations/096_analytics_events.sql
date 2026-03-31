-- 096_analytics_events.sql
-- Lightweight analytics event tracking for section usage

CREATE TABLE IF NOT EXISTS analytics_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  section_name text NOT NULL,
  page text NOT NULL,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index for "which sections are popular" queries
CREATE INDEX idx_analytics_events_section_created
  ON analytics_events (section_name, created_at);

-- RLS: append-only for authenticated users, read-only for admins
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert their own events"
  ON analytics_events FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can read all events"
  ON analytics_events FOR SELECT
  TO authenticated
  USING ((SELECT is_platform_admin()));
