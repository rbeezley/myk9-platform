-- 095_volunteer_scheduling.sql
-- Add show_id scoping to volunteers table and fix unique constraints for myK9Show
--
-- SAFETY NOTE: Before running, verify no duplicate data exists that would
-- violate the new unique constraints. Run these checks first:
--   SELECT volunteer_id, class_id, role_name, count(*)
--     FROM volunteer_class_assignments
--     GROUP BY volunteer_id, class_id, role_name HAVING count(*) > 1;
--   SELECT volunteer_id, show_id, role_name, count(*)
--     FROM volunteer_general_assignments
--     GROUP BY volunteer_id, show_id, role_name HAVING count(*) > 1;
-- If either returns rows, deduplicate before applying this migration.

-- 1. Add show_id column to volunteers (nullable — myK9Q rows won't have it)
ALTER TABLE volunteers ADD COLUMN IF NOT EXISTS show_id UUID REFERENCES shows(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS volunteers_show_id_idx ON volunteers(show_id);

-- 2. Fix volunteer_class_assignments unique constraint
-- Old: (volunteer_id, class_id, role_id) — wrong, v1 uses role_name not role_id
-- New: (volunteer_id, class_id, role_name)
ALTER TABLE volunteer_class_assignments
  DROP CONSTRAINT IF EXISTS volunteer_class_assignments_volunteer_id_class_id_role_id_key;
ALTER TABLE volunteer_class_assignments
  ADD CONSTRAINT volunteer_class_assignments_volunteer_class_role_name_key
  UNIQUE (volunteer_id, class_id, role_name);

-- 3. Add unique constraint to volunteer_general_assignments
ALTER TABLE volunteer_general_assignments
  ADD CONSTRAINT volunteer_general_assignments_volunteer_show_role_name_key
  UNIQUE (volunteer_id, show_id, role_name);

-- 4. RLS policies
ALTER TABLE volunteers ENABLE ROW LEVEL SECURITY;
ALTER TABLE volunteer_class_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE volunteer_general_assignments ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read volunteer data
CREATE POLICY "Authenticated users can view volunteers"
  ON volunteers FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can view class assignments"
  ON volunteer_class_assignments FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can view general assignments"
  ON volunteer_general_assignments FOR SELECT TO authenticated USING (true);

-- Secretary/admin can manage volunteers (insert, update, delete)
CREATE POLICY "Secretary can manage volunteers"
  ON volunteers FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role_name IN ('secretary', 'site_admin')
        AND user_roles.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role_name IN ('secretary', 'site_admin')
        AND user_roles.is_active = true
    )
  );

CREATE POLICY "Secretary can manage class assignments"
  ON volunteer_class_assignments FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role_name IN ('secretary', 'site_admin')
        AND user_roles.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role_name IN ('secretary', 'site_admin')
        AND user_roles.is_active = true
    )
  );

CREATE POLICY "Secretary can manage general assignments"
  ON volunteer_general_assignments FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role_name IN ('secretary', 'site_admin')
        AND user_roles.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role_name IN ('secretary', 'site_admin')
        AND user_roles.is_active = true
    )
  );
