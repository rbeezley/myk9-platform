-- Phase 3 of docs/plan-secretary-permission-model.md — make appointment visible.
--
-- Phase 1 (20260830210000) decoupled show access from club membership. That opened a
-- hole it did not close: the club admin UI renders show access as a badge on each
-- club_members row, so a person appointed WITHOUT a membership — the professional
-- secretary the whole change exists to serve — appears nowhere. They cannot be seen,
-- and because Revoke Show Access lives in a member row's action menu, they cannot be
-- revoked either. An appointment you can neither see nor undo is worse than one you
-- cannot make.
--
-- get_club_show_manager_ids returns bare user_ids, which is enough to annotate a row
-- that already exists and useless for listing people who have no row. This returns the
-- appointees themselves, with the membership flag the UI needs to say "not a member of
-- this club" out loud.
--
-- AUTHORIZATION: this is deliberately gated where get_club_show_manager_ids is not.
-- That function is granted to `authenticated` with no internal check, so any signed-in
-- user can enumerate a club's manager ids; ids alone are a mild leak. Returning names
-- and email addresses is not, so this restates the caller check internally the way
-- grant_club_secretary does. Left as a separate function rather than widening the
-- existing one, because the existing one is called by behavioural SQL and by the
-- annotation path, and narrowing a function in use is its own change.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_club_show_managers(p_club_id uuid)
RETURNS TABLE (
  person_id uuid,
  person_name text,
  person_email text,
  is_club_member boolean,
  membership_status text
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
BEGIN
  IF NOT (
    public.is_site_admin()
    OR public.is_club_admin(p_club_id)
    OR public.is_trial_secretary(p_club_id)
  ) THEN
    RAISE EXCEPTION 'Only this club''s admins or secretaries can list its show managers'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    NULLIF(BTRIM(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')), '') AS person_name,
    p.email,
    (cm.person_id IS NOT NULL) AS is_club_member,
    cm.membership_status::text
  FROM public.user_roles ur
  JOIN public.roles r ON r.id = ur.role_id
  JOIN public.people p ON p.id = ur.user_id
  LEFT JOIN public.club_members cm
    ON cm.person_id = ur.user_id
   AND cm.club_id = p_club_id
  WHERE ur.club_id = p_club_id
    AND ur.show_id IS NULL
    AND ur.is_active = true
    AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
    AND r.name IN ('secretary', 'trial_secretary')
    AND p.deleted_at IS NULL
  ORDER BY person_name NULLS LAST;
END;
$$;

COMMENT ON FUNCTION public.get_club_show_managers(uuid) IS
  'Everyone appointed to run this club''s shows, whether or not they are a club member. Caller must be a site admin, an admin of this club, or one of its secretaries.';

REVOKE ALL ON FUNCTION public.get_club_show_managers(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_club_show_managers(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
