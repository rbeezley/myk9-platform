-- 060_show_settings.sql
-- Results visibility + self check-in settings with show → trial → class cascade

-- ============================================================
-- Show-level visibility settings (one row per show)
-- ============================================================
CREATE TABLE IF NOT EXISTS show_visibility_settings (
  show_id UUID PRIMARY KEY REFERENCES shows(id) ON DELETE CASCADE,
  preset TEXT NOT NULL DEFAULT 'standard'
    CHECK (preset IN ('open', 'standard', 'review')),
  placement_timing TEXT NOT NULL DEFAULT 'class_complete'
    CHECK (placement_timing IN ('class_complete', 'manual_release')),
  qualification_timing TEXT NOT NULL DEFAULT 'immediate'
    CHECK (qualification_timing IN ('immediate', 'class_complete', 'manual_release')),
  time_timing TEXT NOT NULL DEFAULT 'class_complete'
    CHECK (time_timing IN ('immediate', 'class_complete', 'manual_release')),
  faults_timing TEXT NOT NULL DEFAULT 'class_complete'
    CHECK (faults_timing IN ('immediate', 'class_complete', 'manual_release')),
  self_checkin_enabled BOOLEAN NOT NULL DEFAULT true,
  updated_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- Trial-level overrides (nullable = inherit from show)
-- ============================================================
CREATE TABLE IF NOT EXISTS trial_visibility_overrides (
  trial_id UUID PRIMARY KEY REFERENCES trials(id) ON DELETE CASCADE,
  preset TEXT
    CHECK (preset IS NULL OR preset IN ('open', 'standard', 'review')),
  placement_timing TEXT
    CHECK (placement_timing IS NULL OR placement_timing IN ('class_complete', 'manual_release')),
  qualification_timing TEXT
    CHECK (qualification_timing IS NULL OR qualification_timing IN ('immediate', 'class_complete', 'manual_release')),
  time_timing TEXT
    CHECK (time_timing IS NULL OR time_timing IN ('immediate', 'class_complete', 'manual_release')),
  faults_timing TEXT
    CHECK (faults_timing IS NULL OR faults_timing IN ('immediate', 'class_complete', 'manual_release')),
  self_checkin_enabled BOOLEAN,
  updated_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- Class-level overrides (nullable = inherit from trial/show)
-- ============================================================
CREATE TABLE IF NOT EXISTS class_visibility_overrides (
  class_id UUID PRIMARY KEY REFERENCES classes(id) ON DELETE CASCADE,
  preset TEXT
    CHECK (preset IS NULL OR preset IN ('open', 'standard', 'review')),
  placement_timing TEXT
    CHECK (placement_timing IS NULL OR placement_timing IN ('class_complete', 'manual_release')),
  qualification_timing TEXT
    CHECK (qualification_timing IS NULL OR qualification_timing IN ('immediate', 'class_complete', 'manual_release')),
  time_timing TEXT
    CHECK (time_timing IS NULL OR time_timing IN ('immediate', 'class_complete', 'manual_release')),
  faults_timing TEXT
    CHECK (faults_timing IS NULL OR faults_timing IN ('immediate', 'class_complete', 'manual_release')),
  self_checkin_enabled BOOLEAN,
  updated_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- RLS Policies
-- ============================================================
ALTER TABLE show_visibility_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE trial_visibility_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_visibility_overrides ENABLE ROW LEVEL SECURITY;

-- Show visibility settings: readable by anyone viewing the show, writable by secretary/admin
CREATE POLICY "show_visibility_select" ON show_visibility_settings
  FOR SELECT USING (true);

CREATE POLICY "show_visibility_insert" ON show_visibility_settings
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM shows s
      WHERE s.id = show_id
        AND (
          (SELECT is_trial_secretary(s.club_id))
          OR (SELECT is_club_admin(s.club_id))
          OR (SELECT is_platform_admin())
        )
    )
  );

CREATE POLICY "show_visibility_update" ON show_visibility_settings
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM shows s
      WHERE s.id = show_id
        AND (
          (SELECT is_trial_secretary(s.club_id))
          OR (SELECT is_club_admin(s.club_id))
          OR (SELECT is_platform_admin())
        )
    )
  );

-- Trial visibility overrides
CREATE POLICY "trial_visibility_select" ON trial_visibility_overrides
  FOR SELECT USING (true);

CREATE POLICY "trial_visibility_insert" ON trial_visibility_overrides
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM trials t
      JOIN shows s ON s.id = t.show_id
      WHERE t.id = trial_id
        AND (
          (SELECT is_trial_secretary(s.club_id))
          OR (SELECT is_club_admin(s.club_id))
          OR (SELECT is_platform_admin())
        )
    )
  );

CREATE POLICY "trial_visibility_update" ON trial_visibility_overrides
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM trials t
      JOIN shows s ON s.id = t.show_id
      WHERE t.id = trial_id
        AND (
          (SELECT is_trial_secretary(s.club_id))
          OR (SELECT is_club_admin(s.club_id))
          OR (SELECT is_platform_admin())
        )
    )
  );

-- Class visibility overrides
CREATE POLICY "class_visibility_select" ON class_visibility_overrides
  FOR SELECT USING (true);

CREATE POLICY "class_visibility_insert" ON class_visibility_overrides
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM classes c
      JOIN trials t ON t.id = c.trial_id
      JOIN shows s ON s.id = t.show_id
      WHERE c.id = class_id
        AND (
          (SELECT is_trial_secretary(s.club_id))
          OR (SELECT is_club_admin(s.club_id))
          OR (SELECT is_platform_admin())
        )
    )
  );

CREATE POLICY "class_visibility_update" ON class_visibility_overrides
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM classes c
      JOIN trials t ON t.id = c.trial_id
      JOIN shows s ON s.id = t.show_id
      WHERE c.id = class_id
        AND (
          (SELECT is_trial_secretary(s.club_id))
          OR (SELECT is_club_admin(s.club_id))
          OR (SELECT is_platform_admin())
        )
    )
  );

-- ============================================================
-- Deprecate old column
-- ============================================================
COMMENT ON COLUMN shows.results_visible_to_all IS
  'DEPRECATED: Use show_visibility_settings table instead. Retained for backward compatibility.';
