-- MYK9-147: separate office administration from show-day steward access (migration 20260801160000).
--
-- is_show_official() intentionally includes stewards for ringside reads and
-- show-day operations. It must not be reused for enrollment or judge-contract
-- mutations: those remain limited to club-admin / secretary / site-admin
-- managers. These are replacement policies; no existing policy is edited.

CREATE OR REPLACE FUNCTION public.is_show_office_manager(check_show_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.shows s
    WHERE s.id = check_show_id
      AND (
        (SELECT public.is_site_admin())
        OR (SELECT public.is_club_admin(s.club_id))
        OR EXISTS (
          SELECT 1
          FROM public.user_roles ur
          JOIN public.roles r ON r.id = ur.role_id
          WHERE ur.auth_user_id = auth.uid()
            AND ur.is_active = true
            AND (ur.expires_at IS NULL OR ur.expires_at > now())
            AND r.name IN ('secretary', 'trial_secretary')
            AND (
              ur.show_id = check_show_id
              OR (ur.show_id IS NULL AND ur.club_id = s.club_id)
            )
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.is_show_office_manager(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_show_office_manager(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.is_show_office_manager(uuid) IS
  'MYK9-147: office mutations only; site admin, club admin, or current show/club secretary. Stewards and chairmen are intentionally excluded.';

DROP POLICY IF EXISTS "judge_assignments_insert" ON public.judge_assignments;
DROP POLICY IF EXISTS "judge_assignments_update" ON public.judge_assignments;
DROP POLICY IF EXISTS "judge_assignments_delete" ON public.judge_assignments;

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
          public.is_show_office_manager(s.id)
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
          public.is_show_office_manager(s.id)
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
          public.is_show_office_manager(s.id)
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
          public.is_show_office_manager(s.id)
        )
    )
  );

-- Keep the existing enrollment SELECT policy unchanged: the steward role may
-- still read show-day data. Only INSERT/UPDATE are office-administration
-- mutations and therefore lose the broad show-official arm.

DROP POLICY IF EXISTS "enrollments_insert" ON public.enrollments;
CREATE POLICY "enrollments_insert"
  ON public.enrollments
  FOR INSERT
  TO public
  WITH CHECK (
    public.is_site_admin()
    OR public.is_platform_admin()
    OR EXISTS (
      SELECT 1
      FROM public.shows s
      WHERE s.id = enrollments.show_id
        AND (
          public.is_show_office_manager(s.id)
        )
    )
    OR handler_id IN (
      SELECT p.id
      FROM public.people p
      WHERE p.auth_user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "enrollments_update" ON public.enrollments;
CREATE POLICY "enrollments_update"
  ON public.enrollments
  FOR UPDATE
  TO public
  USING (
    public.is_site_admin()
    OR public.is_platform_admin()
    OR EXISTS (
      SELECT 1
      FROM public.shows s
      WHERE s.id = enrollments.show_id
        AND (
          public.is_show_office_manager(s.id)
        )
    )
    OR handler_id IN (
      SELECT p.id
      FROM public.people p
      WHERE p.auth_user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    public.is_site_admin()
    OR public.is_platform_admin()
    OR EXISTS (
      SELECT 1
      FROM public.shows s
      WHERE s.id = enrollments.show_id
        AND (
          public.is_show_office_manager(s.id)
        )
    )
    OR handler_id IN (
      SELECT p.id
      FROM public.people p
      WHERE p.auth_user_id = (SELECT auth.uid())
    )
  );

COMMENT ON POLICY "judge_assignments_insert" ON public.judge_assignments IS
  'MYK9-147: office writes require site admin, club admin, or trial secretary; stewards retain show-day reads only.';
COMMENT ON POLICY "enrollments_insert" ON public.enrollments IS
  'MYK9-147: office enrollment writes exclude steward/chairman show-official roles.';

NOTIFY pgrst, 'reload schema';
