-- =============================================================================
-- Migration 117: Harden entries RLS and revoke anon from view_myk9q_entries
--
-- Problems fixed:
--
-- 1. entries UPDATE was USING (true) — any authenticated user could update any
--    entry, including a competitor's entry (competitive sabotage vector).
--    Fix: restrict to show secretaries, site_admins, and the entry's own handler
--    (for self-service actions like check-in).
--
-- 2. entries DELETE was USING (true) — same issue.
--    Fix: restrict to show secretaries and site_admins only.
--
-- 3. view_myk9q_entries granted SELECT to anon — the underlying entries table
--    requires authentication, but the view bypassed that by granting anon access.
--    Fix: revoke anon, keep authenticated only.
--
-- entries INSERT remains permissive (authenticated WITH CHECK true) per
-- migration 081 rationale: handlers may enter dogs they don't own, so
-- authorization for INSERT is enforced at the application layer.
-- =============================================================================

-- -------------------------------------------------------------------------
-- 1. Tighten entries UPDATE
-- -------------------------------------------------------------------------
DROP POLICY IF EXISTS "entries_update" ON entries;

CREATE POLICY "entries_update" ON entries
  FOR UPDATE TO authenticated
  USING (
    -- Show secretary (role scoped to this show, or global) or site_admin
    EXISTS (
      SELECT 1
      FROM people p
      JOIN user_roles ur ON ur.user_id = p.id
      JOIN roles r ON r.id = ur.role_id
      WHERE p.auth_user_id = auth.uid()
        AND r.name IN ('secretary', 'site_admin')
        AND ur.is_active = TRUE
        AND (ur.show_id IS NULL OR ur.show_id = entries.show_id)
    )
    OR
    -- Handler updating their own entry (e.g. self-check-in)
    EXISTS (
      SELECT 1 FROM people p
      WHERE p.auth_user_id = auth.uid()
        AND p.id = entries.handler_id
    )
  );

-- -------------------------------------------------------------------------
-- 2. Tighten entries DELETE
-- -------------------------------------------------------------------------
DROP POLICY IF EXISTS "entries_delete" ON entries;

CREATE POLICY "entries_delete" ON entries
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM people p
      JOIN user_roles ur ON ur.user_id = p.id
      JOIN roles r ON r.id = ur.role_id
      WHERE p.auth_user_id = auth.uid()
        AND r.name IN ('secretary', 'site_admin')
        AND ur.is_active = TRUE
        AND (ur.show_id IS NULL OR ur.show_id = entries.show_id)
    )
  );

-- -------------------------------------------------------------------------
-- 3. Revoke anon access from view_myk9q_entries
-- -------------------------------------------------------------------------
REVOKE SELECT ON view_myk9q_entries FROM anon;

NOTIFY pgrst, 'reload schema';
