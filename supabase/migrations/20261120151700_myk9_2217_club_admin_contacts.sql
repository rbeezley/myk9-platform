-- MYK9-2217: name the club's admins and offer "Email them the link" where NO show exists yet: the
-- new-show wizard's Review step, and the secretary home's first-show card for a club with no draft.
--
-- get_show_club_admin_contacts (20261120033900) is scoped to a SHOW the caller manages. This is the
-- same read scoped to a CLUB. New function, nothing replaced.
--
-- Authorization: exactly get_show_club_admin_contacts' caller rule, for the club: a club admin of
-- THAT club, a club-wide secretary of THAT club (public.is_club_admin / public.is_trial_secretary,
-- both active, unexpired; the secretary check requires show_id IS NULL, so a show-pinned secretary
-- grants nothing and gets 42501, owner decision 2026-11-19 on MYK9-2208), or a site admin. The
-- caller's own account must also be live (person_can_sign_in). 42501 otherwise; anon cannot execute.
--
-- Who is listed: identical to the show version (active, unexpired, club-wide club_admin rows whose
-- person can sign in and has an email).

BEGIN;

CREATE OR REPLACE FUNCTION public.get_club_admin_contacts(p_club_id uuid)
RETURNS TABLE (
  display_name text,
  email text
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
BEGIN
  IF p_club_id IS NULL THEN
    RAISE EXCEPTION 'p_club_id is required' USING ERRCODE = '22023';
  END IF;

  -- is_club_admin / is_trial_secretary read a NULL as "any club", which the check above rules out.
  IF NOT (
    (public.is_club_admin(p_club_id)
      OR public.is_trial_secretary(p_club_id)
      OR public.is_site_admin())
    AND EXISTS (
      SELECT 1 FROM public.people cp
      WHERE cp.auth_user_id = auth.uid()
        AND auth.uid() IS NOT NULL
        AND public.person_can_sign_in(cp.id)
    )
  ) THEN
    RAISE EXCEPTION 'not authorized to read the club admins for club %', p_club_id
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    NULLIF(BTRIM(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')), ''),
    p.email
  FROM (
    SELECT DISTINCT ur.user_id
    FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.club_id = p_club_id
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

COMMENT ON FUNCTION public.get_club_admin_contacts(uuid) IS
  'MYK9-2217: display name and email of a club''s admins (active, unexpired, club-wide club_admin rows) who can sign in. Caller must be a club admin or club-wide secretary of that club, or a site admin, with a live account; 42501 otherwise.';

REVOKE ALL ON FUNCTION public.get_club_admin_contacts(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_club_admin_contacts(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
