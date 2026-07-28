-- Forward-restoration template for MYK9-112.
-- Use only after confirming the applied catalog is exactly the reviewed MYK9-112
-- target. Copy this into a new timestamped migration; never edit hosted policies
-- manually. This restores the 70-policy baseline captured on 2026-07-28.

DO $$
DECLARE
  policy_record record;
BEGIN
  FOR policy_record IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = ANY (ARRAY[
        'dogs', 'enrollments', 'exhibitor_profiles', 'judge_assignments',
        'judge_availability', 'notification_queue', 'offline_scoring', 'people',
        'push_notification_queue', 'push_subscriptions', 'role_requests',
        'sport_class_rules', 'sport_templates', 'sport_titles', 'stripe_customers',
        'stripe_orders', 'stripe_subscriptions', 'sync_conflicts', 'vaccinations',
        'volunteer_class_assignments', 'volunteer_general_assignments',
        'volunteer_roles', 'volunteers'
      ])
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON %I.%I',
      policy_record.policyname,
      policy_record.schemaname,
      policy_record.tablename
    );
  END LOOP;
END
$$;

CREATE POLICY dogs_delete ON public.dogs AS PERMISSIVE FOR DELETE TO authenticated
  USING (((owner_id = (SELECT get_my_person_id())) OR (SELECT is_platform_admin())));
CREATE POLICY dogs_insert ON public.dogs AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((owner_id = (SELECT get_my_person_id())) OR (co_owner_id = (SELECT get_my_person_id())) OR (SELECT is_site_admin())));
CREATE POLICY dogs_insert_secretary ON public.dogs AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (((SELECT auth.uid()) IS NOT NULL AND (owner_id = (SELECT get_my_person_id()) OR EXISTS (
    SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
    WHERE ur.auth_user_id = (SELECT auth.uid())
      AND ur.is_active = true
      AND (ur.expires_at IS NULL OR ur.expires_at > now())
      AND r.name = ANY (ARRAY['secretary'::text, 'club_admin'::text, 'site_admin'::text, 'platform_admin'::text])
  ))));
CREATE POLICY dogs_select ON public.dogs AS PERMISSIVE FOR SELECT TO authenticated
  USING ((deleted_at IS NULL AND (
    owner_id = (SELECT get_my_person_id())
    OR co_owner_id = (SELECT get_my_person_id())
    OR (SELECT is_show_manager())
    OR id IN (SELECT get_my_handled_dog_ids())
  )));
CREATE POLICY dogs_update ON public.dogs AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((owner_id = (SELECT get_my_person_id()) OR co_owner_id = (SELECT get_my_person_id()) OR (SELECT can_manage_show_dog(dogs.id)) OR (SELECT is_site_admin())))
  WITH CHECK ((owner_id = (SELECT get_my_person_id()) OR co_owner_id = (SELECT get_my_person_id()) OR (SELECT can_manage_show_dog(dogs.id)) OR (SELECT is_site_admin())));

CREATE POLICY enrollments_insert_show_official ON public.enrollments AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((is_site_admin() OR is_show_official(show_id)));
CREATE POLICY registrations_insert_admin ON public.enrollments AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (is_platform_admin());
CREATE POLICY registrations_insert_own ON public.enrollments AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((handler_id IN (SELECT people.id FROM people WHERE people.auth_user_id = (SELECT auth.uid()))));
CREATE POLICY enrollments_select_show_official ON public.enrollments AS PERMISSIVE FOR SELECT TO public
  USING ((is_site_admin() OR is_show_official(show_id)));
CREATE POLICY enrollments_select_show_secretary ON public.enrollments AS PERMISSIVE FOR SELECT TO public
  USING ((EXISTS (
    SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
    WHERE ur.auth_user_id = (SELECT auth.uid())
      AND ur.is_active = true
      AND (ur.expires_at IS NULL OR ur.expires_at > now())
      AND r.name = ANY (ARRAY['secretary'::text, 'club_admin'::text, 'site_admin'::text, 'platform_admin'::text])
      AND (ur.show_id = enrollments.show_id OR ur.show_id IS NULL)
  )));
CREATE POLICY registrations_select_admin ON public.enrollments AS PERMISSIVE FOR SELECT TO public
  USING (is_platform_admin());
CREATE POLICY registrations_select_own ON public.enrollments AS PERMISSIVE FOR SELECT TO public
  USING ((handler_id IN (SELECT people.id FROM people WHERE people.auth_user_id = (SELECT auth.uid()))));
CREATE POLICY enrollments_update_show_official ON public.enrollments AS PERMISSIVE FOR UPDATE TO public
  USING ((is_site_admin() OR is_show_official(show_id)));
CREATE POLICY registrations_update_admin ON public.enrollments AS PERMISSIVE FOR UPDATE TO public
  USING (is_platform_admin());
CREATE POLICY registrations_update_own ON public.enrollments AS PERMISSIVE FOR UPDATE TO public
  USING ((handler_id IN (SELECT people.id FROM people WHERE people.auth_user_id = (SELECT auth.uid()))));

CREATE POLICY exhibitor_profiles_delete ON public.exhibitor_profiles AS PERMISSIVE FOR DELETE TO public
  USING ((SELECT is_site_admin()));
CREATE POLICY exhibitor_profiles_insert ON public.exhibitor_profiles AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((SELECT is_site_admin()) OR auth_user_id = (SELECT auth.uid()));
CREATE POLICY exhibitor_profiles_select ON public.exhibitor_profiles AS PERMISSIVE FOR SELECT TO public
  USING ((SELECT is_site_admin()) OR auth_user_id = (SELECT auth.uid()));
CREATE POLICY users_view_own_profile ON public.exhibitor_profiles AS PERMISSIVE FOR SELECT TO public
  USING (auth_user_id = (SELECT auth.uid()));
CREATE POLICY exhibitor_profiles_update ON public.exhibitor_profiles AS PERMISSIVE FOR UPDATE TO public
  USING ((SELECT is_site_admin()) OR auth_user_id = (SELECT auth.uid()));

CREATE POLICY judge_assignments_write ON public.judge_assignments AS PERMISSIVE FOR ALL TO authenticated
  USING ((SELECT is_site_admin()) OR EXISTS (
    SELECT 1 FROM shows s
    WHERE s.id = judge_assignments.show_id
      AND (is_club_admin(s.club_id) OR is_trial_secretary(s.club_id) OR is_show_official(s.id))
  ))
  WITH CHECK ((SELECT is_site_admin()) OR EXISTS (
    SELECT 1 FROM shows s
    WHERE s.id = judge_assignments.show_id
      AND (is_club_admin(s.club_id) OR is_trial_secretary(s.club_id) OR is_show_official(s.id))
  ));
CREATE POLICY judge_assignments_select ON public.judge_assignments AS PERMISSIVE FOR SELECT TO public
  USING (true);

CREATE POLICY "Admins can manage all availability" ON public.judge_availability AS PERMISSIVE FOR ALL TO public
  USING (is_platform_admin());
CREATE POLICY "Users can manage own availability" ON public.judge_availability AS PERMISSIVE FOR ALL TO public
  USING (person_id IN (SELECT people.id FROM people WHERE people.auth_user_id = (SELECT auth.uid())));
CREATE POLICY "Secretaries can view all availability" ON public.judge_availability AS PERMISSIVE FOR SELECT TO public
  USING (EXISTS (
    SELECT 1
    FROM people p
    JOIN user_roles ur ON ur.user_id = p.id
    JOIN roles r ON r.id = ur.role_id
    WHERE p.auth_user_id = (SELECT auth.uid())
      AND r.name = ANY (ARRAY['secretary'::text, 'site_admin'::text])
      AND ur.is_active = true
  ));
CREATE POLICY "Users can view own availability" ON public.judge_availability AS PERMISSIVE FOR SELECT TO public
  USING (person_id IN (SELECT people.id FROM people WHERE people.auth_user_id = (SELECT auth.uid())));

CREATE POLICY notification_queue_manage ON public.notification_queue AS PERMISSIVE FOR ALL TO authenticated
  USING ((SELECT is_platform_admin()));
CREATE POLICY notification_queue_select ON public.notification_queue AS PERMISSIVE FOR SELECT TO authenticated
  USING (user_id = (SELECT get_my_person_id()) OR (SELECT is_platform_admin()));

CREATE POLICY offline_scoring_manage ON public.offline_scoring AS PERMISSIVE FOR ALL TO authenticated
  USING ((SELECT is_club_admin()) OR (SELECT is_trial_secretary()) OR (SELECT is_platform_admin()));
CREATE POLICY offline_scoring_select ON public.offline_scoring AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY people_delete ON public.people AS PERMISSIVE FOR DELETE TO authenticated
  USING ((SELECT is_platform_admin()));
CREATE POLICY people_insert ON public.people AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (auth_user_id = (SELECT auth.uid()) OR (SELECT is_site_admin()));
CREATE POLICY people_insert_secretary ON public.people AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (auth_user_id IS NULL AND EXISTS (
    SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
    WHERE ur.auth_user_id = (SELECT auth.uid())
      AND ur.is_active = true
      AND (ur.expires_at IS NULL OR ur.expires_at > now())
      AND r.name = ANY (ARRAY['secretary'::text, 'club_admin'::text, 'site_admin'::text, 'platform_admin'::text])
  ));
CREATE POLICY people_select ON public.people AS PERMISSIVE FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND (auth_user_id = (SELECT auth.uid()) OR (SELECT is_show_manager())));
CREATE POLICY people_update_own ON public.people AS PERMISSIVE FOR UPDATE TO authenticated
  USING (auth_user_id = (SELECT auth.uid()))
  WITH CHECK (auth_user_id = (SELECT auth.uid()));
CREATE POLICY people_update_privileged ON public.people AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((SELECT can_manage_show_person(people.id)) OR (SELECT is_site_admin()))
  WITH CHECK ((SELECT can_manage_show_person(people.id)) OR (SELECT is_site_admin()));

CREATE POLICY push_notification_queue_manage ON public.push_notification_queue AS PERMISSIVE FOR ALL TO authenticated
  USING ((SELECT is_platform_admin()));
CREATE POLICY push_notification_queue_select ON public.push_notification_queue AS PERMISSIVE FOR SELECT TO authenticated
  USING (subscription_id IN (
    SELECT push_subscriptions.id FROM push_subscriptions
    WHERE push_subscriptions.user_id = (SELECT auth.uid())
  ) OR (SELECT is_platform_admin()));

CREATE POLICY "Users manage own subscriptions" ON public.push_subscriptions AS PERMISSIVE FOR ALL TO public
  USING ((SELECT auth.uid()) = user_id);
CREATE POLICY push_subscriptions_user_access ON public.push_subscriptions AS PERMISSIVE FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid()) OR (SELECT is_platform_admin()));

CREATE POLICY "Site admins can view role requests" ON public.role_requests AS PERMISSIVE FOR SELECT TO authenticated
  USING ((SELECT is_site_admin()));
CREATE POLICY "Users can view their own role requests" ON public.role_requests AS PERMISSIVE FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = auth_user_id);
CREATE POLICY "Site admins can update role requests" ON public.role_requests AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((SELECT is_site_admin()))
  WITH CHECK ((SELECT is_site_admin()));

CREATE POLICY sport_class_rules_modify ON public.sport_class_rules AS PERMISSIVE FOR ALL TO authenticated
  USING ((SELECT is_platform_admin()))
  WITH CHECK ((SELECT is_platform_admin()));
CREATE POLICY sport_class_rules_select ON public.sport_class_rules AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY sport_templates_modify ON public.sport_templates AS PERMISSIVE FOR ALL TO authenticated
  USING ((SELECT is_platform_admin()))
  WITH CHECK ((SELECT is_platform_admin()));
CREATE POLICY sport_templates_select ON public.sport_templates AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY sport_titles_modify ON public.sport_titles AS PERMISSIVE FOR ALL TO authenticated
  USING ((SELECT is_platform_admin()))
  WITH CHECK ((SELECT is_platform_admin()));
CREATE POLICY sport_titles_select ON public.sport_titles AS PERMISSIVE FOR SELECT TO public USING (true);

CREATE POLICY stripe_customers_manage ON public.stripe_customers AS PERMISSIVE FOR ALL TO authenticated
  USING ((SELECT is_platform_admin()));
CREATE POLICY stripe_customers_select ON public.stripe_customers AS PERMISSIVE FOR SELECT TO authenticated
  USING (person_id = (SELECT get_my_person_id()) OR (SELECT is_platform_admin()));
CREATE POLICY stripe_orders_manage ON public.stripe_orders AS PERMISSIVE FOR ALL TO authenticated
  USING ((SELECT is_platform_admin()));
CREATE POLICY stripe_orders_select ON public.stripe_orders AS PERMISSIVE FOR SELECT TO authenticated
  USING (customer_id IN (
    SELECT sc.id FROM stripe_customers sc WHERE sc.person_id = (SELECT get_my_person_id())
  ) OR (SELECT is_platform_admin()));
CREATE POLICY stripe_subscriptions_manage ON public.stripe_subscriptions AS PERMISSIVE FOR ALL TO authenticated
  USING ((SELECT is_platform_admin()));
CREATE POLICY stripe_subscriptions_select ON public.stripe_subscriptions AS PERMISSIVE FOR SELECT TO authenticated
  USING (customer_id IN (
    SELECT sc.id FROM stripe_customers sc WHERE sc.person_id = (SELECT get_my_person_id())
  ) OR (SELECT is_platform_admin()));

CREATE POLICY sync_conflicts_manage ON public.sync_conflicts AS PERMISSIVE FOR ALL TO authenticated
  USING ((SELECT is_platform_admin()));
CREATE POLICY sync_conflicts_select ON public.sync_conflicts AS PERMISSIVE FOR SELECT TO authenticated
  USING ((SELECT ((auth.jwt() ->> 'is_anonymous'::text))::boolean) IS NOT TRUE);

CREATE POLICY vaccinations_delete ON public.vaccinations AS PERMISSIVE FOR DELETE TO authenticated
  USING (dog_id IN (
    SELECT dogs.id FROM dogs
    WHERE dogs.owner_id = (SELECT get_my_person_id()) OR dogs.co_owner_id = (SELECT get_my_person_id())
  ) OR (SELECT is_platform_admin()));
CREATE POLICY vaccinations_insert ON public.vaccinations AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((
    dog_id IN (
      SELECT dogs.id FROM dogs
      WHERE dogs.owner_id = (SELECT get_my_person_id()) OR dogs.co_owner_id = (SELECT get_my_person_id())
    ) OR (SELECT is_platform_admin())
  ) AND ((SELECT has_effective_premium_access(get_my_person_id())) OR (SELECT is_platform_admin())));
CREATE POLICY vaccinations_secretary_select ON public.vaccinations AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_trial_secretary());
CREATE POLICY vaccinations_select ON public.vaccinations AS PERMISSIVE FOR SELECT TO authenticated
  USING (dog_id IN (
    SELECT dogs.id FROM dogs
    WHERE dogs.owner_id = (SELECT get_my_person_id()) OR dogs.co_owner_id = (SELECT get_my_person_id())
  ) OR (SELECT is_platform_admin()));
CREATE POLICY vaccinations_update ON public.vaccinations AS PERMISSIVE FOR UPDATE TO authenticated
  USING (dog_id IN (
    SELECT dogs.id FROM dogs
    WHERE dogs.owner_id = (SELECT get_my_person_id()) OR dogs.co_owner_id = (SELECT get_my_person_id())
  ) OR (SELECT is_platform_admin()))
  WITH CHECK ((
    dog_id IN (
      SELECT dogs.id FROM dogs
      WHERE dogs.owner_id = (SELECT get_my_person_id()) OR dogs.co_owner_id = (SELECT get_my_person_id())
    ) OR (SELECT is_platform_admin())
  ) AND ((SELECT has_effective_premium_access(get_my_person_id())) OR (SELECT is_platform_admin())));

CREATE POLICY "Show managers can manage class assignments" ON public.volunteer_class_assignments AS PERMISSIVE FOR ALL TO authenticated
  USING ((SELECT can_manage_show(volunteer_show_id(volunteer_class_assignments.volunteer_id))));
CREATE POLICY "Authenticated users can view class assignments" ON public.volunteer_class_assignments AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);
CREATE POLICY "Show managers can manage general assignments" ON public.volunteer_general_assignments AS PERMISSIVE FOR ALL TO authenticated
  USING ((SELECT can_manage_show(volunteer_general_assignments.show_id)));
CREATE POLICY "Authenticated users can view general assignments" ON public.volunteer_general_assignments AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);
CREATE POLICY volunteer_roles_manage ON public.volunteer_roles AS PERMISSIVE FOR ALL TO authenticated
  USING ((SELECT is_club_admin()) OR (SELECT is_trial_secretary()) OR (SELECT is_platform_admin()));
CREATE POLICY volunteer_roles_select ON public.volunteer_roles AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);
CREATE POLICY "Show managers can manage volunteers" ON public.volunteers AS PERMISSIVE FOR ALL TO authenticated
  USING ((SELECT can_manage_show(volunteers.show_id)));
CREATE POLICY "Authenticated users can view volunteers" ON public.volunteers AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);
