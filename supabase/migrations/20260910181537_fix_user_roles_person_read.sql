-- MYK9-457 / SA-006 regression repair.
--
-- 20260910014500 exposed every user_roles row to anyone who manages any club.
-- Besides crossing club boundaries, that made grant metadata and site-admin
-- identities enumerable and let inactive/expired rows render as current roles.
-- Restore the raw table boundary, then expose only effective role NAMES for the
-- explicit live people a screen is rendering.

BEGIN;

DROP POLICY IF EXISTS "user_roles_select" ON public.user_roles;

CREATE POLICY "user_roles_select" ON public.user_roles
  FOR SELECT TO authenticated
  USING (
    (SELECT auth.uid()) = auth_user_id
    OR (SELECT public.is_site_admin())
  );

CREATE OR REPLACE FUNCTION public.get_deleted_person_role_history(p_person_id uuid)
RETURNS TABLE (
  expires_at timestamptz,
  is_active boolean,
  deactivated_at timestamptz,
  role_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_site_admin() THEN
    RAISE EXCEPTION 'Only site admins can inspect removed-person role history'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT ur.expires_at, ur.is_active, ur.deactivated_at, r.name
  FROM public.user_roles ur
  JOIN public.roles r ON r.id = ur.role_id
  JOIN public.people p ON p.id = ur.user_id
  WHERE ur.user_id = p_person_id
    AND p.deleted_at IS NOT NULL;
END;
$$;

COMMENT ON FUNCTION public.get_deleted_person_role_history(uuid) IS
  'MYK9-457: site-admin-only history for the removed-person detail surface. Keeps deleted grants out of the general user_roles SELECT policy.';

REVOKE ALL ON FUNCTION public.get_deleted_person_role_history(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_deleted_person_role_history(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_visible_person_roles(p_person_ids uuid[])
RETURNS TABLE (
  person_id uuid,
  role_name text
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  WITH caller AS MATERIALIZED (
    SELECT
      public.get_my_person_id() AS person_id,
      public.is_site_admin() AS is_site_admin,
      public.is_show_manager() AS is_show_manager
  )
  SELECT DISTINCT ur.user_id AS person_id, r.name AS role_name
  FROM public.user_roles ur
  JOIN public.roles r ON r.id = ur.role_id
  JOIN public.people p ON p.id = ur.user_id
  CROSS JOIN caller c
  WHERE ur.user_id = ANY(COALESCE(p_person_ids, ARRAY[]::uuid[]))
    AND p.deleted_at IS NULL
    AND ur.is_active = true
    AND (ur.expires_at IS NULL OR ur.expires_at > now())
    AND (
      p.id = c.person_id
      OR c.is_site_admin
      OR (
        c.is_show_manager
        AND (
          r.name = 'judge'
          OR (
            ur.club_id IS NOT NULL
            AND (
              public.is_trial_secretary(ur.club_id)
              OR public.is_club_admin(ur.club_id)
            )
          )
          OR (
            ur.show_id IS NOT NULL
            AND public.can_manage_show(ur.show_id)
          )
        )
      )
    )
  ORDER BY ur.user_id, r.name;
$$;

COMMENT ON FUNCTION public.get_visible_person_roles(uuid[]) IS
  'MYK9-457: returns deduplicated current role labels for explicit live people. Plain users are self-only; show managers may resolve judges plus officials in shows/clubs they manage; site admins retain full inspection. Never returns grant metadata.';

REVOKE ALL ON FUNCTION public.get_visible_person_roles(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_visible_person_roles(uuid[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_visible_person_ids_by_role(p_role_name text)
RETURNS TABLE (person_id uuid)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  WITH caller AS MATERIALIZED (
    SELECT
      public.get_my_person_id() AS person_id,
      public.is_site_admin() AS is_site_admin,
      public.is_show_manager() AS is_show_manager
  )
  SELECT DISTINCT ur.user_id AS person_id
  FROM public.user_roles ur
  JOIN public.roles r ON r.id = ur.role_id
  JOIN public.people p ON p.id = ur.user_id
  CROSS JOIN caller c
  WHERE r.name = p_role_name
    AND p.deleted_at IS NULL
    AND ur.is_active = true
    AND (ur.expires_at IS NULL OR ur.expires_at > now())
    AND (
      p.id = c.person_id
      OR c.is_site_admin
      OR (
        c.is_show_manager
        AND (
          r.name = 'judge'
          OR (
            ur.club_id IS NOT NULL
            AND (
              public.is_trial_secretary(ur.club_id)
              OR public.is_club_admin(ur.club_id)
            )
          )
          OR (
            ur.show_id IS NOT NULL
            AND public.can_manage_show(ur.show_id)
          )
        )
      )
    )
  ORDER BY ur.user_id;
$$;

COMMENT ON FUNCTION public.get_visible_person_ids_by_role(text) IS
  'MYK9-457: returns current matching person IDs without loading the entire people directory. Show managers may discover judges plus officials in shows/clubs they manage; site admins retain role-directory access; plain users are self-only.';

REVOKE ALL ON FUNCTION public.get_visible_person_ids_by_role(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_visible_person_ids_by_role(text) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
