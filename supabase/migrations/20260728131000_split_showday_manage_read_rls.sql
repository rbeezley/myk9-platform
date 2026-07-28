-- MYK9-112: split authenticated ALL management policies away from broad reads.

DROP POLICY IF EXISTS "judge_assignments_write" ON public.judge_assignments;

CREATE POLICY "judge_assignments_insert"
  ON public.judge_assignments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT public.is_site_admin())
    OR EXISTS (
      SELECT 1
      FROM public.shows s
      WHERE s.id = judge_assignments.show_id
        AND (
          public.is_club_admin(s.club_id)
          OR public.is_trial_secretary(s.club_id)
          OR public.is_show_official(s.id)
        )
    )
  );

CREATE POLICY "judge_assignments_update"
  ON public.judge_assignments
  FOR UPDATE
  TO authenticated
  USING (
    (SELECT public.is_site_admin())
    OR EXISTS (
      SELECT 1
      FROM public.shows s
      WHERE s.id = judge_assignments.show_id
        AND (
          public.is_club_admin(s.club_id)
          OR public.is_trial_secretary(s.club_id)
          OR public.is_show_official(s.id)
        )
    )
  )
  WITH CHECK (
    (SELECT public.is_site_admin())
    OR EXISTS (
      SELECT 1
      FROM public.shows s
      WHERE s.id = judge_assignments.show_id
        AND (
          public.is_club_admin(s.club_id)
          OR public.is_trial_secretary(s.club_id)
          OR public.is_show_official(s.id)
        )
    )
  );

CREATE POLICY "judge_assignments_delete"
  ON public.judge_assignments
  FOR DELETE
  TO authenticated
  USING (
    (SELECT public.is_site_admin())
    OR EXISTS (
      SELECT 1
      FROM public.shows s
      WHERE s.id = judge_assignments.show_id
        AND (
          public.is_club_admin(s.club_id)
          OR public.is_trial_secretary(s.club_id)
          OR public.is_show_official(s.id)
        )
    )
  );

DROP POLICY IF EXISTS "offline_scoring_manage" ON public.offline_scoring;

CREATE POLICY "offline_scoring_insert"
  ON public.offline_scoring
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT public.is_club_admin())
    OR (SELECT public.is_trial_secretary())
    OR (SELECT public.is_platform_admin())
  );

CREATE POLICY "offline_scoring_update"
  ON public.offline_scoring
  FOR UPDATE
  TO authenticated
  USING (
    (SELECT public.is_club_admin())
    OR (SELECT public.is_trial_secretary())
    OR (SELECT public.is_platform_admin())
  )
  WITH CHECK (
    (SELECT public.is_club_admin())
    OR (SELECT public.is_trial_secretary())
    OR (SELECT public.is_platform_admin())
  );

CREATE POLICY "offline_scoring_delete"
  ON public.offline_scoring
  FOR DELETE
  TO authenticated
  USING (
    (SELECT public.is_club_admin())
    OR (SELECT public.is_trial_secretary())
    OR (SELECT public.is_platform_admin())
  );
