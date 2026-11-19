-- MYK9-2208: a secretary who is not a club admin sees WHO the club's admins are on the payouts
-- line ("Waiting on Pat Lee, the club admin") and can email them the Payments link in one tap.
--
-- get_club_admins (20261120004700) is callable by club admins only, and get_club_officials
-- returns names only and rejects show-scoped secretaries. This is a new read, scoped to a SHOW the
-- caller manages, returning the club's admins' display name and email. New function, nothing replaced.
--
-- Authorization: exactly show_publish_blockers' rule (20261119223100): can_manage_show (platform
-- admin, a club admin of the show's club, or a club-wide secretary; latest definition
-- 20261113222900) OR site admin. A show-pinned secretary row grants nothing (20260830240000), so
-- it does not pass here either. The caller must also have a live account. 42501 otherwise, and anon cannot execute.
--
-- Who is listed: the same "club admin" the client treats as one (an active, unexpired, club-wide
-- club_admin row), only people who can actually sign in (person_can_sign_in): a banned, suspended,
-- deleted or never-signed-in account has no inbox worth mailing.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_show_club_admin_contacts(p_show_id uuid)
RETURNS TABLE (
  display_name text,
  email text
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
DECLARE
  v_club_id uuid;
BEGIN
  IF p_show_id IS NULL THEN
    RAISE EXCEPTION 'p_show_id is required' USING ERRCODE = '22023';
  END IF;

  -- The caller's own account must be live too (signed in, not banned, suspended or deleted): the
  -- role checks read assignments only, so a suspended manager with a valid session is refused here.
  IF NOT (
    (public.can_manage_show(p_show_id) OR public.is_site_admin())
    AND EXISTS (
      SELECT 1 FROM public.people cp
      WHERE cp.auth_user_id = auth.uid()
        AND auth.uid() IS NOT NULL
        AND public.person_can_sign_in(cp.id)
    )
  ) THEN
    RAISE EXCEPTION 'not authorized to read the club admins for show %', p_show_id
      USING ERRCODE = '42501';
  END IF;

  SELECT s.club_id INTO v_club_id
  FROM public.shows s
  WHERE s.id = p_show_id AND s.deleted_at IS NULL;

  IF v_club_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    NULLIF(BTRIM(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')), ''),
    p.email
  FROM (
    SELECT DISTINCT ur.user_id
    FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.club_id = v_club_id
      AND r.name = 'club_admin'
      AND ur.show_id IS NULL
      AND ur.is_active = true
      AND (ur.expires_at IS NULL OR ur.expires_at > now())
  ) admins
  JOIN public.people p ON p.id = admins.user_id
  WHERE p.deleted_at IS NULL
    AND p.email IS NOT NULL
    AND public.person_can_sign_in(p.id)
  ORDER BY 1 NULLS LAST, 2;
END;
$$;

COMMENT ON FUNCTION public.get_show_club_admin_contacts(uuid) IS
  'MYK9-2208: display name and email of the show''s club''s admins (active, unexpired, club-wide club_admin rows) who can sign in. Caller must manage the show (can_manage_show or site admin); 42501 otherwise.';

REVOKE ALL ON FUNCTION public.get_show_club_admin_contacts(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_show_club_admin_contacts(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
