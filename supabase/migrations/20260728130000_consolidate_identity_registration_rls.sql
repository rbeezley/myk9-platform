-- MYK9-112: consolidate same-command permissive policies without changing
-- effective row access. Applied pg_policies expressions captured 2026-07-28.

-- enrollments: exact OR of the former official, secretary, admin, and own paths.
DROP POLICY IF EXISTS "enrollments_insert_show_official" ON public.enrollments;
DROP POLICY IF EXISTS "registrations_insert_admin" ON public.enrollments;
DROP POLICY IF EXISTS "registrations_insert_own" ON public.enrollments;
DROP POLICY IF EXISTS "enrollments_select_show_official" ON public.enrollments;
DROP POLICY IF EXISTS "enrollments_select_show_secretary" ON public.enrollments;
DROP POLICY IF EXISTS "registrations_select_admin" ON public.enrollments;
DROP POLICY IF EXISTS "registrations_select_own" ON public.enrollments;
DROP POLICY IF EXISTS "enrollments_update_show_official" ON public.enrollments;
DROP POLICY IF EXISTS "registrations_update_admin" ON public.enrollments;
DROP POLICY IF EXISTS "registrations_update_own" ON public.enrollments;

CREATE POLICY "enrollments_insert"
  ON public.enrollments
  FOR INSERT
  TO public
  WITH CHECK (
    public.is_site_admin()
    OR public.is_show_official(show_id)
    OR public.is_platform_admin()
    OR handler_id IN (
      SELECT p.id
      FROM public.people p
      WHERE p.auth_user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "enrollments_select"
  ON public.enrollments
  FOR SELECT
  TO public
  USING (
    public.is_site_admin()
    OR public.is_show_official(show_id)
    OR public.is_platform_admin()
    OR handler_id IN (
      SELECT p.id
      FROM public.people p
      WHERE p.auth_user_id = (SELECT auth.uid())
    )
    OR EXISTS (
      SELECT 1
      FROM public.user_roles ur
      JOIN public.roles r ON r.id = ur.role_id
      WHERE ur.auth_user_id = (SELECT auth.uid())
        AND ur.is_active = true
        AND (ur.expires_at IS NULL OR ur.expires_at > now())
        AND r.name = ANY (
          ARRAY[
            'secretary'::text,
            'club_admin'::text,
            'site_admin'::text,
            'platform_admin'::text
          ]
        )
        AND (ur.show_id = enrollments.show_id OR ur.show_id IS NULL)
    )
  );

CREATE POLICY "enrollments_update"
  ON public.enrollments
  FOR UPDATE
  TO public
  USING (
    public.is_site_admin()
    OR public.is_show_official(show_id)
    OR public.is_platform_admin()
    OR handler_id IN (
      SELECT p.id
      FROM public.people p
      WHERE p.auth_user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    public.is_site_admin()
    OR public.is_show_official(show_id)
    OR public.is_platform_admin()
    OR handler_id IN (
      SELECT p.id
      FROM public.people p
      WHERE p.auth_user_id = (SELECT auth.uid())
    )
  );

-- exhibitor_profiles: users_view_own_profile was a strict subset.
DROP POLICY IF EXISTS "exhibitor_profiles_select" ON public.exhibitor_profiles;
DROP POLICY IF EXISTS "users_view_own_profile" ON public.exhibitor_profiles;

CREATE POLICY "exhibitor_profiles_select"
  ON public.exhibitor_profiles
  FOR SELECT
  TO public
  USING (
    (SELECT public.is_site_admin())
    OR auth_user_id = (SELECT auth.uid())
  );

-- people: preserve self/site-admin inserts plus role-gated unclaimed-person inserts.
DROP POLICY IF EXISTS "people_insert" ON public.people;
DROP POLICY IF EXISTS "people_insert_secretary" ON public.people;
DROP POLICY IF EXISTS "people_update_own" ON public.people;
DROP POLICY IF EXISTS "people_update_privileged" ON public.people;

CREATE POLICY "people_insert"
  ON public.people
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth_user_id = (SELECT auth.uid())
    OR (SELECT public.is_site_admin())
    OR (
      auth_user_id IS NULL
      AND EXISTS (
        SELECT 1
        FROM public.user_roles ur
        JOIN public.roles r ON r.id = ur.role_id
        WHERE ur.auth_user_id = (SELECT auth.uid())
          AND ur.is_active = true
          AND (ur.expires_at IS NULL OR ur.expires_at > now())
          AND r.name = ANY (
            ARRAY[
              'secretary'::text,
              'club_admin'::text,
              'site_admin'::text,
              'platform_admin'::text
            ]
          )
      )
    )
  );

CREATE POLICY "people_update"
  ON public.people
  FOR UPDATE
  TO authenticated
  USING (
    auth_user_id = (SELECT auth.uid())
    OR (SELECT public.can_manage_show_person(people.id))
    OR (SELECT public.is_site_admin())
  )
  WITH CHECK (
    auth_user_id = (SELECT auth.uid())
    OR (SELECT public.can_manage_show_person(people.id))
    OR (SELECT public.is_site_admin())
  );

-- role_requests: exact OR of own-row and site-admin visibility.
DROP POLICY IF EXISTS "Site admins can view role requests" ON public.role_requests;
DROP POLICY IF EXISTS "Users can view their own role requests" ON public.role_requests;

CREATE POLICY "role_requests_select"
  ON public.role_requests
  FOR SELECT
  TO authenticated
  USING (
    (SELECT public.is_site_admin())
    OR auth_user_id = (SELECT auth.uid())
  );

-- vaccinations: exact OR of owner/co-owner/admin and trial-secretary visibility.
DROP POLICY IF EXISTS "vaccinations_select" ON public.vaccinations;
DROP POLICY IF EXISTS "vaccinations_secretary_select" ON public.vaccinations;

CREATE POLICY "vaccinations_select"
  ON public.vaccinations
  FOR SELECT
  TO authenticated
  USING (
    dog_id IN (
      SELECT d.id
      FROM public.dogs d
      WHERE d.owner_id = (SELECT public.get_my_person_id())
        OR d.co_owner_id = (SELECT public.get_my_person_id())
    )
    OR (SELECT public.is_platform_admin())
    OR public.is_trial_secretary()
  );
