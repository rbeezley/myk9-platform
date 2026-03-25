-- =============================================================================
-- Migration 079: SA-002 — Restrict user_roles mutations to platform admins
--
-- CRITICAL: Any authenticated user could INSERT/UPDATE/DELETE user_roles,
-- allowing self-escalation to site_admin. The handle_new_user() trigger uses
-- SECURITY DEFINER and bypasses RLS, so auto-assignment of exhibitor role
-- on signup still works.
-- =============================================================================

-- Drop the overly permissive policies from migration 069
DROP POLICY IF EXISTS "user_roles_insert" ON user_roles;
DROP POLICY IF EXISTS "user_roles_update" ON user_roles;
DROP POLICY IF EXISTS "user_roles_delete" ON user_roles;

-- Only platform admins can manage role assignments
CREATE POLICY "user_roles_insert" ON user_roles
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT is_platform_admin()));

CREATE POLICY "user_roles_update" ON user_roles
  FOR UPDATE TO authenticated
  USING ((SELECT is_platform_admin()));

CREATE POLICY "user_roles_delete" ON user_roles
  FOR DELETE TO authenticated
  USING ((SELECT is_platform_admin()));

-- Force PostgREST to pick up policy changes
NOTIFY pgrst, 'reload schema';
