-- Migration 126: result_submissions table
--
-- Stores electronic result submission records for sanctioning organizations
-- (AKC, UKC, NACSW, etc.). Captures the generated XML payload for audit and
-- tracks submission status.

CREATE TABLE result_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  show_id UUID NOT NULL REFERENCES shows(id) ON DELETE CASCADE,
  trial_id UUID REFERENCES trials(id) ON DELETE CASCADE,
  organization TEXT NOT NULL,          -- 'AKC', 'UKC', 'NACSW', etc.
  sport_type TEXT NOT NULL,            -- 'scent_work', 'fast_cat', etc.
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  submitted_by UUID REFERENCES people(id),
  xml_payload TEXT,                    -- the generated XML (for audit)
  status TEXT NOT NULL DEFAULT 'pending'  -- 'pending' | 'sent' | 'failed'
);

-- RLS: secretary/admin can insert and select for their shows
ALTER TABLE result_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "secretary_admin_insert_result_submissions"
ON result_submissions FOR INSERT
TO authenticated
WITH CHECK (
  (SELECT is_trial_secretary()) OR (SELECT is_site_admin())
);

CREATE POLICY "secretary_admin_select_result_submissions"
ON result_submissions FOR SELECT
TO authenticated
USING (
  (SELECT is_trial_secretary()) OR (SELECT is_site_admin())
);
