-- =============================================================================
-- Migration 080: SA-003 — Restrict roles/permissions/role_permissions mutations
--
-- CRITICAL: Any authenticated user could create/modify/delete roles,
-- permissions, and their mappings via the FOR ALL policies. Combined with
-- SA-002, this allowed rewriting the entire RBAC schema.
--
-- The existing _select policies (FOR SELECT USING (true)) are kept — all
-- users need to read role definitions for the RBAC system to function.
-- =============================================================================

-- Drop the overly permissive FOR ALL policies from migration 006
DROP POLICY IF EXISTS "roles_all" ON roles;
DROP POLICY IF EXISTS "permissions_all" ON permissions;
DROP POLICY IF EXISTS "role_permissions_all" ON role_permissions;

-- Only platform admins can mutate RBAC schema tables
-- Use DROP IF EXISTS + CREATE to handle cases where policies were already applied manually
DROP POLICY IF EXISTS "roles_insert" ON roles;
CREATE POLICY "roles_insert" ON roles
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT is_platform_admin()));

DROP POLICY IF EXISTS "roles_update" ON roles;
CREATE POLICY "roles_update" ON roles
  FOR UPDATE TO authenticated
  USING ((SELECT is_platform_admin()));

DROP POLICY IF EXISTS "roles_delete" ON roles;
CREATE POLICY "roles_delete" ON roles
  FOR DELETE TO authenticated
  USING ((SELECT is_platform_admin()));

DROP POLICY IF EXISTS "permissions_insert" ON permissions;
CREATE POLICY "permissions_insert" ON permissions
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT is_platform_admin()));

DROP POLICY IF EXISTS "permissions_update" ON permissions;
CREATE POLICY "permissions_update" ON permissions
  FOR UPDATE TO authenticated
  USING ((SELECT is_platform_admin()));

DROP POLICY IF EXISTS "permissions_delete" ON permissions;
CREATE POLICY "permissions_delete" ON permissions
  FOR DELETE TO authenticated
  USING ((SELECT is_platform_admin()));

DROP POLICY IF EXISTS "role_permissions_insert" ON role_permissions;
CREATE POLICY "role_permissions_insert" ON role_permissions
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT is_platform_admin()));

DROP POLICY IF EXISTS "role_permissions_update" ON role_permissions;
CREATE POLICY "role_permissions_update" ON role_permissions
  FOR UPDATE TO authenticated
  USING ((SELECT is_platform_admin()));

DROP POLICY IF EXISTS "role_permissions_delete" ON role_permissions;
CREATE POLICY "role_permissions_delete" ON role_permissions
  FOR DELETE TO authenticated
  USING ((SELECT is_platform_admin()));

NOTIFY pgrst, 'reload schema';
