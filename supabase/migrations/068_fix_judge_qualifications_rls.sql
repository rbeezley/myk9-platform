-- Fix judge_qualifications RLS policies to use unified role names
-- Migration 066 unified roles: trial_secretary/show_secretary → secretary,
-- platform_admin → site_admin. The judge_qualifications policies still
-- reference the old role names.

-- Drop old policies
DROP POLICY IF EXISTS judge_qualifications_insert ON judge_qualifications;
DROP POLICY IF EXISTS judge_qualifications_update ON judge_qualifications;
DROP POLICY IF EXISTS judge_qualifications_delete ON judge_qualifications;

-- Recreate with unified role names
CREATE POLICY judge_qualifications_insert ON judge_qualifications
  FOR INSERT TO authenticated
  WITH CHECK (
    has_role('secretary') OR has_role('site_admin')
  );

CREATE POLICY judge_qualifications_update ON judge_qualifications
  FOR UPDATE TO authenticated
  USING (
    has_role('secretary') OR has_role('site_admin')
  );

CREATE POLICY judge_qualifications_delete ON judge_qualifications
  FOR DELETE TO authenticated
  USING (has_role('site_admin'));
