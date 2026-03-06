-- Create judge_qualifications table and add judge_number to people
-- The judge_qualifications table was referenced by judgeQueries.ts but never created.
-- Also adds judge_number column to people table for top-level judge identification.

-- =============================================================================
-- JUDGE QUALIFICATIONS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS judge_qualifications (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  person_id UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  organization TEXT NOT NULL,
  qualification_level TEXT NOT NULL,
  disciplines TEXT[] DEFAULT '{}',
  date_obtained DATE,
  expiration_date DATE,
  approval_number TEXT,
  approved_by TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  suspension_date DATE,
  suspension_reason TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS judge_qualifications_person_id_idx ON judge_qualifications(person_id);
CREATE INDEX IF NOT EXISTS judge_qualifications_org_idx ON judge_qualifications(organization);

-- =============================================================================
-- JUDGE NUMBER ON PEOPLE TABLE
-- =============================================================================

ALTER TABLE people ADD COLUMN IF NOT EXISTS judge_number TEXT;
CREATE INDEX IF NOT EXISTS people_judge_number_idx ON people(judge_number);

-- =============================================================================
-- RLS POLICIES FOR JUDGE QUALIFICATIONS
-- =============================================================================

ALTER TABLE judge_qualifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE judge_qualifications FORCE ROW LEVEL SECURITY;

-- Read: any authenticated user
CREATE POLICY judge_qualifications_select ON judge_qualifications
  FOR SELECT TO authenticated
  USING (true);

-- Insert: secretary or platform_admin (using has_role to avoid function ambiguity)
CREATE POLICY judge_qualifications_insert ON judge_qualifications
  FOR INSERT TO authenticated
  WITH CHECK (
    has_role('trial_secretary') OR has_role('show_secretary') OR has_role('platform_admin')
  );

-- Update: secretary or platform_admin
CREATE POLICY judge_qualifications_update ON judge_qualifications
  FOR UPDATE TO authenticated
  USING (
    has_role('trial_secretary') OR has_role('show_secretary') OR has_role('platform_admin')
  );

-- Delete: platform_admin only
CREATE POLICY judge_qualifications_delete ON judge_qualifications
  FOR DELETE TO authenticated
  USING (has_role('platform_admin'));
