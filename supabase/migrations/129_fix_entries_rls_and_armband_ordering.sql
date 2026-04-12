-- =============================================================================
-- Migration 129: Fix entries RLS — correct show scoping and restrict SELECT
--
-- Problems fixed:
--
-- 1. entries UPDATE/DELETE (migration 117) used `ur.show_id IS NULL` to match
--    secretaries. Secretaries are scoped by club_id, not show_id — show_id is
--    always NULL in their user_roles rows. This means any active secretary could
--    update or delete entries for ANY show, regardless of their club assignment.
--    Fix: use can_manage_show() which correctly checks club membership via
--    is_trial_secretary(club_id).
--
-- 2. entries SELECT (migration 081) was USING(true) for all authenticated users.
--    Any authenticated exhibitor could query all entries across all shows,
--    exposing competitor handler names, dog names, armbands, payment status,
--    and special_requests (which may contain accommodation notes).
--    Fix: restrict to show managers (secretaries/admins) and own entries
--    (by handler_id or dog ownership).
--
--    NOTE: Exhibitors viewing run orders or class start lists that include
--    other participants' entries may see restricted results after this change.
--    Add a relaxed "participant can see entries in their show" clause in
--    Phase 2 if this breaks golden-path exhibitor workflows.
-- =============================================================================

-- -------------------------------------------------------------------------
-- 1. Fix entries UPDATE — use can_manage_show() for proper club scoping
-- -------------------------------------------------------------------------
DROP POLICY IF EXISTS "entries_update" ON entries;

CREATE POLICY "entries_update" ON entries
  FOR UPDATE TO authenticated
  USING (
    -- Show managers (secretary scoped to the show's club, or site_admin)
    (SELECT can_manage_show(entries.show_id))
    OR
    -- Handler updating their own entry (e.g. self-check-in)
    EXISTS (
      SELECT 1 FROM people p
      WHERE p.auth_user_id = auth.uid()
        AND p.id = entries.handler_id
    )
  );

-- -------------------------------------------------------------------------
-- 2. Fix entries DELETE — use can_manage_show() for proper club scoping
-- -------------------------------------------------------------------------
DROP POLICY IF EXISTS "entries_delete" ON entries;

CREATE POLICY "entries_delete" ON entries
  FOR DELETE TO authenticated
  USING ((SELECT can_manage_show(entries.show_id)));

-- -------------------------------------------------------------------------
-- 3. Restrict entries SELECT from USING(true) to show managers + own entries
-- -------------------------------------------------------------------------
DROP POLICY IF EXISTS "entries_select" ON entries;

CREATE POLICY "entries_select" ON entries
  FOR SELECT TO authenticated
  USING (
    -- Show managers see all entries for their shows
    (SELECT can_manage_show(entries.show_id))
    OR
    -- Handlers see their own entries
    EXISTS (
      SELECT 1 FROM people p
      WHERE p.auth_user_id = auth.uid()
        AND p.id = entries.handler_id
    )
    OR
    -- Dog owners see entries for their dogs
    EXISTS (
      SELECT 1 FROM people p
      JOIN dogs d ON d.owner_id = p.id
      WHERE p.auth_user_id = auth.uid()
        AND d.id = entries.dog_id
    )
  );

NOTIFY pgrst, 'reload schema';
