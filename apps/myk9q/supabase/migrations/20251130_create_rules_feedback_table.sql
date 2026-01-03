-- Create table to log Rules Assistant feedback reports
-- Allows users to report incorrect AI answers without manual email

CREATE TABLE IF NOT EXISTS rules_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question TEXT NOT NULL,
  ai_response TEXT NOT NULL,
  show_id BIGINT REFERENCES shows(id) ON DELETE SET NULL,
  license_key TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Index for querying by show or date
CREATE INDEX idx_rules_feedback_created_at ON rules_feedback(created_at DESC);
CREATE INDEX idx_rules_feedback_show_id ON rules_feedback(show_id);

-- Enable RLS
ALTER TABLE rules_feedback ENABLE ROW LEVEL SECURITY;

-- Allow anyone to insert feedback (anonymous users can report issues)
CREATE POLICY "Anyone can insert rules feedback"
  ON rules_feedback
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Only authenticated users (admins) can view feedback
CREATE POLICY "Admins can view rules feedback"
  ON rules_feedback
  FOR SELECT
  TO authenticated
  USING (true);

-- Add comment
COMMENT ON TABLE rules_feedback IS 'Stores user-reported issues with Rules Assistant AI responses for review and improvement';

SELECT 'Successfully created rules_feedback table' as status;
