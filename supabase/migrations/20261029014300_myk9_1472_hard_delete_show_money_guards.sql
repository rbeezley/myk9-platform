-- MYK9-1472 (carries MYK9-615's unmerged guard): permanent show deletion is
-- limited to genuinely unused shows.
--
-- Rebuilt on the LATEST hard_delete_show (20260915191700_stripe_ledger_fks_restrict),
-- keeping its site-admin gate, its readable Stripe-order refusal and its ACL.
-- What changes:
--
-- 1. A reviewed manifest classifies every foreign key that a show delete can
--    reach: every FK into shows, trials and classes, plus every FK into the
--    tables whose rows the delete is allowed to sweep (the "disposable" ones).
--    The function compares it with pg_constraint in both directions and
--    refuses on any difference, so a table added later cannot be cascaded
--    away before someone has decided whether its rows are evidence.
-- 2. Only structural and configuration rows are disposable: trials, classes,
--    judge assignments, the six lifecycle-email step toggles every show gets
--    from trg_ensure_show_lifecycle_email_steps, ringside passcodes, show
--    officials and the show-scoped role grants they carry, and the
--    show/trial/class visibility settings. Everything else (participants,
--    money, carts, deliveries, prints, packets, submissions, incidents,
--    messages, logs) is retained: one row of it refuses the delete.
-- 3. Entries and enrollments refuse regardless of payment status, including
--    an entry of another show that points at this show's trials, classes or
--    enrollments. Money and delivery tables that name a show without a
--    foreign key (cart_fulfillments, cart_fulfillment_lines,
--    show_lifecycle_email_job_requests, private.class_results_push) are
--    checked by name.
-- 4. The show, its trials and its classes are row-locked before any check, so
--    a concurrent entry, enrollment, order or payment (each of which takes
--    FOR KEY SHARE on one of those rows) waits for this transaction instead
--    of slipping in between the check and the delete. A 2 s lock timeout
--    refuses with 55P03; nothing retries automatically.
-- 5. Direct DELETE on shows is removed (policy shows_delete and the table
--    grant), so the function is the only way an app user deletes a show.
--    Club admins keep soft_delete_show.
--
-- Refusals carry SQLSTATE MK615 and a sentence an admin can act on. Nothing
-- here creates, queues or touches a refund.

CREATE OR REPLACE FUNCTION public.hard_delete_show(p_show_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  -- Regenerate from pg_constraint when the drift check names an edge. A new
  -- edge is 'retain' unless a reviewer can say why its rows are not
  -- participant, money, delivery or audit evidence. Every 'disposable' edge
  -- must be ON DELETE CASCADE from shows, trials or classes.
  v_fk_manifest CONSTANT pg_catalog.jsonb := $manifest$
  [
    {"constraint_schema" : "public", "constraint_name" : "announcements_show_id_fkey", "child_schema" : "public", "child_table" : "announcements", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "armbands_show_id_fkey", "child_schema" : "public", "child_table" : "armbands", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "calendar_feed_tokens_show_id_fkey", "child_schema" : "public", "child_table" : "calendar_feed_tokens", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "dog_favorites_show_id_fkey", "child_schema" : "public", "child_table" : "dog_favorites", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "dogs_created_from_show_id_fkey", "child_schema" : "public", "child_table" : "dogs", "child_column" : "created_from_show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "SET NULL", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "email_log_show_id_fkey", "child_schema" : "public", "child_table" : "email_log", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "SET NULL", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "registrations_show_id_fkey", "child_schema" : "public", "child_table" : "enrollments", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "entries_show_id_fkey", "child_schema" : "public", "child_table" : "entries", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "entry_carts_show_id_fkey", "child_schema" : "public", "child_table" : "entry_carts", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "entry_payment_links_show_id_fkey", "child_schema" : "public", "child_table" : "entry_payment_links", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "judge_assignments_show_id_fkey", "child_schema" : "public", "child_table" : "judge_assignments", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "disposable"},
    {"constraint_schema" : "public", "constraint_name" : "paperwork_prints_show_id_fkey", "child_schema" : "public", "child_table" : "paperwork_prints", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "people_created_from_show_id_fkey", "child_schema" : "public", "child_table" : "people", "child_column" : "created_from_show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "SET NULL", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "premium_generation_attempts_show_id_fkey", "child_schema" : "public", "child_table" : "premium_generation_attempts", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "premium_generations_show_id_fkey", "child_schema" : "public", "child_table" : "premium_generations", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "refund_requests_show_id_fkey", "child_schema" : "public", "child_table" : "refund_requests", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "SET NULL", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "result_submissions_show_id_fkey", "child_schema" : "public", "child_table" : "result_submissions", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "ringside_sessions_show_id_fkey", "child_schema" : "public", "child_table" : "ringside_sessions", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "role_requests_show_id_fkey", "child_schema" : "public", "child_table" : "role_requests", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "SET NULL", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "secretary_tasks_show_id_fkey", "child_schema" : "public", "child_table" : "secretary_tasks", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "SET NULL", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "show_announcements_show_id_fkey", "child_schema" : "public", "child_table" : "show_announcements", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "show_eve_nudge_log_show_id_fkey", "child_schema" : "public", "child_table" : "show_eve_nudge_log", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "show_incidents_show_id_fkey", "child_schema" : "public", "child_table" : "show_incidents", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "show_lifecycle_email_jobs_show_id_fkey", "child_schema" : "public", "child_table" : "show_lifecycle_email_jobs", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "show_lifecycle_email_steps_show_id_fkey", "child_schema" : "public", "child_table" : "show_lifecycle_email_steps", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "disposable"},
    {"constraint_schema" : "public", "constraint_name" : "show_message_threads_show_id_fkey", "child_schema" : "public", "child_table" : "show_message_threads", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "show_messages_show_id_fkey", "child_schema" : "public", "child_table" : "show_messages", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "show_money_locks_show_id_fkey", "child_schema" : "public", "child_table" : "show_money_locks", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "show_officials_show_id_fkey", "child_schema" : "public", "child_table" : "show_officials", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "disposable"},
    {"constraint_schema" : "public", "constraint_name" : "show_passcodes_show_id_fkey", "child_schema" : "public", "child_table" : "show_passcodes", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "disposable"},
    {"constraint_schema" : "public", "constraint_name" : "show_payments_show_id_fkey", "child_schema" : "public", "child_table" : "show_payments", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "RESTRICT", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "show_payouts_show_id_fkey", "child_schema" : "public", "child_table" : "show_payouts", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "show_visibility_settings_show_id_fkey", "child_schema" : "public", "child_table" : "show_visibility_settings", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "disposable"},
    {"constraint_schema" : "public", "constraint_name" : "stripe_orders_show_id_fkey", "child_schema" : "public", "child_table" : "stripe_orders", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "RESTRICT", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "support_tickets_show_id_fkey", "child_schema" : "public", "child_table" : "support_tickets", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "SET NULL", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "trial_packet_generation_claims_show_id_fkey", "child_schema" : "public", "child_table" : "trial_packet_generation_claims", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "trial_packet_print_reminders_show_id_fkey", "child_schema" : "public", "child_table" : "trial_packet_print_reminders", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "trial_packet_snapshots_show_id_fkey", "child_schema" : "public", "child_table" : "trial_packet_snapshots", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "RESTRICT", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "trials_show_id_fkey", "child_schema" : "public", "child_table" : "trials", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "disposable"},
    {"constraint_schema" : "public", "constraint_name" : "user_roles_show_id_fkey", "child_schema" : "public", "child_table" : "user_roles", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "disposable"},
    {"constraint_schema" : "public", "constraint_name" : "volunteer_general_assignments_show_id_fkey", "child_schema" : "public", "child_table" : "volunteer_general_assignments", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "volunteers_show_id_fkey", "child_schema" : "public", "child_table" : "volunteers", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "activity_log_trial_id_fkey", "child_schema" : "public", "child_table" : "activity_log", "child_column" : "trial_id", "parent_schema" : "public", "parent_table" : "trials", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "announcements_trial_id_fkey", "child_schema" : "public", "child_table" : "announcements", "child_column" : "trial_id", "parent_schema" : "public", "parent_table" : "trials", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "armbands_trial_id_fkey", "child_schema" : "public", "child_table" : "armbands", "child_column" : "trial_id", "parent_schema" : "public", "parent_table" : "trials", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "classes_trial_id_fkey", "child_schema" : "public", "child_table" : "classes", "child_column" : "trial_id", "parent_schema" : "public", "parent_table" : "trials", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "disposable"},
    {"constraint_schema" : "public", "constraint_name" : "entries_trial_id_fkey", "child_schema" : "public", "child_table" : "entries", "child_column" : "trial_id", "parent_schema" : "public", "parent_table" : "trials", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "judge_assignments_trial_id_fkey", "child_schema" : "public", "child_table" : "judge_assignments", "child_column" : "trial_id", "parent_schema" : "public", "parent_table" : "trials", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "disposable"},
    {"constraint_schema" : "public", "constraint_name" : "paperwork_prints_trial_id_fkey", "child_schema" : "public", "child_table" : "paperwork_prints", "child_column" : "trial_id", "parent_schema" : "public", "parent_table" : "trials", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "result_submissions_trial_id_fkey", "child_schema" : "public", "child_table" : "result_submissions", "child_column" : "trial_id", "parent_schema" : "public", "parent_table" : "trials", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "show_incidents_trial_id_fkey", "child_schema" : "public", "child_table" : "show_incidents", "child_column" : "trial_id", "parent_schema" : "public", "parent_table" : "trials", "parent_column" : "id", "delete_action" : "SET NULL", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "trial_checklist_state_trial_id_fkey", "child_schema" : "public", "child_table" : "trial_checklist_state", "child_column" : "trial_id", "parent_schema" : "public", "parent_table" : "trials", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "trial_judge_supplies_trial_id_fkey", "child_schema" : "public", "child_table" : "trial_judge_supplies", "child_column" : "trial_id", "parent_schema" : "public", "parent_table" : "trials", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "trial_visibility_overrides_trial_id_fkey", "child_schema" : "public", "child_table" : "trial_visibility_overrides", "child_column" : "trial_id", "parent_schema" : "public", "parent_table" : "trials", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "disposable"},
    {"constraint_schema" : "public", "constraint_name" : "volunteer_general_assignments_trial_id_fkey", "child_schema" : "public", "child_table" : "volunteer_general_assignments", "child_column" : "trial_id", "parent_schema" : "public", "parent_table" : "trials", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "cart_spot_holds_class_id_fkey", "child_schema" : "public", "child_table" : "cart_spot_holds", "child_column" : "class_id", "parent_schema" : "public", "parent_table" : "classes", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "class_visibility_overrides_class_id_fkey", "child_schema" : "public", "child_table" : "class_visibility_overrides", "child_column" : "class_id", "parent_schema" : "public", "parent_table" : "classes", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "disposable"},
    {"constraint_schema" : "public", "constraint_name" : "entries_class_id_fkey", "child_schema" : "public", "child_table" : "entries", "child_column" : "class_id", "parent_schema" : "public", "parent_table" : "classes", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "entry_cart_items_class_id_fkey", "child_schema" : "public", "child_table" : "entry_cart_items", "child_column" : "class_id", "parent_schema" : "public", "parent_table" : "classes", "parent_column" : "id", "delete_action" : "NO ACTION", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "judge_assignments_class_id_fkey", "child_schema" : "public", "child_table" : "judge_assignments", "child_column" : "class_id", "parent_schema" : "public", "parent_table" : "classes", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "disposable"},
    {"constraint_schema" : "public", "constraint_name" : "paperwork_prints_class_id_fkey", "child_schema" : "public", "child_table" : "paperwork_prints", "child_column" : "class_id", "parent_schema" : "public", "parent_table" : "classes", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "show_incidents_class_id_fkey", "child_schema" : "public", "child_table" : "show_incidents", "child_column" : "class_id", "parent_schema" : "public", "parent_table" : "classes", "parent_column" : "id", "delete_action" : "SET NULL", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "volunteer_class_assignments_class_id_fkey", "child_schema" : "public", "child_table" : "volunteer_class_assignments", "child_column" : "class_id", "parent_schema" : "public", "parent_table" : "classes", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "waitlist_entries_class_id_fkey", "child_schema" : "public", "child_table" : "waitlist_entries", "child_column" : "class_id", "parent_schema" : "public", "parent_table" : "classes", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "show_lifecycle_email_jobs_step_id_fkey", "child_schema" : "public", "child_table" : "show_lifecycle_email_jobs", "child_column" : "step_id", "parent_schema" : "public", "parent_table" : "show_lifecycle_email_steps", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "ringside_sessions_show_passcode_id_fkey", "child_schema" : "public", "child_table" : "ringside_sessions", "child_column" : "show_passcode_id", "parent_schema" : "public", "parent_table" : "show_passcodes", "parent_column" : "id", "delete_action" : "SET NULL", "disposition" : "retain"}
  ]
  $manifest$::pg_catalog.jsonb;
  v_edge record;
  v_fk_drift text;
  v_orders integer;
  v_has_retained_child boolean;
  v_parent_scope text;
BEGIN
  IF NOT (SELECT public.is_platform_admin()) THEN
    RAISE EXCEPTION 'Permission denied: only site administrators can permanently delete shows'
      USING ERRCODE = '42501';
  END IF;

  PERFORM pg_catalog.set_config('lock_timeout', '2s', true);

  -- SHARE UPDATE EXCLUSIVE conflicts with itself and with ADD FOREIGN KEY on
  -- the referenced table, but not with ordinary DML: two permanent deletes
  -- serialize, and the FK graph cannot change under the check below.
  LOCK TABLE public.classes IN SHARE UPDATE EXCLUSIVE MODE;
  LOCK TABLE public.trials IN SHARE UPDATE EXCLUSIVE MODE;
  LOCK TABLE public.shows IN SHARE UPDATE EXCLUSIVE MODE;

  PERFORM 1 FROM public.shows WHERE id = p_show_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Show not found' USING ERRCODE = 'P0002';
  END IF;
  PERFORM 1 FROM public.trials WHERE show_id = p_show_id ORDER BY id FOR UPDATE;
  PERFORM 1
  FROM public.classes AS c
  JOIN public.trials AS t ON t.id = c.trial_id
  WHERE t.show_id = p_show_id
  ORDER BY c.id
  FOR UPDATE OF c;

  -- Both directions, so a missing, extra, renamed, retargeted, re-columned or
  -- action-changed constraint refuses before any row is read or deleted. The
  -- parents checked are shows/trials/classes plus every table a disposable
  -- edge sweeps, so a table hanging off a swept table is covered too.
  WITH reviewed AS (
    SELECT * FROM pg_catalog.jsonb_to_recordset(v_fk_manifest) AS manifest(
      constraint_schema text, constraint_name text, child_schema text, child_table text,
      child_column text, parent_schema text, parent_table text, parent_column text,
      delete_action text, disposition text
    )
  ), swept AS (
    SELECT pg_catalog.to_regclass('public.shows') AS rel
    UNION SELECT pg_catalog.to_regclass(pg_catalog.format('%I.%I', child_schema, child_table))
    FROM reviewed WHERE disposition = 'disposable'
  ), actual AS (
    SELECT constraint_ns.nspname AS constraint_schema, c.conname AS constraint_name,
           child_ns.nspname AS child_schema, child.relname AS child_table,
           child_col.attname AS child_column, parent_ns.nspname AS parent_schema,
           parent.relname AS parent_table, parent_col.attname AS parent_column,
           CASE c.confdeltype WHEN 'a' THEN 'NO ACTION' WHEN 'r' THEN 'RESTRICT'
             WHEN 'c' THEN 'CASCADE' WHEN 'n' THEN 'SET NULL'
             WHEN 'd' THEN 'SET DEFAULT' END AS delete_action
    FROM pg_catalog.pg_constraint AS c
    JOIN pg_catalog.pg_namespace AS constraint_ns ON constraint_ns.oid = c.connamespace
    JOIN pg_catalog.pg_class AS child ON child.oid = c.conrelid
    JOIN pg_catalog.pg_namespace AS child_ns ON child_ns.oid = child.relnamespace
    JOIN pg_catalog.pg_class AS parent ON parent.oid = c.confrelid
    JOIN pg_catalog.pg_namespace AS parent_ns ON parent_ns.oid = parent.relnamespace
    CROSS JOIN LATERAL pg_catalog.unnest(c.conkey) WITH ORDINALITY AS child_key(attnum, ordinality)
    JOIN LATERAL pg_catalog.unnest(c.confkey) WITH ORDINALITY AS parent_key(attnum, ordinality)
      ON parent_key.ordinality = child_key.ordinality
    JOIN pg_catalog.pg_attribute AS child_col
      ON child_col.attrelid = child.oid AND child_col.attnum = child_key.attnum
    JOIN pg_catalog.pg_attribute AS parent_col
      ON parent_col.attrelid = parent.oid AND parent_col.attnum = parent_key.attnum
    WHERE c.contype = 'f'
      AND c.confrelid IN (SELECT rel FROM swept WHERE rel IS NOT NULL)
  ), delta AS (
    (SELECT constraint_schema, constraint_name, child_schema, child_table, child_column,
            parent_schema, parent_table, parent_column, delete_action FROM actual
     EXCEPT
     SELECT constraint_schema, constraint_name, child_schema, child_table, child_column,
            parent_schema, parent_table, parent_column, delete_action FROM reviewed)
    UNION ALL
    (SELECT constraint_schema, constraint_name, child_schema, child_table, child_column,
            parent_schema, parent_table, parent_column, delete_action FROM reviewed
     EXCEPT
     SELECT constraint_schema, constraint_name, child_schema, child_table, child_column,
            parent_schema, parent_table, parent_column, delete_action FROM actual)
    UNION ALL
    -- A disposable edge is swept by the cascade from a show, trial or class;
    -- anything else would leave rows behind or fail at the final DELETE.
    SELECT constraint_schema, constraint_name, child_schema, child_table, child_column,
           parent_schema, parent_table, parent_column, delete_action
    FROM reviewed
    WHERE disposition = 'disposable'
      AND (delete_action <> 'CASCADE' OR parent_table NOT IN ('shows', 'trials', 'classes'))
  )
  SELECT pg_catalog.string_agg(
    DISTINCT constraint_schema || '.' || constraint_name, ', '
    ORDER BY constraint_schema || '.' || constraint_name
  ) INTO v_fk_drift
  FROM delta;

  IF v_fk_drift IS NOT NULL THEN
    RAISE EXCEPTION 'Permanent deletion is refused: foreign key(s) % changed since hard_delete_show was last reviewed. No data was deleted.', v_fk_drift
      USING ERRCODE = 'MK615',
            HINT = 'Classify the edge in the hard_delete_show manifest before deleting.';
  END IF;

  -- MYK9-527's readable refusal, kept verbatim: either column alone ties an
  -- order to this show.
  SELECT pg_catalog.count(*) INTO v_orders
  FROM public.stripe_orders AS so
  WHERE so.show_id = p_show_id
     OR so.enrollment_id IN (SELECT e.id FROM public.enrollments AS e WHERE e.show_id = p_show_id);

  IF v_orders > 0 THEN
    RAISE EXCEPTION
      'This show has % Stripe order(s); refunds and reconciliation still reference them. Permanent deletion is refused. Resolve or reassign those orders first.', v_orders
      USING ERRCODE = 'MK615';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.entries AS e
    WHERE e.show_id IS DISTINCT FROM p_show_id
      AND (e.trial_id IN (SELECT t.id FROM public.trials AS t WHERE t.show_id = p_show_id)
        OR e.class_id IN (
          SELECT c.id FROM public.classes AS c
          JOIN public.trials AS t ON t.id = c.trial_id WHERE t.show_id = p_show_id
        )
        OR e.registration_id IN (SELECT r.id FROM public.enrollments AS r WHERE r.show_id = p_show_id))
  ) THEN
    RAISE EXCEPTION 'Permanent deletion is refused: an entry in another show points at this show''s trials, classes or enrollments.'
      USING ERRCODE = 'MK615';
  END IF;

  IF EXISTS (SELECT 1 FROM public.enrollments AS r WHERE r.show_id = p_show_id)
     OR EXISTS (
       SELECT 1 FROM public.entries AS e
       WHERE e.show_id = p_show_id
          OR e.trial_id IN (SELECT t.id FROM public.trials AS t WHERE t.show_id = p_show_id)
          OR e.class_id IN (
            SELECT c.id FROM public.classes AS c
            JOIN public.trials AS t ON t.id = c.trial_id WHERE t.show_id = p_show_id
          )
     ) THEN
    RAISE EXCEPTION 'This show has entries or enrollments, so it cannot be permanently deleted. Permanent deletion is limited to unused shows; keep it in the trash instead.'
      USING ERRCODE = 'MK615';
  END IF;

  -- Money and delivery rows that name the show without a foreign key, so
  -- pg_constraint cannot see them.
  IF EXISTS (SELECT 1 FROM public.cart_fulfillments AS f WHERE f.show_id = p_show_id)
     OR EXISTS (
       SELECT 1 FROM public.cart_fulfillment_lines AS l
       WHERE l.trial_id IN (SELECT t.id FROM public.trials AS t WHERE t.show_id = p_show_id)
          OR l.class_id IN (
            SELECT c.id FROM public.classes AS c
            JOIN public.trials AS t ON t.id = c.trial_id WHERE t.show_id = p_show_id
          )
     ) THEN
    RAISE EXCEPTION 'This show has checkout fulfillment records in public.cart_fulfillments that must be kept for reconciliation, so it cannot be permanently deleted.'
      USING ERRCODE = 'MK615';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.show_lifecycle_email_job_requests AS q WHERE q.show_id = p_show_id
  ) THEN
    RAISE EXCEPTION 'This show has email delivery records in public.show_lifecycle_email_job_requests that must be kept, so it cannot be permanently deleted.'
      USING ERRCODE = 'MK615';
  END IF;
  -- "Results Posted" push state, keyed by class with no foreign key: a delete
  -- would orphan it and private.retry_class_results_push would keep retrying.
  IF EXISTS (
    SELECT 1 FROM private.class_results_push AS p
    WHERE p.class_id IN (
      SELECT c.id FROM public.classes AS c
      JOIN public.trials AS t ON t.id = c.trial_id WHERE t.show_id = p_show_id
    )
  ) THEN
    RAISE EXCEPTION 'This show has results push delivery records in private.class_results_push that must be kept, so it cannot be permanently deleted.'
      USING ERRCODE = 'MK615';
  END IF;

  -- Identifiers come only from the constant manifest (already proven equal to
  -- the catalog) and pass through %I; the show id is bound with USING.
  FOR v_edge IN
    SELECT * FROM pg_catalog.jsonb_to_recordset(v_fk_manifest) AS manifest(
      constraint_schema text, constraint_name text, child_schema text, child_table text,
      child_column text, parent_schema text, parent_table text, parent_column text,
      delete_action text, disposition text
    )
    WHERE disposition = 'retain'
    ORDER BY parent_table, child_table, constraint_name
  LOOP
    IF v_edge.parent_table = 'shows' THEN
      v_parent_scope := 'SELECT $1';
    ELSIF v_edge.parent_table = 'trials' THEN
      v_parent_scope := 'SELECT target_trial.id FROM public.trials AS target_trial '
        'WHERE target_trial.show_id = $1';
    ELSIF v_edge.parent_table = 'classes' THEN
      v_parent_scope := 'SELECT target_class.id FROM public.classes AS target_class '
        'JOIN public.trials AS target_trial ON target_trial.id = target_class.trial_id '
        'WHERE target_trial.show_id = $1';
    ELSE
      -- A swept configuration table: the parent rows in scope are the ones its
      -- disposable edges would cascade away.
      SELECT pg_catalog.format(
        'SELECT swept.%I FROM %I.%I AS swept WHERE %s',
        v_edge.parent_column, v_edge.parent_schema, v_edge.parent_table,
        pg_catalog.string_agg(
          pg_catalog.format('swept.%I IN (%s)', d.child_column,
            CASE d.parent_table
              WHEN 'shows' THEN 'SELECT $1'
              WHEN 'trials' THEN 'SELECT t.id FROM public.trials AS t WHERE t.show_id = $1'
              ELSE 'SELECT c.id FROM public.classes AS c JOIN public.trials AS t '
                   'ON t.id = c.trial_id WHERE t.show_id = $1'
            END),
          ' OR ' ORDER BY d.constraint_name)
      ) INTO v_parent_scope
      FROM pg_catalog.jsonb_to_recordset(v_fk_manifest) AS d(
        constraint_name text, child_schema text, child_table text, child_column text,
        parent_table text, disposition text
      )
      WHERE d.disposition = 'disposable'
        AND d.child_schema = v_edge.parent_schema
        AND d.child_table = v_edge.parent_table;
    END IF;

    EXECUTE pg_catalog.format(
      'SELECT EXISTS (SELECT 1 FROM %I.%I AS child WHERE child.%I IN (%s))',
      v_edge.child_schema, v_edge.child_table, v_edge.child_column, v_parent_scope
    ) INTO v_has_retained_child USING p_show_id;

    IF v_has_retained_child THEN
      RAISE EXCEPTION 'This show has records in %.% that must be kept for history and reconciliation, so it cannot be permanently deleted. Permanent deletion is limited to unused shows.',
        v_edge.child_schema, v_edge.child_table
        USING ERRCODE = 'MK615',
              DETAIL = pg_catalog.format('Blocking foreign key: %s.%s', v_edge.constraint_schema, v_edge.constraint_name);
    END IF;
  END LOOP;

  -- Classes first so their cascades run while the trials still exist; the
  -- show's own delete then sweeps the remaining disposable configuration.
  DELETE FROM public.classes AS c
  USING public.trials AS t
  WHERE t.id = c.trial_id AND t.show_id = p_show_id;
  DELETE FROM public.trials WHERE show_id = p_show_id;
  DELETE FROM public.shows WHERE id = p_show_id;
EXCEPTION
  WHEN deadlock_detected THEN
    RAISE;
  WHEN lock_not_available THEN
    RAISE EXCEPTION
      'The show could not be deleted because the database was busy; no data was deleted. Try again in a quiet moment.'
      USING ERRCODE = '55P03';
END;
$$;

-- Restated in full, as 20260915191700 did, so a later CREATE OR REPLACE
-- cannot widen it by omission.
REVOKE ALL ON FUNCTION public.hard_delete_show(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hard_delete_show(UUID) TO authenticated;

-- Without this a club admin (and the old client path) could DELETE a show
-- straight through PostgREST and skip every check above.
DROP POLICY IF EXISTS shows_delete ON public.shows;
REVOKE DELETE ON TABLE public.shows FROM PUBLIC, anon, authenticated;
