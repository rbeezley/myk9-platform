-- MYK9-860: who runs this club, shown under the club name to its members and staff.
--
-- The club page needs the club's admins and secretaries by name. Neither existing
-- read gives that to the audience that needs it:
--   * user_roles SELECT is `auth_user_id = self OR is_site_admin()` (SA-006), so a
--     direct read shows a club admin only their own row, never their co-admins, and
--     shows members nothing at all.
--   * get_club_show_managers returns secretaries only, with email addresses, and is
--     gated to site admins and club staff.
--
-- AUTHORIZATION: site admins, this club's admins and secretaries, and its ACTIVE
-- members. Names and roles only; no email, no membership detail. Everyone else
-- (another club's admin, an unrelated signed-in user) gets zero rows rather than
-- 42501. That is deliberate: this feeds a passive display line, and an unauthorized
-- viewer is the normal case, not a fault. Returning empty lets the client treat any
-- error from this call as a real failure instead of swallowing them all. anon has no
-- EXECUTE, so guests are refused by the grant and the client does not call it.
--
-- `trial_secretary` is reported as 'secretary', matching get_club_show_managers and
-- the read-side helpers, which treat the two names as one role.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_club_officials(p_club_id uuid)
RETURNS TABLE (
  role text,
  person_id uuid,
  person_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
BEGIN
  IF NOT (
    public.is_site_admin()
    OR EXISTS (
      SELECT 1
      FROM public.user_roles admin_role
      JOIN public.roles admin_name ON admin_name.id = admin_role.role_id
      WHERE admin_role.auth_user_id = (SELECT auth.uid())
        AND admin_role.club_id = p_club_id
        AND admin_role.show_id IS NULL
        AND admin_role.is_active = true
        AND (admin_role.expires_at IS NULL OR admin_role.expires_at > NOW())
        AND admin_name.name = 'club_admin'
    )
    OR public.is_trial_secretary(p_club_id)
    OR public.is_club_member(p_club_id)
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT DISTINCT
    CASE WHEN r.name = 'club_admin' THEN 'club_admin' ELSE 'secretary' END AS role,
    p.id,
    NULLIF(BTRIM(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')), '') AS person_name
  FROM public.user_roles ur
  JOIN public.roles r ON r.id = ur.role_id
  JOIN public.people p ON p.id = ur.user_id
  WHERE ur.club_id = p_club_id
    AND ur.show_id IS NULL
    AND ur.is_active = true
    AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
    AND r.name IN ('club_admin', 'secretary', 'trial_secretary')
    AND p.deleted_at IS NULL
  -- Positional: `role` and `person_name` are also this function's OUT parameters.
  ORDER BY 1, 3 NULLS LAST;
END;
$$;

COMMENT ON FUNCTION public.get_club_officials(uuid) IS
  'MYK9-860: names of this club''s admins and secretaries for the club page header. Visible to site admins, this club''s admins and secretaries, and its active members; zero rows for anyone else. No email addresses.';

REVOKE ALL ON FUNCTION public.get_club_officials(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_club_officials(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
