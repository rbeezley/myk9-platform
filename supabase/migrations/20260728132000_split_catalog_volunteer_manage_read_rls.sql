-- MYK9-112: split catalog and volunteer ALL management policies from reads.

DROP POLICY IF EXISTS "sport_class_rules_modify" ON public.sport_class_rules;

CREATE POLICY "sport_class_rules_manage_insert"
  ON public.sport_class_rules
  FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT public.is_platform_admin()));

CREATE POLICY "sport_class_rules_manage_update"
  ON public.sport_class_rules
  FOR UPDATE
  TO authenticated
  USING ((SELECT public.is_platform_admin()))
  WITH CHECK ((SELECT public.is_platform_admin()));

CREATE POLICY "sport_class_rules_manage_delete"
  ON public.sport_class_rules
  FOR DELETE
  TO authenticated
  USING ((SELECT public.is_platform_admin()));

DROP POLICY IF EXISTS "sport_templates_modify" ON public.sport_templates;

CREATE POLICY "sport_templates_manage_insert"
  ON public.sport_templates
  FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT public.is_platform_admin()));

CREATE POLICY "sport_templates_manage_update"
  ON public.sport_templates
  FOR UPDATE
  TO authenticated
  USING ((SELECT public.is_platform_admin()))
  WITH CHECK ((SELECT public.is_platform_admin()));

CREATE POLICY "sport_templates_manage_delete"
  ON public.sport_templates
  FOR DELETE
  TO authenticated
  USING ((SELECT public.is_platform_admin()));

DROP POLICY IF EXISTS "sport_titles_modify" ON public.sport_titles;

CREATE POLICY "sport_titles_manage_insert"
  ON public.sport_titles
  FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT public.is_platform_admin()));

CREATE POLICY "sport_titles_manage_update"
  ON public.sport_titles
  FOR UPDATE
  TO authenticated
  USING ((SELECT public.is_platform_admin()))
  WITH CHECK ((SELECT public.is_platform_admin()));

CREATE POLICY "sport_titles_manage_delete"
  ON public.sport_titles
  FOR DELETE
  TO authenticated
  USING ((SELECT public.is_platform_admin()));

DROP POLICY IF EXISTS "Show managers can manage class assignments"
  ON public.volunteer_class_assignments;

CREATE POLICY "volunteer_class_assignments_manage_insert"
  ON public.volunteer_class_assignments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT public.can_manage_show(public.volunteer_show_id(volunteer_id)))
  );

CREATE POLICY "volunteer_class_assignments_manage_update"
  ON public.volunteer_class_assignments
  FOR UPDATE
  TO authenticated
  USING (
    (SELECT public.can_manage_show(public.volunteer_show_id(volunteer_id)))
  )
  WITH CHECK (
    (SELECT public.can_manage_show(public.volunteer_show_id(volunteer_id)))
  );

CREATE POLICY "volunteer_class_assignments_manage_delete"
  ON public.volunteer_class_assignments
  FOR DELETE
  TO authenticated
  USING (
    (SELECT public.can_manage_show(public.volunteer_show_id(volunteer_id)))
  );

DROP POLICY IF EXISTS "Show managers can manage general assignments"
  ON public.volunteer_general_assignments;

CREATE POLICY "volunteer_general_assignments_manage_insert"
  ON public.volunteer_general_assignments
  FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT public.can_manage_show(show_id)));

CREATE POLICY "volunteer_general_assignments_manage_update"
  ON public.volunteer_general_assignments
  FOR UPDATE
  TO authenticated
  USING ((SELECT public.can_manage_show(show_id)))
  WITH CHECK ((SELECT public.can_manage_show(show_id)));

CREATE POLICY "volunteer_general_assignments_manage_delete"
  ON public.volunteer_general_assignments
  FOR DELETE
  TO authenticated
  USING ((SELECT public.can_manage_show(show_id)));

DROP POLICY IF EXISTS "volunteer_roles_manage" ON public.volunteer_roles;

CREATE POLICY "volunteer_roles_manage_insert"
  ON public.volunteer_roles
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT public.is_club_admin())
    OR (SELECT public.is_trial_secretary())
    OR (SELECT public.is_platform_admin())
  );

CREATE POLICY "volunteer_roles_manage_update"
  ON public.volunteer_roles
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

CREATE POLICY "volunteer_roles_manage_delete"
  ON public.volunteer_roles
  FOR DELETE
  TO authenticated
  USING (
    (SELECT public.is_club_admin())
    OR (SELECT public.is_trial_secretary())
    OR (SELECT public.is_platform_admin())
  );

DROP POLICY IF EXISTS "Show managers can manage volunteers" ON public.volunteers;

CREATE POLICY "volunteers_manage_insert"
  ON public.volunteers
  FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT public.can_manage_show(show_id)));

CREATE POLICY "volunteers_manage_update"
  ON public.volunteers
  FOR UPDATE
  TO authenticated
  USING ((SELECT public.can_manage_show(show_id)))
  WITH CHECK ((SELECT public.can_manage_show(show_id)));

CREATE POLICY "volunteers_manage_delete"
  ON public.volunteers
  FOR DELETE
  TO authenticated
  USING ((SELECT public.can_manage_show(show_id)));
