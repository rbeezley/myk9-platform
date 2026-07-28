-- MYK9-112: consolidate the public judge_availability policies by command.
-- dogs INSERT and push_subscriptions ALL remain intentionally layered because
-- their public and authenticated role sets cannot be merged without changing
-- effective access for hosted public-member roles.

DROP POLICY IF EXISTS "Admins can manage all availability" ON public.judge_availability;
DROP POLICY IF EXISTS "Users can manage own availability" ON public.judge_availability;
DROP POLICY IF EXISTS "Secretaries can view all availability" ON public.judge_availability;
DROP POLICY IF EXISTS "Users can view own availability" ON public.judge_availability;

CREATE POLICY "judge_availability_insert"
  ON public.judge_availability
  FOR INSERT
  TO public
  WITH CHECK (
    public.is_platform_admin()
    OR person_id IN (
      SELECT p.id
      FROM public.people p
      WHERE p.auth_user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "judge_availability_select"
  ON public.judge_availability
  FOR SELECT
  TO public
  USING (
    public.is_platform_admin()
    OR person_id IN (
      SELECT p.id
      FROM public.people p
      WHERE p.auth_user_id = (SELECT auth.uid())
    )
    OR EXISTS (
      SELECT 1
      FROM public.people p
      JOIN public.user_roles ur ON ur.user_id = p.id
      JOIN public.roles r ON r.id = ur.role_id
      WHERE p.auth_user_id = (SELECT auth.uid())
        AND r.name = ANY (ARRAY['secretary'::text, 'site_admin'::text])
        AND ur.is_active = true
    )
  );

CREATE POLICY "judge_availability_update"
  ON public.judge_availability
  FOR UPDATE
  TO public
  USING (
    public.is_platform_admin()
    OR person_id IN (
      SELECT p.id
      FROM public.people p
      WHERE p.auth_user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    public.is_platform_admin()
    OR person_id IN (
      SELECT p.id
      FROM public.people p
      WHERE p.auth_user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "judge_availability_delete"
  ON public.judge_availability
  FOR DELETE
  TO public
  USING (
    public.is_platform_admin()
    OR person_id IN (
      SELECT p.id
      FROM public.people p
      WHERE p.auth_user_id = (SELECT auth.uid())
    )
  );
