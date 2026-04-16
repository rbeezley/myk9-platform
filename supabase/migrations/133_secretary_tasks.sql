-- supabase/migrations/133_secretary_tasks.sql
-- Secretary tasks: persistent, club-visible, show-tagged task list.
-- Replaces the per-device localStorage Kanban (myk9show-kanban-${showId}).

CREATE TABLE secretary_tasks (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id      uuid NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  show_id      uuid REFERENCES shows(id) ON DELETE SET NULL,  -- null = General (cross-show)
  title        text NOT NULL,
  description  text,
  status       text NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'done')),
  priority     text CHECK (priority IN ('low', 'medium', 'high')),
  due_date     date,
  assignee_id  uuid REFERENCES people(id) ON DELETE SET NULL,
  created_by   uuid NOT NULL REFERENCES people(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- Trigger: auto-update updated_at on row change
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Only create trigger if it doesn't already exist (other tables may use same fn)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'secretary_tasks_updated_at'
  ) THEN
    CREATE TRIGGER secretary_tasks_updated_at
      BEFORE UPDATE ON secretary_tasks
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END; $$;

ALTER TABLE secretary_tasks ENABLE ROW LEVEL SECURITY;

-- SELECT: visible to secretaries/admins scoped to the club, or site admins
CREATE POLICY "secretary_tasks_select" ON secretary_tasks
  FOR SELECT TO authenticated
  USING (
    is_site_admin()
    OR EXISTS (
      SELECT 1 FROM people p
      JOIN user_roles ur ON ur.user_id = p.id
      JOIN roles r ON r.id = ur.role_id
      WHERE p.auth_user_id = auth.uid()
        AND ur.club_id = secretary_tasks.club_id
        AND ur.is_active = TRUE
        AND r.name IN ('secretary', 'club_admin', 'site_admin')
    )
  );

-- INSERT: same scope
CREATE POLICY "secretary_tasks_insert" ON secretary_tasks
  FOR INSERT TO authenticated
  WITH CHECK (
    is_site_admin()
    OR EXISTS (
      SELECT 1 FROM people p
      JOIN user_roles ur ON ur.user_id = p.id
      JOIN roles r ON r.id = ur.role_id
      WHERE p.auth_user_id = auth.uid()
        AND ur.club_id = secretary_tasks.club_id
        AND ur.is_active = TRUE
        AND r.name IN ('secretary', 'club_admin', 'site_admin')
    )
  );

-- UPDATE: same scope
CREATE POLICY "secretary_tasks_update" ON secretary_tasks
  FOR UPDATE TO authenticated
  USING (
    is_site_admin()
    OR EXISTS (
      SELECT 1 FROM people p
      JOIN user_roles ur ON ur.user_id = p.id
      JOIN roles r ON r.id = ur.role_id
      WHERE p.auth_user_id = auth.uid()
        AND ur.club_id = secretary_tasks.club_id
        AND ur.is_active = TRUE
        AND r.name IN ('secretary', 'club_admin', 'site_admin')
    )
  );

-- DELETE: same scope
CREATE POLICY "secretary_tasks_delete" ON secretary_tasks
  FOR DELETE TO authenticated
  USING (
    is_site_admin()
    OR EXISTS (
      SELECT 1 FROM people p
      JOIN user_roles ur ON ur.user_id = p.id
      JOIN roles r ON r.id = ur.role_id
      WHERE p.auth_user_id = auth.uid()
        AND ur.club_id = secretary_tasks.club_id
        AND ur.is_active = TRUE
        AND r.name IN ('secretary', 'club_admin', 'site_admin')
    )
  );

NOTIFY pgrst, 'reload schema';

-- ROLLBACK (run manually if this migration must be reverted):
--   DROP TABLE IF EXISTS secretary_tasks;
--   DROP TRIGGER IF EXISTS secretary_tasks_updated_at ON secretary_tasks;
--   -- Only drop set_updated_at() if no other table uses it.
