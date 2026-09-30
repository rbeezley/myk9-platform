-- MYK9-819/829: A validated staff passcode session can score a draft show, but
-- shows_select/trials_select/classes_select hide its structure from that session.
-- The passcode Auth user is Supabase-anonymous but uses the authenticated DB
-- role. Signed-out anon policies remain untouched. The current-generation check
-- prevents a regenerated code's old JWT from continuing to read draft rows.
-- Based on the latest policy definitions in 20260926201500.
BEGIN;

CREATE FUNCTION private.get_current_ringside_staff_show_id()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN (auth.jwt() -> 'app_metadata' ->> 'kind') = 'ringside_passcode'
      AND (auth.jwt() -> 'app_metadata' ->> 'ringside_role') IN ('judge', 'steward', 'admin')
      AND (SELECT public.ringside_claim_generation_current()) IS TRUE
    THEN NULLIF((auth.jwt() -> 'app_metadata' ->> 'show_id'), '')
    ELSE NULL
  END;
$$;

COMMENT ON FUNCTION private.get_current_ringside_staff_show_id() IS
  'MYK9-819/829: exact show id (as text) only for a current server-stamped judge, steward, or admin passcode claim. Text comparison avoids casting malformed claim material. Used solely for draft show structure reads.';
REVOKE ALL ON FUNCTION private.get_current_ringside_staff_show_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.get_current_ringside_staff_show_id() TO authenticated;

DROP POLICY IF EXISTS shows_select ON public.shows;
CREATE POLICY shows_select ON public.shows FOR SELECT TO authenticated
  USING (
    (SELECT public.is_site_admin())
    OR (
      deleted_at IS NULL
      AND (
        status = ANY (ARRAY['published'::text, 'upcoming'::text, 'in_progress'::text, 'completed'::text])
        OR (club_id IS NOT NULL AND (SELECT public.is_club_admin(shows.club_id)))
        OR (SELECT public.is_show_secretary(shows.id))
        OR id IN (SELECT private.get_my_judge_assigned_show_ids())
        OR id::text = (SELECT private.get_current_ringside_staff_show_id())
      )
    )
  );

ALTER POLICY trials_select ON public.trials
  USING (
    trials.show_id IN (
      SELECT s.id
      FROM public.shows s
      WHERE (
          s.status IN ('published', 'upcoming', 'in_progress', 'completed')
          AND s.deleted_at IS NULL
        )
        OR (s.club_id IS NOT NULL AND (SELECT public.is_club_admin(s.club_id)))
        OR (s.club_id IS NOT NULL AND (SELECT public.is_trial_secretary(s.club_id)))
        OR (SELECT public.is_platform_admin())
        OR s.id IN (SELECT private.get_my_judge_assigned_show_ids())
        OR (
          s.deleted_at IS NULL
          AND s.id::text = (SELECT private.get_current_ringside_staff_show_id())
        )
    )
  );

ALTER POLICY classes_select ON public.classes
  USING (
    classes.deleted_at IS NULL
    AND classes.trial_id IN (
      SELECT t.id
      FROM public.trials t
      JOIN public.shows s ON s.id = t.show_id
      WHERE (
          s.status IN ('published', 'upcoming', 'in_progress', 'completed')
          AND s.deleted_at IS NULL
        )
        OR (s.club_id IS NOT NULL AND (SELECT public.is_club_admin(s.club_id)))
        OR (s.club_id IS NOT NULL AND (SELECT public.is_trial_secretary(s.club_id)))
        OR (SELECT public.is_platform_admin())
        OR s.id IN (SELECT private.get_my_judge_assigned_show_ids())
        OR (
          s.deleted_at IS NULL
          AND s.id::text = (SELECT private.get_current_ringside_staff_show_id())
        )
    )
  );

COMMIT;
