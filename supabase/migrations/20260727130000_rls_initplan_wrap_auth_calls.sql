-- RLS performance: wrap per-row auth.<fn>() calls in scalar subselects.
--
-- WHY
-- Supabase's `auth_rls_initplan` linter reported 73 findings across 31 tables: RLS
-- policies calling `auth.uid()` / `auth.role()` directly. Postgres cannot hoist a
-- bare function call out of a row filter, so the function re-executes for EVERY ROW
-- SCANNED. Wrapping it as `( SELECT auth.uid() )` turns it into an InitPlan that is
-- evaluated ONCE per query.
-- https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select
--
-- This is invisible on today's data (50 MB, 33 entries) and compounds with
-- rows x concurrent sessions — i.e. exactly a show weekend. It is the mechanism
-- behind the cumulative scan counters observed on 2026-07-26:
--   user_roles         407M seq scans
--   judge_assignments  360M seq scans vs 552K index scans (650:1)
--   show_passcodes     24.6M seq scans vs 799 index scans
--
-- SAFETY: THIS MIGRATION CANNOT CHANGE WHO CAN SEE WHAT.
--   1. Every expression below was emitted by Postgres itself via
--      `pg_get_expr(polqual/polwithcheck)`, then had exactly one textual
--      substitution applied: `auth.uid()` -> `( SELECT auth.uid() )` and
--      `auth.role()` -> `( SELECT auth.role() )`. Nothing else was edited.
--   2. `auth.uid()` / `auth.role()` are STABLE and take no arguments, so a scalar
--      subselect returns the identical value. Wrapping is semantics-preserving by
--      construction — it changes WHEN the call is evaluated, never WHAT it returns.
--   3. `ALTER POLICY` (not DROP + CREATE) is used deliberately: the policy is never
--      absent mid-migration, and command/roles/permissive-vs-restrictive cannot be
--      accidentally altered, because this statement form cannot express them.
--   4. Pre-flight verified zero double-wrap risk: no flagged policy already
--      contained a wrapped `auth.uid()`, so the substitution is unambiguous.
--
-- 71 policies are rewritten here, not 73. Two advisor findings
-- (`platform_settings_select`, `sync_conflicts_select`) already wrap their
-- `auth.jwt()` call as `( SELECT ((auth.jwt() ->> 'is_anonymous'))::boolean )` and
-- need no change; the linter appears to match them by pattern regardless.
--
-- DELIBERATELY OUT OF SCOPE (do not fold in — different risk profile):
--   * 72 `multiple_permissive_policies` findings. Consolidating overlapping
--     permissive policies CHANGES ACCESS SEMANTICS and needs per-table review with
--     tests. Tracked separately.
--   * Helper calls taking a COLUMN argument — `is_club_admin(club_id)`,
--     `can_manage_show(x.show_id)`, `is_trial_secretary(s.club_id)`. These are
--     correlated per row by definition; wrapping them in a subselect would NOT
--     hoist them and could mislead a future reader. Left exactly as-is.
--   * Zero-arg helpers still bare in a few policies (`is_site_admin()`,
--     `is_platform_admin()`). Safe to wrap in principle, but they are already
--     wrapped in most policies and are not what the linter flagged; keeping this
--     migration to a single mechanical rule keeps it reviewable.
--
-- VERIFY AFTER PUSH (expect zero rows):
--   select c.relname, p.polname
--   from pg_policy p
--   join pg_class c on c.oid = p.polrelid
--   join pg_namespace n on n.oid = c.relnamespace
--   where n.nspname = 'public'
--     and strpos(
--           replace(
--             coalesce(pg_get_expr(p.polqual, p.polrelid), '') || '|' ||
--             coalesce(pg_get_expr(p.polwithcheck, p.polrelid), ''),
--             'SELECT auth.uid()', ''),
--           'auth.uid()') > 0;
--
-- Then re-run the performance advisor: `auth_rls_initplan` should drop 73 -> 2.

ALTER POLICY activity_log_insert ON public.activity_log
  WITH CHECK ((actor_id = ( SELECT auth.uid() )));

ALTER POLICY activity_log_select ON public.activity_log
  USING ((( SELECT auth.uid() ) IS NOT NULL));

ALTER POLICY "Users can insert their own events" ON public.analytics_events
  WITH CHECK ((user_id = ( SELECT auth.uid() )));

ALTER POLICY "Authenticated users can insert own chatbot_feedback" ON public.chatbot_feedback
  WITH CHECK ((user_id = ( SELECT auth.uid() )));

ALTER POLICY club_access_requests_select_own_or_site_admin ON public.club_access_requests
  USING (((requester_auth_user_id = ( SELECT auth.uid() )) OR is_site_admin()));

ALTER POLICY club_members_select ON public.club_members
  USING ((is_club_admin(club_id) OR is_platform_admin() OR (person_id = ( SELECT auth.uid() ))));

ALTER POLICY club_officers_select ON public.club_officers
  USING ((is_club_admin(club_id) OR is_platform_admin() OR (person_id = ( SELECT auth.uid() ))));

ALTER POLICY dogs_insert_secretary ON public.dogs
  WITH CHECK (((( SELECT auth.uid() ) IS NOT NULL) AND ((owner_id = ( SELECT get_my_person_id() AS get_my_person_id)) OR (EXISTS ( SELECT 1
   FROM (user_roles ur
     JOIN roles r ON ((r.id = ur.role_id)))
  WHERE ((ur.auth_user_id = ( SELECT auth.uid() )) AND (ur.is_active = true) AND ((ur.expires_at IS NULL) OR (ur.expires_at > now())) AND (r.name = ANY (ARRAY['secretary'::text, 'club_admin'::text, 'site_admin'::text, 'platform_admin'::text]))))))));

ALTER POLICY enrollments_select_show_secretary ON public.enrollments
  USING ((EXISTS ( SELECT 1
   FROM (user_roles ur
     JOIN roles r ON ((r.id = ur.role_id)))
  WHERE ((ur.auth_user_id = ( SELECT auth.uid() )) AND (ur.is_active = true) AND ((ur.expires_at IS NULL) OR (ur.expires_at > now())) AND (r.name = ANY (ARRAY['secretary'::text, 'club_admin'::text, 'site_admin'::text, 'platform_admin'::text])) AND ((ur.show_id = enrollments.show_id) OR (ur.show_id IS NULL))))));

ALTER POLICY registrations_insert_own ON public.enrollments
  WITH CHECK ((handler_id IN ( SELECT people.id
   FROM people
  WHERE (people.auth_user_id = ( SELECT auth.uid() )))));

ALTER POLICY registrations_select_own ON public.enrollments
  USING ((handler_id IN ( SELECT people.id
   FROM people
  WHERE (people.auth_user_id = ( SELECT auth.uid() )))));

ALTER POLICY registrations_update_own ON public.enrollments
  USING ((handler_id IN ( SELECT people.id
   FROM people
  WHERE (people.auth_user_id = ( SELECT auth.uid() )))));

ALTER POLICY entries_insert ON public.entries
  WITH CHECK ((is_site_admin() OR (EXISTS ( SELECT 1
   FROM ((user_roles ur
     JOIN roles r ON ((r.id = ur.role_id)))
     JOIN people p ON ((p.id = ur.user_id)))
  WHERE ((p.auth_user_id = ( SELECT auth.uid() )) AND (ur.is_active = true) AND ((ur.expires_at IS NULL) OR (ur.expires_at > now())) AND (r.name = ANY (ARRAY['secretary'::text, 'trial_secretary'::text, 'club_admin'::text, 'site_admin'::text])))))));

ALTER POLICY entries_select ON public.entries
  USING ((( SELECT can_manage_show(entries.show_id) AS can_manage_show) OR (EXISTS ( SELECT 1
   FROM people p
  WHERE ((p.auth_user_id = ( SELECT auth.uid() )) AND (p.id = entries.handler_id)))) OR (EXISTS ( SELECT 1
   FROM (people p
     JOIN dogs d ON ((d.owner_id = p.id)))
  WHERE ((p.auth_user_id = ( SELECT auth.uid() )) AND (d.id = entries.dog_id))))));

ALTER POLICY users_view_own_profile ON public.exhibitor_profiles
  USING ((auth_user_id = ( SELECT auth.uid() )));

ALTER POLICY "Users can create own genetic screenings" ON public.genetic_screenings
  WITH CHECK (((( SELECT auth.uid() ) = owner_id) AND ( SELECT has_effective_premium_access(get_my_person_id()) AS has_effective_premium_access)));

ALTER POLICY "Users can delete own genetic screenings" ON public.genetic_screenings
  USING ((( SELECT auth.uid() ) = owner_id));

ALTER POLICY "Users can update own genetic screenings" ON public.genetic_screenings
  USING ((( SELECT auth.uid() ) = owner_id))
  WITH CHECK (((( SELECT auth.uid() ) = owner_id) AND ( SELECT has_effective_premium_access(get_my_person_id()) AS has_effective_premium_access)));

ALTER POLICY "Users can view own genetic screenings" ON public.genetic_screenings
  USING ((( SELECT auth.uid() ) = owner_id));

ALTER POLICY "Secretaries can view all availability" ON public.judge_availability
  USING ((EXISTS ( SELECT 1
   FROM ((people p
     JOIN user_roles ur ON ((ur.user_id = p.id)))
     JOIN roles r ON ((r.id = ur.role_id)))
  WHERE ((p.auth_user_id = ( SELECT auth.uid() )) AND (r.name = ANY (ARRAY['secretary'::text, 'site_admin'::text])) AND (ur.is_active = true)))));

ALTER POLICY "Users can manage own availability" ON public.judge_availability
  USING ((person_id IN ( SELECT people.id
   FROM people
  WHERE (people.auth_user_id = ( SELECT auth.uid() )))));

ALTER POLICY "Users can view own availability" ON public.judge_availability
  USING ((person_id IN ( SELECT people.id
   FROM people
  WHERE (people.auth_user_id = ( SELECT auth.uid() )))));

ALTER POLICY "Users can create own manual results" ON public.manual_results
  WITH CHECK (((( SELECT auth.uid() ) = owner_id) AND ( SELECT has_effective_premium_access(get_my_person_id()) AS has_effective_premium_access)));

ALTER POLICY "Users can delete own manual results" ON public.manual_results
  USING ((( SELECT auth.uid() ) = owner_id));

ALTER POLICY "Users can update own manual results" ON public.manual_results
  USING ((( SELECT auth.uid() ) = owner_id))
  WITH CHECK (((( SELECT auth.uid() ) = owner_id) AND ( SELECT has_effective_premium_access(get_my_person_id()) AS has_effective_premium_access)));

ALTER POLICY "Users can view own manual results" ON public.manual_results
  USING ((( SELECT auth.uid() ) = owner_id));

ALTER POLICY "notifications: insert own or service" ON public.notifications
  WITH CHECK (((( SELECT auth.uid() ) = user_id) OR (( SELECT auth.role() ) = 'service_role'::text)));

ALTER POLICY "notifications: select own" ON public.notifications
  USING ((( SELECT auth.uid() ) = user_id));

ALTER POLICY "notifications: update own" ON public.notifications
  USING ((( SELECT auth.uid() ) = user_id))
  WITH CHECK ((( SELECT auth.uid() ) = user_id));

ALTER POLICY "Users can create own OFA screenings" ON public.ofa_screenings
  WITH CHECK (((( SELECT auth.uid() ) = owner_id) AND ( SELECT has_effective_premium_access(get_my_person_id()) AS has_effective_premium_access)));

ALTER POLICY "Users can delete own OFA screenings" ON public.ofa_screenings
  USING ((( SELECT auth.uid() ) = owner_id));

ALTER POLICY "Users can update own OFA screenings" ON public.ofa_screenings
  USING ((( SELECT auth.uid() ) = owner_id))
  WITH CHECK (((( SELECT auth.uid() ) = owner_id) AND ( SELECT has_effective_premium_access(get_my_person_id()) AS has_effective_premium_access)));

ALTER POLICY "Users can view own OFA screenings" ON public.ofa_screenings
  USING ((( SELECT auth.uid() ) = owner_id));

ALTER POLICY "Authenticated users can submit onboarding request" ON public.onboarding_requests
  WITH CHECK (((( SELECT auth.uid() ) = auth_user_id) AND (status = 'pending'::text) AND (notes IS NULL)));

ALTER POLICY "Users can create own pedigree ancestors" ON public.pedigree_ancestors
  WITH CHECK (((( SELECT auth.uid() ) = owner_id) AND ( SELECT has_effective_premium_access(get_my_person_id()) AS has_effective_premium_access)));

ALTER POLICY "Users can delete own pedigree ancestors" ON public.pedigree_ancestors
  USING ((( SELECT auth.uid() ) = owner_id));

ALTER POLICY "Users can update own pedigree ancestors" ON public.pedigree_ancestors
  USING ((( SELECT auth.uid() ) = owner_id))
  WITH CHECK (((( SELECT auth.uid() ) = owner_id) AND ( SELECT has_effective_premium_access(get_my_person_id()) AS has_effective_premium_access)));

ALTER POLICY "Users can view own pedigree ancestors" ON public.pedigree_ancestors
  USING ((( SELECT auth.uid() ) = owner_id));

ALTER POLICY "Users manage own subscriptions" ON public.push_subscriptions
  USING ((( SELECT auth.uid() ) = user_id));

ALTER POLICY secretary_tasks_delete ON public.secretary_tasks
  USING ((is_site_admin() OR (EXISTS ( SELECT 1
   FROM ((people p
     JOIN user_roles ur ON ((ur.user_id = p.id)))
     JOIN roles r ON ((r.id = ur.role_id)))
  WHERE ((p.auth_user_id = ( SELECT auth.uid() )) AND (ur.club_id = secretary_tasks.club_id) AND (ur.is_active = true) AND (r.name = ANY (ARRAY['secretary'::text, 'club_admin'::text, 'site_admin'::text])))))));

ALTER POLICY secretary_tasks_insert ON public.secretary_tasks
  WITH CHECK ((is_site_admin() OR (EXISTS ( SELECT 1
   FROM ((people p
     JOIN user_roles ur ON ((ur.user_id = p.id)))
     JOIN roles r ON ((r.id = ur.role_id)))
  WHERE ((p.auth_user_id = ( SELECT auth.uid() )) AND (ur.club_id = secretary_tasks.club_id) AND (ur.is_active = true) AND (r.name = ANY (ARRAY['secretary'::text, 'club_admin'::text, 'site_admin'::text])))))));

ALTER POLICY secretary_tasks_select ON public.secretary_tasks
  USING ((is_site_admin() OR (EXISTS ( SELECT 1
   FROM ((people p
     JOIN user_roles ur ON ((ur.user_id = p.id)))
     JOIN roles r ON ((r.id = ur.role_id)))
  WHERE ((p.auth_user_id = ( SELECT auth.uid() )) AND (ur.club_id = secretary_tasks.club_id) AND (ur.is_active = true) AND (r.name = ANY (ARRAY['secretary'::text, 'club_admin'::text, 'site_admin'::text])))))));

ALTER POLICY secretary_tasks_update ON public.secretary_tasks
  USING ((is_site_admin() OR (EXISTS ( SELECT 1
   FROM ((people p
     JOIN user_roles ur ON ((ur.user_id = p.id)))
     JOIN roles r ON ((r.id = ur.role_id)))
  WHERE ((p.auth_user_id = ( SELECT auth.uid() )) AND (ur.club_id = secretary_tasks.club_id) AND (ur.is_active = true) AND (r.name = ANY (ARRAY['secretary'::text, 'club_admin'::text, 'site_admin'::text])))))));

ALTER POLICY "Users manage own read receipts" ON public.show_announcement_reads
  USING ((( SELECT auth.uid() ) = user_id));

ALTER POLICY "Authenticated users can create announcements" ON public.show_announcements
  WITH CHECK (((( SELECT auth.uid() ) = author_id) OR ( SELECT is_platform_admin() AS is_platform_admin)));

ALTER POLICY "Authenticated users can read announcements" ON public.show_announcements
  USING ((( SELECT auth.uid() ) IS NOT NULL));

ALTER POLICY "Author or admin can delete announcements" ON public.show_announcements
  USING (((( SELECT auth.uid() ) = author_id) OR ( SELECT is_platform_admin() AS is_platform_admin)));

ALTER POLICY "Author or admin can update announcements" ON public.show_announcements
  USING (((( SELECT auth.uid() ) = author_id) OR ( SELECT is_platform_admin() AS is_platform_admin)));

ALTER POLICY show_incidents_insert ON public.show_incidents
  WITH CHECK (((created_by = ( SELECT auth.uid() )) AND ( SELECT can_manage_show(show_incidents.show_id) AS can_manage_show)));

ALTER POLICY threads_insert ON public.show_message_threads
  WITH CHECK (((participant_id = ( SELECT auth.uid() )) OR is_platform_admin() OR (EXISTS ( SELECT 1
   FROM shows s
  WHERE ((s.id = show_message_threads.show_id) AND (is_trial_secretary(s.club_id) OR is_club_admin(s.club_id)))))));

ALTER POLICY threads_select ON public.show_message_threads
  USING (((participant_id = ( SELECT auth.uid() )) OR is_platform_admin() OR (EXISTS ( SELECT 1
   FROM shows s
  WHERE ((s.id = show_message_threads.show_id) AND (is_trial_secretary(s.club_id) OR is_club_admin(s.club_id)))))));

ALTER POLICY messages_insert ON public.show_messages
  WITH CHECK (((sender_id = ( SELECT auth.uid() )) AND (EXISTS ( SELECT 1
   FROM show_message_threads t
  WHERE ((t.id = show_messages.thread_id) AND ((t.participant_id = ( SELECT auth.uid() )) OR is_platform_admin() OR (EXISTS ( SELECT 1
           FROM shows s
          WHERE ((s.id = t.show_id) AND (is_trial_secretary(s.club_id) OR is_club_admin(s.club_id)))))))))));

ALTER POLICY messages_select ON public.show_messages
  USING ((EXISTS ( SELECT 1
   FROM show_message_threads t
  WHERE ((t.id = show_messages.thread_id) AND ((t.participant_id = ( SELECT auth.uid() )) OR is_platform_admin() OR (EXISTS ( SELECT 1
           FROM shows s
          WHERE ((s.id = t.show_id) AND (is_trial_secretary(s.club_id) OR is_club_admin(s.club_id))))))))));

ALTER POLICY messages_update_read ON public.show_messages
  USING ((EXISTS ( SELECT 1
   FROM show_message_threads t
  WHERE ((t.id = show_messages.thread_id) AND ((t.participant_id = ( SELECT auth.uid() )) OR is_platform_admin() OR (EXISTS ( SELECT 1
           FROM shows s
          WHERE ((s.id = t.show_id) AND (is_trial_secretary(s.club_id) OR is_club_admin(s.club_id))))))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM show_message_threads t
  WHERE ((t.id = show_messages.thread_id) AND ((t.participant_id = ( SELECT auth.uid() )) OR is_platform_admin() OR (EXISTS ( SELECT 1
           FROM shows s
          WHERE ((s.id = t.show_id) AND (is_trial_secretary(s.club_id) OR is_club_admin(s.club_id))))))))));

ALTER POLICY "Users can create own training goals" ON public.training_goals
  WITH CHECK (((( SELECT auth.uid() ) = owner_id) AND (EXISTS ( SELECT 1
   FROM dogs
  WHERE ((dogs.id = training_goals.dog_id) AND ((dogs.owner_id = ( SELECT get_my_person_id() AS get_my_person_id)) OR (dogs.co_owner_id = ( SELECT get_my_person_id() AS get_my_person_id))))))));

ALTER POLICY "Users can delete own training goals" ON public.training_goals
  USING (((( SELECT auth.uid() ) = owner_id) AND (EXISTS ( SELECT 1
   FROM dogs
  WHERE ((dogs.id = training_goals.dog_id) AND ((dogs.owner_id = ( SELECT get_my_person_id() AS get_my_person_id)) OR (dogs.co_owner_id = ( SELECT get_my_person_id() AS get_my_person_id))))))));

ALTER POLICY "Users can update own training goals" ON public.training_goals
  USING (((( SELECT auth.uid() ) = owner_id) AND (EXISTS ( SELECT 1
   FROM dogs
  WHERE ((dogs.id = training_goals.dog_id) AND ((dogs.owner_id = ( SELECT get_my_person_id() AS get_my_person_id)) OR (dogs.co_owner_id = ( SELECT get_my_person_id() AS get_my_person_id))))))))
  WITH CHECK (((( SELECT auth.uid() ) = owner_id) AND (EXISTS ( SELECT 1
   FROM dogs
  WHERE ((dogs.id = training_goals.dog_id) AND ((dogs.owner_id = ( SELECT get_my_person_id() AS get_my_person_id)) OR (dogs.co_owner_id = ( SELECT get_my_person_id() AS get_my_person_id))))))));

ALTER POLICY "Users can view own training goals" ON public.training_goals
  USING (((( SELECT auth.uid() ) = owner_id) AND (EXISTS ( SELECT 1
   FROM dogs
  WHERE ((dogs.id = training_goals.dog_id) AND ((dogs.owner_id = ( SELECT get_my_person_id() AS get_my_person_id)) OR (dogs.co_owner_id = ( SELECT get_my_person_id() AS get_my_person_id))))))));

ALTER POLICY "Users can create own training entries" ON public.training_journal_entries
  WITH CHECK (((( SELECT auth.uid() ) = owner_id) AND ( SELECT has_effective_premium_access(get_my_person_id()) AS has_effective_premium_access)));

ALTER POLICY "Users can delete own training entries" ON public.training_journal_entries
  USING ((( SELECT auth.uid() ) = owner_id));

ALTER POLICY "Users can update own training entries" ON public.training_journal_entries
  USING ((( SELECT auth.uid() ) = owner_id))
  WITH CHECK (((( SELECT auth.uid() ) = owner_id) AND ( SELECT has_effective_premium_access(get_my_person_id()) AS has_effective_premium_access)));

ALTER POLICY "Users can view own training entries" ON public.training_journal_entries
  USING ((( SELECT auth.uid() ) = owner_id));

ALTER POLICY "Users can create own milestones" ON public.training_milestones
  WITH CHECK (((( SELECT auth.uid() ) = owner_id) AND ( SELECT has_effective_premium_access(get_my_person_id()) AS has_effective_premium_access)));

ALTER POLICY "Users can delete own milestones" ON public.training_milestones
  USING ((( SELECT auth.uid() ) = owner_id));

ALTER POLICY "Users can update own milestones" ON public.training_milestones
  USING ((( SELECT auth.uid() ) = owner_id))
  WITH CHECK (((( SELECT auth.uid() ) = owner_id) AND ( SELECT has_effective_premium_access(get_my_person_id()) AS has_effective_premium_access)));

ALTER POLICY "Users can view own milestones" ON public.training_milestones
  USING ((( SELECT auth.uid() ) = owner_id));

ALTER POLICY checklist_select ON public.trial_checklist_state
  USING ((( SELECT auth.uid() ) IS NOT NULL));

ALTER POLICY milestones_delete ON public.user_milestones
  USING ((( SELECT auth.uid() ) = user_id));

ALTER POLICY milestones_insert ON public.user_milestones
  WITH CHECK ((( SELECT auth.uid() ) = user_id));

ALTER POLICY milestones_select ON public.user_milestones
  USING ((( SELECT auth.uid() ) = user_id));

ALTER POLICY milestones_update ON public.user_milestones
  USING ((( SELECT auth.uid() ) = user_id));
