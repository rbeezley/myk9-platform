-- =============================================================================
-- Migration 087: SA-017 — Restrict trial_checklist_state mutations to show managers
--
-- MEDIUM: INSERT/UPDATE/DELETE policies only checked auth.uid() IS NOT NULL,
-- allowing any authenticated user (including exhibitors) to manipulate
-- trial readiness checklists. Now restricted to users who can manage the
-- show that owns the trial, or platform admins.
--
-- The SELECT policy remains open to all authenticated users (read-only
-- visibility is acceptable for dashboard views).
-- =============================================================================

-- Drop existing mutation policies
DROP POLICY IF EXISTS "checklist_insert" ON trial_checklist_state;
DROP POLICY IF EXISTS "checklist_update" ON trial_checklist_state;
DROP POLICY IF EXISTS "checklist_delete" ON trial_checklist_state;

-- INSERT: only show managers or platform admins
CREATE POLICY "checklist_insert" ON trial_checklist_state
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT is_platform_admin())
    OR EXISTS (
      SELECT 1 FROM trials t
      WHERE t.id = trial_checklist_state.trial_id
        AND (SELECT can_manage_show(t.show_id))
    )
  );

-- UPDATE: only show managers or platform admins
CREATE POLICY "checklist_update" ON trial_checklist_state
  FOR UPDATE TO authenticated
  USING (
    (SELECT is_platform_admin())
    OR EXISTS (
      SELECT 1 FROM trials t
      WHERE t.id = trial_checklist_state.trial_id
        AND (SELECT can_manage_show(t.show_id))
    )
  );

-- DELETE: only show managers or platform admins
CREATE POLICY "checklist_delete" ON trial_checklist_state
  FOR DELETE TO authenticated
  USING (
    (SELECT is_platform_admin())
    OR EXISTS (
      SELECT 1 FROM trials t
      WHERE t.id = trial_checklist_state.trial_id
        AND (SELECT can_manage_show(t.show_id))
    )
  );
