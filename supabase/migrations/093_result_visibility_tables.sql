-- Migration 093: Result visibility cascade tables + self check-in

-- =============================================================================
-- SHOW-LEVEL DEFAULTS
-- =============================================================================
CREATE TABLE IF NOT EXISTS show_result_visibility_defaults (
  show_id UUID PRIMARY KEY REFERENCES shows(id) ON DELETE CASCADE,
  preset_name TEXT NOT NULL DEFAULT 'open'
    CHECK (preset_name IN ('open', 'standard', 'review')),
  placement_timing TEXT NOT NULL DEFAULT 'class_complete'
    CHECK (placement_timing IN ('class_complete', 'manual_release')),
  qualification_timing TEXT NOT NULL DEFAULT 'immediate'
    CHECK (qualification_timing IN ('immediate', 'class_complete', 'manual_release')),
  time_timing TEXT NOT NULL DEFAULT 'immediate'
    CHECK (time_timing IN ('immediate', 'class_complete', 'manual_release')),
  faults_timing TEXT NOT NULL DEFAULT 'immediate'
    CHECK (faults_timing IN ('immediate', 'class_complete', 'manual_release')),
  self_checkin_enabled BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);

-- =============================================================================
-- TRIAL-LEVEL OVERRIDES (nullable = inherit from show)
-- =============================================================================
CREATE TABLE IF NOT EXISTS trial_result_visibility_overrides (
  trial_id UUID PRIMARY KEY REFERENCES trials(id) ON DELETE CASCADE,
  preset_name TEXT CHECK (preset_name IN ('open', 'standard', 'review')),
  placement_timing TEXT CHECK (placement_timing IN ('class_complete', 'manual_release')),
  qualification_timing TEXT CHECK (qualification_timing IN ('immediate', 'class_complete', 'manual_release')),
  time_timing TEXT CHECK (time_timing IN ('immediate', 'class_complete', 'manual_release')),
  faults_timing TEXT CHECK (faults_timing IN ('immediate', 'class_complete', 'manual_release')),
  self_checkin_enabled BOOLEAN,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);

-- =============================================================================
-- CLASS-LEVEL OVERRIDES (nullable = inherit from trial → show)
-- =============================================================================
CREATE TABLE IF NOT EXISTS class_result_visibility_overrides (
  class_id UUID PRIMARY KEY REFERENCES classes(id) ON DELETE CASCADE,
  preset_name TEXT CHECK (preset_name IN ('open', 'standard', 'review')),
  placement_timing TEXT CHECK (placement_timing IN ('class_complete', 'manual_release')),
  qualification_timing TEXT CHECK (qualification_timing IN ('immediate', 'class_complete', 'manual_release')),
  time_timing TEXT CHECK (time_timing IN ('immediate', 'class_complete', 'manual_release')),
  faults_timing TEXT CHECK (faults_timing IN ('immediate', 'class_complete', 'manual_release')),
  self_checkin_enabled BOOLEAN,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);

-- =============================================================================
-- RLS POLICIES
-- =============================================================================

ALTER TABLE show_result_visibility_defaults ENABLE ROW LEVEL SECURITY;
ALTER TABLE show_result_visibility_defaults FORCE ROW LEVEL SECURITY;
ALTER TABLE trial_result_visibility_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE trial_result_visibility_overrides FORCE ROW LEVEL SECURITY;
ALTER TABLE class_result_visibility_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_result_visibility_overrides FORCE ROW LEVEL SECURITY;

-- SELECT: all authenticated users (exhibitors need to read settings)
CREATE POLICY "visibility_show_select" ON show_result_visibility_defaults
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "visibility_trial_select" ON trial_result_visibility_overrides
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "visibility_class_select" ON class_result_visibility_overrides
  FOR SELECT TO authenticated USING (true);

-- INSERT/UPDATE/DELETE: staff only (secretary, judge, site_admin)
CREATE POLICY "visibility_show_modify" ON show_result_visibility_defaults
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = auth.uid()
        AND ur.is_active = true
        AND r.name IN ('site_admin', 'secretary', 'judge')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = auth.uid()
        AND ur.is_active = true
        AND r.name IN ('site_admin', 'secretary', 'judge')
    )
  );

CREATE POLICY "visibility_trial_modify" ON trial_result_visibility_overrides
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = auth.uid()
        AND ur.is_active = true
        AND r.name IN ('site_admin', 'secretary', 'judge')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = auth.uid()
        AND ur.is_active = true
        AND r.name IN ('site_admin', 'secretary', 'judge')
    )
  );

CREATE POLICY "visibility_class_modify" ON class_result_visibility_overrides
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = auth.uid()
        AND ur.is_active = true
        AND r.name IN ('site_admin', 'secretary', 'judge')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = auth.uid()
        AND ur.is_active = true
        AND r.name IN ('site_admin', 'secretary', 'judge')
    )
  );

-- =============================================================================
-- UPDATED_AT TRIGGERS
-- =============================================================================
CREATE TRIGGER update_show_visibility_updated_at
  BEFORE UPDATE ON show_result_visibility_defaults
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_trial_visibility_updated_at
  BEFORE UPDATE ON trial_result_visibility_overrides
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_class_visibility_updated_at
  BEFORE UPDATE ON class_result_visibility_overrides
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
