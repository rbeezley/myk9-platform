-- MYK9-113: add strict leading-column coverage for every uncovered public FK.
--
-- These additions are intentionally separate from duplicate-index removals.
-- The linked pre-launch database is small; recheck relation sizes before push
-- and redesign for concurrent creation if any affected relation reaches 100 MB.

CREATE INDEX analytics_events_user_id_fk_idx
  ON public.analytics_events (user_id);
CREATE INDEX chatbot_feedback_query_log_id_fk_idx
  ON public.chatbot_feedback (query_log_id);
CREATE INDEX chatbot_feedback_user_id_fk_idx
  ON public.chatbot_feedback (user_id);
CREATE INDEX chatbot_query_log_user_id_fk_idx
  ON public.chatbot_query_log (user_id);
CREATE INDEX class_visibility_overrides_updated_by_fk_idx
  ON public.class_visibility_overrides (updated_by);
CREATE INDEX classes_deleted_by_fk_idx
  ON public.classes (deleted_by);
CREATE INDEX classes_results_released_by_fk_idx
  ON public.classes (results_released_by);
CREATE INDEX club_access_requests_approved_club_id_fk_idx
  ON public.club_access_requests (approved_club_id);
CREATE INDEX club_access_requests_requester_person_id_fk_idx
  ON public.club_access_requests (requester_person_id);
CREATE INDEX club_access_requests_reviewed_by_fk_idx
  ON public.club_access_requests (reviewed_by);
CREATE INDEX clubs_deleted_by_fk_idx
  ON public.clubs (deleted_by);
CREATE INDEX dog_favorites_show_id_fk_idx
  ON public.dog_favorites (show_id);
CREATE INDEX dogs_deleted_by_fk_idx
  ON public.dogs (deleted_by);
CREATE INDEX enrollments_handler_id_fk_idx
  ON public.enrollments (handler_id);
CREATE INDEX entries_deleted_by_fk_idx
  ON public.entries (deleted_by);
CREATE INDEX entries_promo_code_id_fk_idx
  ON public.entries (promo_code_id);
CREATE INDEX entries_refund_decided_by_fk_idx
  ON public.entries (refund_decided_by);
CREATE INDEX frontend_logs_user_id_fk_idx
  ON public.frontend_logs (user_id);
CREATE INDEX manual_results_sport_template_id_fk_idx
  ON public.manual_results (sport_template_id);
CREATE INDEX onboarding_requests_auth_user_id_fk_idx
  ON public.onboarding_requests (auth_user_id);
CREATE INDEX operator_alerts_resolved_by_fk_idx
  ON public.operator_alerts (resolved_by);
CREATE INDEX paperwork_prints_class_id_fk_idx
  ON public.paperwork_prints (class_id);
CREATE INDEX paperwork_prints_show_id_fk_idx
  ON public.paperwork_prints (show_id);
CREATE INDEX paperwork_prints_trial_id_fk_idx
  ON public.paperwork_prints (trial_id);
CREATE INDEX pedigree_ancestors_linked_dog_id_fk_idx
  ON public.pedigree_ancestors (linked_dog_id);
CREATE INDEX people_deleted_by_fk_idx
  ON public.people (deleted_by);
CREATE INDEX platform_settings_updated_by_fk_idx
  ON public.platform_settings (updated_by);
CREATE INDEX premium_generations_show_id_fk_idx
  ON public.premium_generations (show_id);
CREATE INDEX premium_generations_template_id_fk_idx
  ON public.premium_generations (template_id);
CREATE INDEX promo_codes_show_id_fk_idx
  ON public.promo_codes (show_id);
CREATE INDEX result_submissions_show_id_fk_idx
  ON public.result_submissions (show_id);
CREATE INDEX result_submissions_submitted_by_fk_idx
  ON public.result_submissions (submitted_by);
CREATE INDEX result_submissions_trial_id_fk_idx
  ON public.result_submissions (trial_id);
CREATE INDEX ringside_sessions_show_passcode_id_fk_idx
  ON public.ringside_sessions (show_passcode_id);
CREATE INDEX role_requests_club_id_fk_idx
  ON public.role_requests (club_id);
CREATE INDEX role_requests_reviewed_by_fk_idx
  ON public.role_requests (reviewed_by);
CREATE INDEX role_requests_show_id_fk_idx
  ON public.role_requests (show_id);
CREATE INDEX secretary_tasks_assignee_id_fk_idx
  ON public.secretary_tasks (assignee_id);
CREATE INDEX secretary_tasks_club_id_fk_idx
  ON public.secretary_tasks (club_id);
CREATE INDEX secretary_tasks_created_by_fk_idx
  ON public.secretary_tasks (created_by);
CREATE INDEX secretary_tasks_show_id_fk_idx
  ON public.secretary_tasks (show_id);
CREATE INDEX show_announcements_author_id_fk_idx
  ON public.show_announcements (author_id);
CREATE INDEX show_incidents_class_id_fk_idx
  ON public.show_incidents (class_id);
CREATE INDEX show_incidents_created_by_fk_idx
  ON public.show_incidents (created_by);
CREATE INDEX show_incidents_dog_id_fk_idx
  ON public.show_incidents (dog_id);
CREATE INDEX show_incidents_entry_id_fk_idx
  ON public.show_incidents (entry_id);
CREATE INDEX show_incidents_handler_id_fk_idx
  ON public.show_incidents (handler_id);
CREATE INDEX show_incidents_judge_id_fk_idx
  ON public.show_incidents (judge_id);
CREATE INDEX show_incidents_trial_id_fk_idx
  ON public.show_incidents (trial_id);
CREATE INDEX lifecycle_email_attempts_attempted_by_fk_idx
  ON public.show_lifecycle_email_attempts (attempted_by);
CREATE INDEX lifecycle_email_attempts_email_log_id_fk_idx
  ON public.show_lifecycle_email_attempts (email_log_id);
CREATE INDEX lifecycle_email_jobs_correction_job_id_fk_idx
  ON public.show_lifecycle_email_jobs (correction_for_job_id);
CREATE INDEX lifecycle_email_jobs_created_by_fk_idx
  ON public.show_lifecycle_email_jobs (created_by);
CREATE INDEX lifecycle_email_jobs_email_log_id_fk_idx
  ON public.show_lifecycle_email_jobs (email_log_id);
CREATE INDEX lifecycle_email_jobs_enrollment_id_fk_idx
  ON public.show_lifecycle_email_jobs (enrollment_id);
CREATE INDEX lifecycle_email_jobs_entry_id_fk_idx
  ON public.show_lifecycle_email_jobs (entry_id);
CREATE INDEX lifecycle_email_jobs_recipient_person_id_fk_idx
  ON public.show_lifecycle_email_jobs (recipient_person_id);
CREATE INDEX lifecycle_email_jobs_show_id_fk_idx
  ON public.show_lifecycle_email_jobs (show_id);
CREATE INDEX lifecycle_email_jobs_updated_by_fk_idx
  ON public.show_lifecycle_email_jobs (updated_by);
CREATE INDEX show_message_threads_participant_id_fk_idx
  ON public.show_message_threads (participant_id);
CREATE INDEX show_messages_sender_id_fk_idx
  ON public.show_messages (sender_id);
CREATE INDEX show_messages_show_id_fk_idx
  ON public.show_messages (show_id);
CREATE INDEX show_payouts_stripe_account_id_fk_idx
  ON public.show_payouts (club_stripe_account_id);
CREATE INDEX show_visibility_settings_updated_by_fk_idx
  ON public.show_visibility_settings (updated_by);
CREATE INDEX shows_deleted_by_fk_idx
  ON public.shows (deleted_by);
CREATE INDEX sport_titles_prerequisite_title_id_fk_idx
  ON public.sport_titles (prerequisite_title_id);
CREATE INDEX entitlement_grants_granted_by_person_id_fk_idx
  ON public.subscription_entitlement_grants (granted_by_person_id);
CREATE INDEX entitlement_grants_revoked_by_person_id_fk_idx
  ON public.subscription_entitlement_grants (revoked_by_person_id);
CREATE INDEX entitlement_grants_superseded_grant_id_fk_idx
  ON public.subscription_entitlement_grants (superseded_by_grant_id);
CREATE INDEX support_ticket_messages_sender_id_fk_idx
  ON public.support_ticket_messages (sender_id);
CREATE INDEX support_tickets_show_id_fk_idx
  ON public.support_tickets (show_id);
CREATE INDEX trial_checklist_state_completed_by_fk_idx
  ON public.trial_checklist_state (completed_by);
CREATE INDEX trial_judge_supplies_person_id_fk_idx
  ON public.trial_judge_supplies (person_id);
CREATE INDEX trial_visibility_overrides_updated_by_fk_idx
  ON public.trial_visibility_overrides (updated_by);
CREATE INDEX trials_deleted_by_fk_idx
  ON public.trials (deleted_by);
CREATE INDEX user_roles_club_id_fk_idx
  ON public.user_roles (club_id);
CREATE INDEX user_roles_show_id_fk_idx
  ON public.user_roles (show_id);
CREATE INDEX waitlist_entries_promoted_entry_id_fk_idx
  ON public.waitlist_entries (promoted_entry_id);

DO $$
DECLARE
  uncovered text[];
BEGIN
  SELECT array_agg(format('%I.%I', t.relname, c.conname) ORDER BY t.relname, c.conname)
  INTO uncovered
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE c.contype = 'f'
    AND n.nspname = 'public'
    AND NOT EXISTS (
      SELECT 1
      FROM pg_index i
      WHERE i.indrelid = c.conrelid
        AND i.indisvalid
        AND i.indisready
        AND i.indpred IS NULL
        AND (i.indkey::smallint[])[0:cardinality(c.conkey) - 1] @> c.conkey
    );

  IF uncovered IS NOT NULL THEN
    RAISE EXCEPTION 'uncovered public foreign keys: %', array_to_string(uncovered, ', ');
  END IF;
END
$$;
