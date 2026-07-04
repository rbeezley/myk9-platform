-- =============================================================================
-- Migration: SA-006 follow-up — preserve public show officials lookup
--
-- Migration 20260703180000 scoped the RBAC role-map tables and moved legitimate
-- cross-user reads behind SECURITY DEFINER RPCs. It granted get_show_officials
-- only to authenticated users, which hid the officials card on the public show
-- overview. Replacing the RPC here makes the public path explicit and replayable
-- for databases that already applied the original SA-006 migration.
-- =============================================================================

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
    AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
    AND r.name IN ('secretary', 'chairman', 'steward');
$$;

COMMENT ON FUNCTION public.get_show_officials(uuid) IS
  'SA-006 follow-up: public-safe show-official contact lookup scoped to visible shows, without exposing user_roles to direct enumeration.';

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
    AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
    AND r.name = 'secretary';
$$;

COMMENT ON FUNCTION public.get_club_show_manager_ids(uuid) IS
  'SA-006 follow-up: returns non-expired club show-managers without exposing user_roles to direct enumeration.';

-- Close the default PUBLIC execute grant, then grant only the intended roles.
-- get_show_officials is intentionally public-safe because /shows/:id renders
-- show officials on the unauthenticated overview page; it remains scoped to
-- visible shows and never returns club/show-wide role maps.
REVOKE ALL ON FUNCTION public.get_show_officials(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_club_show_manager_ids(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_show_officials(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_show_officials(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_club_show_manager_ids(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
