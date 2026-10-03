-- MYK9-970: role-aware onboarding — one flow for everyone, with a step per role.
--
-- Two schema pieces, both deliberately narrow.
--
-- 1. exhibitor_profiles.onboarded_roles
--    The role steps (judge, secretary, club_admin) this account has finished.
--    `onboarding_completed_at` keeps meaning "profile + dogs + welcome done";
--    a role gained afterwards shows up as a role the user holds that is not in
--    this array, and only that role's step runs, once.
--
--    Why a column and not a new table: every non-anonymous account already has
--    exactly one exhibitor_profiles row (handle_new_user() creates it, unique on
--    auth_user_id), the row already carries the sibling flag, and its self-only
--    RLS (`auth_user_id = auth.uid()` or site admin) and grants (authenticated
--    CRUD, anon revoked in 20260730220000) are exactly what this needs. A new
--    table would need its own RLS, grants and an explicit anon REVOKE (project
--    default privileges hand anon CRUD on new tables) to reach the same place.
--    The value only decides which onboarding screen a user sees, so a user
--    writing their own array grants nothing.
--
--    Backfill (below): an account that already finished onboarding is marked
--    as having done the role steps for the roles it holds TODAY. Role steps
--    start from this release: a role gained from now on runs its step once.
--    Without it every onboarded staff account — including the club's live
--    secretaries the week of the Oct 10 show and the E2E staff accounts — would
--    be pulled into onboarding on its next page load. Existing judges lose
--    nothing: every judge_qualifications row on the live database already has
--    a judge_number (2 of 2, checked 2026-10-03). Accounts that never finished
--    onboarding (staff the old flow skipped) are NOT backfilled: they get the
--    full flow — profile, dogs, their role steps — which is the change.
--
-- 2. public.set_my_judge_numbers(p_numbers jsonb)
--    judge_qualifications writes are staff-only (068 policies; the
--    replace_judge_qualifications RPC, MYK9-354), so a judge cannot record
--    their own number today. This SECURITY DEFINER RPC is the one self-service
--    path, and it is narrower than the table:
--      * the caller must hold an active `judge` role (has_role);
--      * the person is resolved server-side from auth.uid() via
--        people.auth_user_id — never from the payload (people.id <> auth uid);
--      * it only UPDATEs `judge_number` on qualification rows that ALREADY
--        exist for that person and organization. It never creates or deletes a
--        credential row (MYK9-354 stays true): a payload naming an organization
--        the judge holds no qualification for is refused.

ALTER TABLE public.exhibitor_profiles
  ADD COLUMN IF NOT EXISTS onboarded_roles text[] NOT NULL DEFAULT '{}'::text[];

ALTER TABLE public.exhibitor_profiles
  DROP CONSTRAINT IF EXISTS exhibitor_profiles_onboarded_roles_known;
ALTER TABLE public.exhibitor_profiles
  ADD CONSTRAINT exhibitor_profiles_onboarded_roles_known
  CHECK (onboarded_roles <@ ARRAY['judge', 'secretary', 'club_admin']::text[]);

UPDATE public.exhibitor_profiles ep
SET onboarded_roles = held.roles
FROM (
  SELECT p.auth_user_id, array_agg(DISTINCT r.name ORDER BY r.name) AS roles
  FROM public.people p
  JOIN public.user_roles ur ON ur.user_id = p.id AND ur.is_active
  JOIN public.roles r ON r.id = ur.role_id
  WHERE p.auth_user_id IS NOT NULL
    AND r.name IN ('judge', 'secretary', 'club_admin')
  GROUP BY p.auth_user_id
) AS held
WHERE ep.auth_user_id = held.auth_user_id
  AND ep.onboarding_completed_at IS NOT NULL;

COMMENT ON COLUMN public.exhibitor_profiles.onboarded_roles IS
  'Role onboarding steps this account has finished (judge, secretary, club_admin). A held role missing from this array gets its onboarding step once (MYK9-970).';

CREATE OR REPLACE FUNCTION public.set_my_judge_numbers(p_numbers jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_person_id uuid;
  v_entry record;
  v_updated integer;
  v_total integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in to save judge numbers' USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_role('judge') THEN
    RAISE EXCEPTION 'Only judges can save their own judge numbers' USING ERRCODE = '42501';
  END IF;

  SELECT p.id INTO v_person_id
  FROM public.people p
  WHERE p.auth_user_id = auth.uid()
    AND p.deleted_at IS NULL;

  IF v_person_id IS NULL THEN
    RAISE EXCEPTION 'No person record for this account' USING ERRCODE = '42501';
  END IF;

  IF p_numbers IS NULL OR jsonb_typeof(p_numbers) <> 'array' THEN
    RAISE EXCEPTION 'p_numbers must be a JSON array' USING ERRCODE = '22023';
  END IF;

  IF jsonb_array_length(p_numbers) > 20 THEN
    RAISE EXCEPTION 'Too many judge numbers in one save' USING ERRCODE = '22023';
  END IF;

  FOR v_entry IN
    SELECT x.organization, x.judge_number
    FROM jsonb_to_recordset(p_numbers) AS x(organization text, judge_number text)
  LOOP
    IF v_entry.organization IS NULL OR btrim(v_entry.organization) = '' THEN
      RAISE EXCEPTION 'Each judge number needs an organization' USING ERRCODE = '22023';
    END IF;

    IF length(v_entry.judge_number) > 50 THEN
      RAISE EXCEPTION 'Judge number is too long' USING ERRCODE = '22023';
    END IF;

    UPDATE public.judge_qualifications jq
    SET judge_number = NULLIF(btrim(v_entry.judge_number), ''),
        updated_at = now()
    WHERE jq.person_id = v_person_id
      AND jq.organization = v_entry.organization;

    GET DIAGNOSTICS v_updated = ROW_COUNT;

    IF v_updated = 0 THEN
      RAISE EXCEPTION 'No % judging qualification is on file for you', v_entry.organization
        USING ERRCODE = 'P0002';
    END IF;

    v_total := v_total + v_updated;
  END LOOP;

  RETURN v_total;
END;
$$;

REVOKE ALL ON FUNCTION public.set_my_judge_numbers(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_my_judge_numbers(jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.set_my_judge_numbers(jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.set_my_judge_numbers(jsonb) TO authenticated;

COMMENT ON FUNCTION public.set_my_judge_numbers(jsonb) IS
  'Self-service: a judge sets judge_number on their OWN existing judge_qualifications rows, per organization. Never creates or deletes qualification rows (MYK9-354). MYK9-970.';
