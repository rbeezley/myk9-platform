-- MYK9-615: permanent deletion is limited to genuinely unused shows.
-- The manifest below is the reviewed applied FK graph (61 edges); only the
-- show->trials->classes structural edges are disposable.

CREATE OR REPLACE FUNCTION public.hard_delete_show(p_show_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_fk_manifest CONSTANT pg_catalog.jsonb := $manifest$
  [
    {"constraint_schema":"public","constraint_name":"class_visibility_overrides_class_id_fkey","child_schema":"public","child_table":"class_visibility_overrides","child_column":"class_id","parent_schema":"public","parent_table":"classes","parent_column":"id","delete_action":"CASCADE","disposition":"retain"},
    {"constraint_schema":"public","constraint_name":"entries_class_id_fkey","child_schema":"public","child_table":"entries","child_column":"class_id","parent_schema":"public","parent_table":"classes","parent_column":"id","delete_action":"CASCADE","disposition":"retain"},
    {"constraint_schema":"public","constraint_name":"entry_cart_items_class_id_fkey","child_schema":"public","child_table":"entry_cart_items","child_column":"class_id","parent_schema":"public","parent_table":"classes","parent_column":"id","delete_action":"NO ACTION","disposition":"retain"},
    {"constraint_schema":"public","constraint_name":"judge_assignments_class_id_fkey","child_schema":"public","child_table":"judge_assignments","child_column":"class_id","parent_schema":"public","parent_table":"classes","parent_column":"id","delete_action":"CASCADE","disposition":"retain"},
    {"constraint_schema":"public","constraint_name":"paperwork_prints_class_id_fkey","child_schema":"public","child_table":"paperwork_prints","child_column":"class_id","parent_schema":"public","parent_table":"classes","parent_column":"id","delete_action":"CASCADE","disposition":"retain"},
    {"constraint_schema":"public","constraint_name":"show_incidents_class_id_fkey","child_schema":"public","child_table":"show_incidents","child_column":"class_id","parent_schema":"public","parent_table":"classes","parent_column":"id","delete_action":"SET NULL","disposition":"retain"},
    {"constraint_schema":"public","constraint_name":"volunteer_class_assignments_class_id_fkey","child_schema":"public","child_table":"volunteer_class_assignments","child_column":"class_id","parent_schema":"public","parent_table":"classes","parent_column":"id","delete_action":"CASCADE","disposition":"retain"},
    {"constraint_schema":"public","constraint_name":"waitlist_entries_class_id_fkey","child_schema":"public","child_table":"waitlist_entries","child_column":"class_id","parent_schema":"public","parent_table":"classes","parent_column":"id","delete_action":"CASCADE","disposition":"retain"},
    {"constraint_schema":"public","constraint_name":"announcements_show_id_fkey","child_schema":"public","child_table":"announcements","child_column":"show_id","parent_schema":"public","parent_table":"shows","parent_column":"id","delete_action":"CASCADE","disposition":"retain"},
    {"constraint_schema":"public","constraint_name":"armbands_show_id_fkey","child_schema":"public","child_table":"armbands","child_column":"show_id","parent_schema":"public","parent_table":"shows","parent_column":"id","delete_action":"CASCADE","disposition":"retain"},
    {"constraint_schema":"public","constraint_name":"calendar_feed_tokens_show_id_fkey","child_schema":"public","child_table":"calendar_feed_tokens","child_column":"show_id","parent_schema":"public","parent_table":"shows","parent_column":"id","delete_action":"CASCADE","disposition":"retain"},
    {"constraint_schema":"public","constraint_name":"dog_favorites_show_id_fkey","child_schema":"public","child_table":"dog_favorites","child_column":"show_id","parent_schema":"public","parent_table":"shows","parent_column":"id","delete_action":"CASCADE","disposition":"retain"},
    {"constraint_schema":"public","constraint_name":"email_log_show_id_fkey","child_schema":"public","child_table":"email_log","child_column":"show_id","parent_schema":"public","parent_table":"shows","parent_column":"id","delete_action":"SET NULL","disposition":"retain"},
    {"constraint_schema":"public","constraint_name":"registrations_show_id_fkey","child_schema":"public","child_table":"enrollments","child_column":"show_id","parent_schema":"public","parent_table":"shows","parent_column":"id","delete_action":"CASCADE","disposition":"retain"},
    {"constraint_schema":"public","constraint_name":"entries_show_id_fkey","child_schema":"public","child_table":"entries","child_column":"show_id","parent_schema":"public","parent_table":"shows","parent_column":"id","delete_action":"CASCADE","disposition":"retain"},
    {"constraint_schema":"public","constraint_name":"entry_carts_show_id_fkey","child_schema":"public","child_table":"entry_carts","child_column":"show_id","parent_schema":"public","parent_table":"shows","parent_column":"id","delete_action":"CASCADE","disposition":"retain"},
    {"constraint_schema":"public","constraint_name":"entry_payment_links_show_id_fkey","child_schema":"public","child_table":"entry_payment_links","child_column":"show_id","parent_schema":"public","parent_table":"shows","parent_column":"id","delete_action":"CASCADE","disposition":"retain"},
    {"constraint_schema":"public","constraint_name":"judge_assignments_show_id_fkey","child_schema":"public","child_table":"judge_assignments","child_column":"show_id","parent_schema":"public","parent_table":"shows","parent_column":"id","delete_action":"CASCADE","disposition":"retain"},
    {"constraint_schema":"public","constraint_name":"paperwork_prints_show_id_fkey","child_schema":"public","child_table":"paperwork_prints","child_column":"show_id","parent_schema":"public","parent_table":"shows","parent_column":"id","delete_action":"CASCADE","disposition":"retain"},
    {"constraint_schema":"public","constraint_name":"premium_generation_attempts_show_id_fkey","child_schema":"public","child_table":"premium_generation_attempts","child_column":"show_id","parent_schema":"public","parent_table":"shows","parent_column":"id","delete_action":"CASCADE","disposition":"retain"},
    {"constraint_schema":"public","constraint_name":"premium_generations_show_id_fkey","child_schema":"public","child_table":"premium_generations","child_column":"show_id","parent_schema":"public","parent_table":"shows","parent_column":"id","delete_action":"CASCADE","disposition":"retain"},
    {"constraint_schema":"public","constraint_name":"promo_codes_show_id_fkey","child_schema":"public","child_table":"promo_codes","child_column":"show_id","parent_schema":"public","parent_table":"shows","parent_column":"id","delete_action":"CASCADE","disposition":"retain"},
    {"constraint_schema":"public","constraint_name":"result_submissions_show_id_fkey","child_schema":"public","child_table":"result_submissions","child_column":"show_id","parent_schema":"public","parent_table":"shows","parent_column":"id","delete_action":"CASCADE","disposition":"retain"},
    {"constraint_schema":"public","constraint_name":"ringside_sessions_show_id_fkey","child_schema":"public","child_table":"ringside_sessions","child_column":"show_id","parent_schema":"public","parent_table":"shows","parent_column":"id","delete_action":"CASCADE","disposition":"retain"},
    {"constraint_schema":"public","constraint_name":"role_requests_show_id_fkey","child_schema":"public","child_table":"role_requests","child_column":"show_id","parent_schema":"public","parent_table":"shows","parent_column":"id","delete_action":"SET NULL","disposition":"retain"},
    {"constraint_schema":"public","constraint_name":"secretary_tasks_show_id_fkey","child_schema":"public","child_table":"secretary_tasks","child_column":"show_id","parent_schema":"public","parent_table":"shows","parent_column":"id","delete_action":"SET NULL","disposition":"retain"},
    {"constraint_schema":"public","constraint_name":"show_announcements_show_id_fkey","child_schema":"public","child_table":"show_announcements","child_column":"show_id","parent_schema":"public","parent_table":"shows","parent_column":"id","delete_action":"CASCADE","disposition":"retain"},
    {"constraint_schema":"public","constraint_name":"show_eve_nudge_log_show_id_fkey","child_schema":"public","child_table":"show_eve_nudge_log","child_column":"show_id","parent_schema":"public","parent_table":"shows","parent_column":"id","delete_action":"CASCADE","disposition":"retain"},
    {"constraint_schema":"public","constraint_name":"show_incidents_show_id_fkey","child_schema":"public","child_table":"show_incidents","child_column":"show_id","parent_schema":"public","parent_table":"shows","parent_column":"id","delete_action":"CASCADE","disposition":"retain"},
    {"constraint_schema":"public","constraint_name":"show_lifecycle_email_jobs_show_id_fkey","child_schema":"public","child_table":"show_lifecycle_email_jobs","child_column":"show_id","parent_schema":"public","parent_table":"shows","parent_column":"id","delete_action":"CASCADE","disposition":"retain"},
    {"constraint_schema":"public","constraint_name":"show_lifecycle_email_steps_show_id_fkey","child_schema":"public","child_table":"show_lifecycle_email_steps","child_column":"show_id","parent_schema":"public","parent_table":"shows","parent_column":"id","delete_action":"CASCADE","disposition":"retain"},
    {"constraint_schema":"public","constraint_name":"show_message_threads_show_id_fkey","child_schema":"public","child_table":"show_message_threads","child_column":"show_id","parent_schema":"public","parent_table":"shows","parent_column":"id","delete_action":"CASCADE","disposition":"retain"},
    {"constraint_schema":"public","constraint_name":"show_messages_show_id_fkey","child_schema":"public","child_table":"show_messages","child_column":"show_id","parent_schema":"public","parent_table":"shows","parent_column":"id","delete_action":"CASCADE","disposition":"retain"},
    {"constraint_schema":"public","constraint_name":"show_money_locks_show_id_fkey","child_schema":"public","child_table":"show_money_locks","child_column":"show_id","parent_schema":"public","parent_table":"shows","parent_column":"id","delete_action":"CASCADE","disposition":"retain"},
    {"constraint_schema":"public","constraint_name":"show_officials_show_id_fkey","child_schema":"public","child_table":"show_officials","child_column":"show_id","parent_schema":"public","parent_table":"shows","parent_column":"id","delete_action":"CASCADE","disposition":"retain"},
    {"constraint_schema":"public","constraint_name":"show_passcodes_show_id_fkey","child_schema":"public","child_table":"show_passcodes","child_column":"show_id","parent_schema":"public","parent_table":"shows","parent_column":"id","delete_action":"CASCADE","disposition":"retain"},
    {"constraint_schema":"public","constraint_name":"show_payouts_show_id_fkey","child_schema":"public","child_table":"show_payouts","child_column":"show_id","parent_schema":"public","parent_table":"shows","parent_column":"id","delete_action":"CASCADE","disposition":"retain"},
    {"constraint_schema":"public","constraint_name":"show_visibility_settings_show_id_fkey","child_schema":"public","child_table":"show_visibility_settings","child_column":"show_id","parent_schema":"public","parent_table":"shows","parent_column":"id","delete_action":"CASCADE","disposition":"retain"},
    {"constraint_schema":"public","constraint_name":"stripe_orders_show_id_fkey","child_schema":"public","child_table":"stripe_orders","child_column":"show_id","parent_schema":"public","parent_table":"shows","parent_column":"id","delete_action":"RESTRICT","disposition":"retain"},
    {"constraint_schema":"public","constraint_name":"support_tickets_show_id_fkey","child_schema":"public","child_table":"support_tickets","child_column":"show_id","parent_schema":"public","parent_table":"shows","parent_column":"id","delete_action":"SET NULL","disposition":"retain"},
    {"constraint_schema":"public","constraint_name":"trial_packet_generation_claims_show_id_fkey","child_schema":"public","child_table":"trial_packet_generation_claims","child_column":"show_id","parent_schema":"public","parent_table":"shows","parent_column":"id","delete_action":"CASCADE","disposition":"retain"},
    {"constraint_schema":"public","constraint_name":"trial_packet_print_reminders_show_id_fkey","child_schema":"public","child_table":"trial_packet_print_reminders","child_column":"show_id","parent_schema":"public","parent_table":"shows","parent_column":"id","delete_action":"CASCADE","disposition":"retain"},
    {"constraint_schema":"public","constraint_name":"trial_packet_snapshots_show_id_fkey","child_schema":"public","child_table":"trial_packet_snapshots","child_column":"show_id","parent_schema":"public","parent_table":"shows","parent_column":"id","delete_action":"RESTRICT","disposition":"retain"},
    {"constraint_schema":"public","constraint_name":"trials_show_id_fkey","child_schema":"public","child_table":"trials","child_column":"show_id","parent_schema":"public","parent_table":"shows","parent_column":"id","delete_action":"CASCADE","disposition":"disposable"},
    {"constraint_schema":"public","constraint_name":"user_roles_show_id_fkey","child_schema":"public","child_table":"user_roles","child_column":"show_id","parent_schema":"public","parent_table":"shows","parent_column":"id","delete_action":"CASCADE","disposition":"retain"},
    {"constraint_schema":"public","constraint_name":"volunteer_general_assignments_show_id_fkey","child_schema":"public","child_table":"volunteer_general_assignments","child_column":"show_id","parent_schema":"public","parent_table":"shows","parent_column":"id","delete_action":"CASCADE","disposition":"retain"},
    {"constraint_schema":"public","constraint_name":"volunteers_show_id_fkey","child_schema":"public","child_table":"volunteers","child_column":"show_id","parent_schema":"public","parent_table":"shows","parent_column":"id","delete_action":"CASCADE","disposition":"retain"},
    {"constraint_schema":"public","constraint_name":"activity_log_trial_id_fkey","child_schema":"public","child_table":"activity_log","child_column":"trial_id","parent_schema":"public","parent_table":"trials","parent_column":"id","delete_action":"CASCADE","disposition":"retain"},
    {"constraint_schema":"public","constraint_name":"announcements_trial_id_fkey","child_schema":"public","child_table":"announcements","child_column":"trial_id","parent_schema":"public","parent_table":"trials","parent_column":"id","delete_action":"CASCADE","disposition":"retain"},
    {"constraint_schema":"public","constraint_name":"armbands_trial_id_fkey","child_schema":"public","child_table":"armbands","child_column":"trial_id","parent_schema":"public","parent_table":"trials","parent_column":"id","delete_action":"CASCADE","disposition":"retain"},
    {"constraint_schema":"public","constraint_name":"classes_trial_id_fkey","child_schema":"public","child_table":"classes","child_column":"trial_id","parent_schema":"public","parent_table":"trials","parent_column":"id","delete_action":"CASCADE","disposition":"disposable"},
    {"constraint_schema":"public","constraint_name":"entries_trial_id_fkey","child_schema":"public","child_table":"entries","child_column":"trial_id","parent_schema":"public","parent_table":"trials","parent_column":"id","delete_action":"CASCADE","disposition":"retain"},
    {"constraint_schema":"public","constraint_name":"judge_assignments_trial_id_fkey","child_schema":"public","child_table":"judge_assignments","child_column":"trial_id","parent_schema":"public","parent_table":"trials","parent_column":"id","delete_action":"CASCADE","disposition":"retain"},
    {"constraint_schema":"public","constraint_name":"paperwork_prints_trial_id_fkey","child_schema":"public","child_table":"paperwork_prints","child_column":"trial_id","parent_schema":"public","parent_table":"trials","parent_column":"id","delete_action":"CASCADE","disposition":"retain"},
    {"constraint_schema":"public","constraint_name":"promo_codes_trial_id_fkey","child_schema":"public","child_table":"promo_codes","child_column":"trial_id","parent_schema":"public","parent_table":"trials","parent_column":"id","delete_action":"CASCADE","disposition":"retain"},
    {"constraint_schema":"public","constraint_name":"result_submissions_trial_id_fkey","child_schema":"public","child_table":"result_submissions","child_column":"trial_id","parent_schema":"public","parent_table":"trials","parent_column":"id","delete_action":"CASCADE","disposition":"retain"},
    {"constraint_schema":"public","constraint_name":"show_incidents_trial_id_fkey","child_schema":"public","child_table":"show_incidents","child_column":"trial_id","parent_schema":"public","parent_table":"trials","parent_column":"id","delete_action":"SET NULL","disposition":"retain"},
    {"constraint_schema":"public","constraint_name":"trial_checklist_state_trial_id_fkey","child_schema":"public","child_table":"trial_checklist_state","child_column":"trial_id","parent_schema":"public","parent_table":"trials","parent_column":"id","delete_action":"CASCADE","disposition":"retain"},
    {"constraint_schema":"public","constraint_name":"trial_judge_supplies_trial_id_fkey","child_schema":"public","child_table":"trial_judge_supplies","child_column":"trial_id","parent_schema":"public","parent_table":"trials","parent_column":"id","delete_action":"CASCADE","disposition":"retain"},
    {"constraint_schema":"public","constraint_name":"trial_visibility_overrides_trial_id_fkey","child_schema":"public","child_table":"trial_visibility_overrides","child_column":"trial_id","parent_schema":"public","parent_table":"trials","parent_column":"id","delete_action":"CASCADE","disposition":"retain"},
    {"constraint_schema":"public","constraint_name":"volunteer_general_assignments_trial_id_fkey","child_schema":"public","child_table":"volunteer_general_assignments","child_column":"trial_id","parent_schema":"public","parent_table":"trials","parent_column":"id","delete_action":"CASCADE","disposition":"retain"}
  ]
  $manifest$::pg_catalog.jsonb;
  v_edge record;
  v_fk_drift text;
  v_has_retained_child boolean;
  v_cross_show_entry boolean;
BEGIN
  IF NOT (SELECT public.is_platform_admin()) THEN
    RAISE EXCEPTION 'Permission denied: only site administrators can permanently delete shows'
      USING ERRCODE = '42501';
  END IF;

  PERFORM pg_catalog.set_config('lock_timeout', '2s', true);
  PERFORM 1
  FROM public.shows
  WHERE id = p_show_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Show not found' USING ERRCODE = 'P0002';
  END IF;
  PERFORM 1
  FROM public.trials
  WHERE show_id = p_show_id
  ORDER BY id
  FOR UPDATE;
  PERFORM 1
  FROM public.classes AS c
  JOIN public.trials AS t ON t.id = c.trial_id
  WHERE t.show_id = p_show_id
  ORDER BY c.id
  FOR UPDATE OF c;

  -- Compare both directions so missing, extra, renamed, retargeted, re-columned,
  -- or action-changed constraints fail closed before checking rows or deleting.
  WITH actual AS (
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
      AND c.confrelid IN ('public.shows'::pg_catalog.regclass,
                          'public.trials'::pg_catalog.regclass,
                          'public.classes'::pg_catalog.regclass)
  ), reviewed AS (
    SELECT * FROM pg_catalog.jsonb_to_recordset(v_fk_manifest) AS manifest(
      constraint_schema text, constraint_name text, child_schema text, child_table text,
      child_column text, parent_schema text, parent_table text, parent_column text,
      delete_action text, disposition text
    )
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
  )
  SELECT pg_catalog.string_agg(
    DISTINCT constraint_schema || '.' || constraint_name, ', ' ORDER BY constraint_schema || '.' || constraint_name
  ) INTO v_fk_drift
  FROM delta;

  IF v_fk_drift IS NOT NULL THEN
    RAISE EXCEPTION 'Unclassified or changed show/trial/class foreign-key edge(s): %', v_fk_drift
      USING ERRCODE = '23503';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.entries AS e
    WHERE e.show_id IS DISTINCT FROM p_show_id
      AND (e.trial_id IN (SELECT id FROM public.trials WHERE show_id = p_show_id)
        OR e.class_id IN (
          SELECT c.id FROM public.classes AS c
          JOIN public.trials AS t ON t.id = c.trial_id WHERE t.show_id = p_show_id
        )
        OR e.registration_id IN (SELECT id FROM public.enrollments WHERE show_id = p_show_id))
  ) INTO v_cross_show_entry;
  IF v_cross_show_entry THEN
    RAISE EXCEPTION 'Cross-show entry association prevents permanent show deletion'
      USING ERRCODE = '23503';
  END IF;

  IF EXISTS (SELECT 1 FROM public.enrollments WHERE show_id = p_show_id)
     OR EXISTS (
       SELECT 1 FROM public.entries AS e
       WHERE e.show_id = p_show_id
          OR e.trial_id IN (SELECT id FROM public.trials WHERE show_id = p_show_id)
          OR e.class_id IN (
            SELECT c.id FROM public.classes AS c
            JOIN public.trials AS t ON t.id = c.trial_id WHERE t.show_id = p_show_id
          )
          OR e.registration_id IN (SELECT id FROM public.enrollments WHERE show_id = p_show_id)
     ) THEN
    RAISE EXCEPTION 'Show has entries or enrollments; permanent deletion is limited to unused shows'
      USING ERRCODE = '23503';
  END IF;

  -- All identifiers come from the constant manifest, are schema-qualified, and
  -- pass through %I. The only runtime value is bound with USING, never pasted.
  FOR v_edge IN
    SELECT * FROM pg_catalog.jsonb_to_recordset(v_fk_manifest) AS manifest(
      constraint_schema text, constraint_name text, child_schema text, child_table text,
      child_column text, parent_schema text, parent_table text, parent_column text,
      delete_action text, disposition text
    )
    ORDER BY constraint_name
  LOOP
    IF v_edge.disposition = 'retain' THEN
      IF v_edge.parent_table = 'shows' THEN
        EXECUTE pg_catalog.format(
          'SELECT EXISTS (SELECT 1 FROM %I.%I AS child WHERE child.%I = $1)',
          v_edge.child_schema, v_edge.child_table, v_edge.child_column
        ) INTO v_has_retained_child USING p_show_id;
      ELSIF v_edge.parent_table = 'trials' THEN
        EXECUTE pg_catalog.format(
          'SELECT EXISTS (SELECT 1 FROM %I.%I AS child WHERE child.%I IN '
          '(SELECT target_trial.id FROM public.trials AS target_trial WHERE target_trial.show_id = $1))',
          v_edge.child_schema, v_edge.child_table, v_edge.child_column
        ) INTO v_has_retained_child USING p_show_id;
      ELSE
        EXECUTE pg_catalog.format(
          'SELECT EXISTS (SELECT 1 FROM %I.%I AS child WHERE child.%I IN '
          '(SELECT target_class.id FROM public.classes AS target_class '
          'JOIN public.trials AS target_trial ON target_trial.id = target_class.trial_id '
          'WHERE target_trial.show_id = $1))',
          v_edge.child_schema, v_edge.child_table, v_edge.child_column
        ) INTO v_has_retained_child USING p_show_id;
      END IF;
      IF v_has_retained_child THEN
        RAISE EXCEPTION 'Retained evidence in %.% (constraint %) prevents permanent deletion',
          v_edge.child_schema, v_edge.child_table, v_edge.constraint_name
          USING ERRCODE = '23503';
      END IF;
    END IF;
  END LOOP;

  DELETE FROM public.classes AS c
  USING public.trials AS t
  WHERE t.id = c.trial_id AND t.show_id = p_show_id;
  DELETE FROM public.trials WHERE show_id = p_show_id;
  DELETE FROM public.shows WHERE id = p_show_id;
EXCEPTION WHEN lock_not_available THEN
  RAISE EXCEPTION
    'Show deletion encountered a lock conflict within the 2-second timeout; no deletion occurred. An operator may retry during a quiet window; automated retries are disabled.'
    USING ERRCODE = '55P03';
END;
$$;

REVOKE ALL ON FUNCTION public.hard_delete_show(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hard_delete_show(UUID) TO authenticated;

DROP POLICY IF EXISTS shows_delete ON public.shows;
REVOKE DELETE ON TABLE public.shows FROM PUBLIC, anon, authenticated;
