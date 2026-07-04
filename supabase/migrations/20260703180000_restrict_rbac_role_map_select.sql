-- =============================================================================
-- Migration: SA-006 — Restrict the RBAC role-map SELECT
--
-- `user_roles`, `roles`, `permissions`, `role_permissions`, and
-- `permission_audit_log` all still carry the `SELECT USING (true)` policies from
-- migration 006 (mutations were already locked to is_site_admin() in 069/079/080;
-- only the read side stayed open). Any signed-in user could enumerate the full
-- role map — who every admin/secretary is, every user's show/club scoping,
-- `auth_user_id` values, and the permission audit trail. This closes the last
-- open MEDIUM disclosure finding (SA-006, docs/security-audit-2026-07-03.md).
--
-- Self-resolution is unaffected: AuthContext resolves the current user's
-- roles/permissions through the get_user_roles / get_user_permissions
-- SECURITY DEFINER RPCs (migrations 017/065), which bypass RLS. The three
-- legitimate cross-user reads of user_roles (show officials, entry-blank
-- secretary, club show-managers) move to the two SECURITY DEFINER RPCs added
-- below so the base table can be scoped to self-or-admin.
--
-- New migration only — 006 is never edited. Rollback = a follow-up migration
-- restoring the prior USING (true) SELECT policies.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Drop the five open SELECT policies
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "user_roles_select" ON public.user_roles;
DROP POLICY IF EXISTS "permission_audit_log_select" ON public.permission_audit_log;
DROP POLICY IF EXISTS "roles_select" ON public.roles;
DROP POLICY IF EXISTS "permissions_select" ON public.permissions;
DROP POLICY IF EXISTS "role_permissions_select" ON public.role_permissions;

-- -----------------------------------------------------------------------------
-- 2. Scoped replacements
--    is_site_admin() is the migration-156 SECURITY DEFINER helper that reads
--    user_roles.auth_user_id as definer (no 42P17 recursion). Wrapped in
--    (SELECT ...) so the planner evaluates it once per query (initplan), not
--    per row.
-- -----------------------------------------------------------------------------

-- user_roles: own rows (defense-in-depth; login itself uses the definer RPCs)
-- or full read for site admins.
CREATE POLICY "user_roles_select" ON public.user_roles
  FOR SELECT TO authenticated
  USING (
    (SELECT auth.uid()) = auth_user_id
    OR (SELECT public.is_site_admin())
  );

-- permission_audit_log: site admins only.
CREATE POLICY "permission_audit_log_select" ON public.permission_audit_log
  FOR SELECT TO authenticated
  USING ((SELECT public.is_site_admin()));

-- roles / permissions / role_permissions: static catalog still needed by
-- authenticated official-role resolution; deny anon (was open to anon under the
-- TO-less USING (true) policy).
CREATE POLICY "roles_select" ON public.roles
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "permissions_select" ON public.permissions
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "role_permissions_select" ON public.role_permissions
  FOR SELECT TO authenticated
  USING (true);

-- -----------------------------------------------------------------------------
-- 3. SECURITY DEFINER RPCs for the legitimate cross-user reads
--    Definer + SET search_path = '' + fully-qualified names, per the repo's
--    established helper pattern (migration 156). These bypass the scoped
--    user_roles SELECT policy without re-opening it to enumeration: each returns
--    only a specific show's / club's officials, not the whole table.
-- -----------------------------------------------------------------------------

-- Active secretary / chairman / steward for a show, with the person's display
-- fields. Replaces the direct user_roles read in useShowOfficials and the
-- secretary lookup in useEntryFormData.
CREATE OR REPLACE FUNCTION public.get_show_officials(p_show_id uuid)
RETURNS TABLE (
  user_id uuid,
  first_name text,
  last_name text,
  email text,
  role text
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT
    ur.user_id,
    pe.first_name,
    pe.last_name,
    pe.email,
    r.name AS role
  FROM public.user_roles ur
  JOIN public.shows s ON s.id = ur.show_id
  JOIN public.roles r ON r.id = ur.role_id
  JOIN public.people pe ON pe.id = ur.user_id
  WHERE ur.show_id = p_show_id
    AND s.deleted_at IS NULL
    AND (
      s.status IN ('published', 'upcoming', 'in_progress', 'completed')
      OR (
        s.club_id IS NOT NULL
        AND (SELECT public.is_club_admin(s.club_id))
      )
      OR (SELECT public.is_show_secretary(s.id))
      OR (SELECT public.is_site_admin())
    )
    AND ur.is_active = true
    AND r.name IN ('secretary', 'chairman', 'steward');
$$;

COMMENT ON FUNCTION public.get_show_officials(uuid) IS
  'SA-006: public-safe show-official contact lookup scoped to one show, without exposing user_roles to direct enumeration.';

-- Person ids holding the active club-scoped `secretary` role. Replaces the
-- direct user_roles read in getClubShowManagerIds.
CREATE OR REPLACE FUNCTION public.get_club_show_manager_ids(p_club_id uuid)
RETURNS TABLE (user_id uuid)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT ur.user_id
  FROM public.user_roles ur
  JOIN public.roles r ON r.id = ur.role_id
  WHERE ur.club_id = p_club_id
    AND ur.is_active = true
    AND r.name = 'secretary';
$$;

COMMENT ON FUNCTION public.get_club_show_manager_ids(uuid) IS
  'SA-006: returns a club''s show-managers (club-scoped secretary role) without exposing user_roles to direct enumeration.';

-- Close the default PUBLIC execute grant, then grant only the intended roles.
-- get_show_officials is intentionally public-safe because /shows/:id renders
-- show officials on the unauthenticated overview page; it remains scoped to
-- one show and never returns club/show-wide role maps. get_club_show_manager_ids
-- stays authenticated-only because it powers management surfaces.
REVOKE ALL ON FUNCTION public.get_show_officials(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_club_show_manager_ids(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_show_officials(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_show_officials(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_club_show_manager_ids(uuid) TO authenticated;

-- -----------------------------------------------------------------------------
-- 4. Reload PostgREST schema cache so the new policies + RPCs take effect
-- -----------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';
