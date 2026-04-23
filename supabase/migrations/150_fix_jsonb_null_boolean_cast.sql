-- =============================================================================
-- Migration 150: Fix jsonb-null → boolean cast in create_show_with_children
--
-- Bug: migration 149 fixed the TEXT→TIME cast for start_time, but three boolean
-- columns still used the -> operator (returns jsonb). When the payload contains
-- JSON null (e.g. hides_known: null, accept_check_payments: null), the -> operator
-- returns a jsonb null value. Casting jsonb null to boolean fails with:
--   "cannot cast jsonb null to type boolean"
-- Note: SQL NULL::boolean is fine; only jsonb-null::boolean fails.
--
-- Fix: switch all boolean extractions to ->> (returns TEXT). JSON null via ->>
-- produces SQL NULL, and NULL::boolean is perfectly valid.
--   accept_check_payments, accept_cash_payments (show level)
--   hides_known (class level)
-- All other logic is unchanged from migration 149.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.create_show_with_children(
  p_show      jsonb,
  p_trials    jsonb,
  p_classes   jsonb,
  p_judge_ids uuid[]
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_auth        uuid;
  v_club_id            uuid;
  v_show_id            uuid;
  v_trial              jsonb;
  v_class              jsonb;
  v_judge_id           uuid;
  v_inserted_trial_ids uuid[] := ARRAY[]::uuid[];
  v_class_trial_id     uuid;
BEGIN
  v_caller_auth := auth.uid();
  IF v_caller_auth IS NULL THEN
    RAISE EXCEPTION 'authentication required'
      USING ERRCODE = '42501';
  END IF;

  v_club_id := (p_show->>'club_id')::uuid;
  IF v_club_id IS NULL THEN
    RAISE EXCEPTION 'p_show must include a non-null club_id'
      USING ERRCODE = '22023';
  END IF;

  IF NOT (
    public.is_site_admin()
    OR public.is_club_admin(v_club_id)
    OR public.is_trial_secretary(v_club_id)
  ) THEN
    RAISE EXCEPTION 'not authorized to create shows for club %', v_club_id
      USING ERRCODE = '42501';
  END IF;

  v_show_id := (p_show->>'id')::uuid;
  IF v_show_id IS NULL THEN
    RAISE EXCEPTION 'p_show must include a non-null id'
      USING ERRCODE = '22023';
  END IF;

  -- Validate that all judge UUIDs exist in public.people before writing anything
  IF p_judge_ids IS NOT NULL AND array_length(p_judge_ids, 1) > 0 THEN
    IF EXISTS (
      SELECT 1
      FROM unnest(p_judge_ids) AS j(judge_uuid)
      WHERE NOT EXISTS (SELECT 1 FROM public.people WHERE id = j.judge_uuid)
    ) THEN
      RAISE EXCEPTION 'one or more p_judge_ids do not exist in public.people'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  -- Insert show (idempotent: ignore if already exists with same id)
  INSERT INTO public.shows (
    id, name, organization, start_date, end_date, location, status,
    club_id, entry_open_date, entry_close_date, pre_entry_fee,
    day_of_show_fee, accept_check_payments, accept_cash_payments,
    updated_at
  ) VALUES (
    v_show_id,
    p_show->>'name',
    p_show->>'organization',
    (p_show->>'start_date')::date,
    (p_show->>'end_date')::date,
    NULLIF(p_show->>'location', ''),
    COALESCE(NULLIF(p_show->>'status', ''), 'draft'),
    v_club_id,
    NULLIF(p_show->>'entry_open_date', '')::date,
    NULLIF(p_show->>'entry_close_date', '')::date,
    NULLIF(p_show->>'pre_entry_fee', '')::numeric,
    NULLIF(p_show->>'day_of_show_fee', '')::numeric,
    (p_show->>'accept_check_payments')::boolean,
    (p_show->>'accept_cash_payments')::boolean,
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;

  -- Insert trials; collect inserted UUIDs for class-injection validation
  FOR v_trial IN SELECT value FROM jsonb_array_elements(COALESCE(p_trials, '[]'::jsonb))
  LOOP
    INSERT INTO public.trials (
      id, show_id, name, date, trial_number, status, trial_type,
      planned_start_time, event_number, display_order, category, updated_at
    ) VALUES (
      (v_trial->>'id')::uuid,
      v_show_id,
      v_trial->>'name',
      (v_trial->>'date')::date,
      NULLIF(v_trial->>'trial_number', ''),
      COALESCE(NULLIF(v_trial->>'status', ''), 'upcoming'),
      NULLIF(v_trial->>'trial_type', ''),
      NULLIF(v_trial->>'planned_start_time', ''),
      NULLIF(v_trial->>'event_number', ''),
      NULLIF(v_trial->>'display_order', '')::integer,
      NULLIF(v_trial->>'category', ''),
      NOW()
    )
    ON CONFLICT (id) DO NOTHING;

    v_inserted_trial_ids := array_append(v_inserted_trial_ids, (v_trial->>'id')::uuid);
  END LOOP;

  -- Insert classes; reject any whose trial_id was not created in this batch
  FOR v_class IN SELECT value FROM jsonb_array_elements(COALESCE(p_classes, '[]'::jsonb))
  LOOP
    v_class_trial_id := (v_class->>'trial_id')::uuid;
    IF NOT v_class_trial_id = ANY(v_inserted_trial_ids) THEN
      RAISE EXCEPTION 'class trial_id % is not a trial created in this batch', v_class_trial_id
        USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.classes (
      id, trial_id, name, level, element, section,
      entry_fee, max_entries, status, start_time,
      num_areas, time_limit_seconds, timer_mode,
      hides_known, distraction_count, updated_at
    ) VALUES (
      (v_class->>'id')::uuid,
      v_class_trial_id,
      v_class->>'name',
      NULLIF(v_class->>'level', ''),
      NULLIF(v_class->>'element', ''),
      NULLIF(v_class->>'section', ''),
      NULLIF(v_class->>'entry_fee', '')::numeric,
      NULLIF(v_class->>'max_entries', '')::integer,
      COALESCE(NULLIF(v_class->>'status', ''), 'upcoming'),
      NULLIF(v_class->>'start_time', '')::TIME,
      NULLIF(v_class->>'num_areas', '')::integer,
      NULLIF(v_class->>'time_limit_seconds', '')::integer,
      NULLIF(v_class->>'timer_mode', ''),
      (v_class->>'hides_known')::boolean,
      NULLIF(v_class->>'distraction_count', '')::integer,
      NOW()
    )
    ON CONFLICT (id) DO NOTHING;
  END LOOP;

  -- Insert judge assignments (skip duplicates)
  FOREACH v_judge_id IN ARRAY COALESCE(p_judge_ids, ARRAY[]::uuid[])
  LOOP
    INSERT INTO public.judge_assignments (
      person_id, show_id, status, confirmed_at
    )
    SELECT v_judge_id, v_show_id, 'confirmed', NOW()
    WHERE NOT EXISTS (
      SELECT 1 FROM public.judge_assignments
      WHERE person_id = v_judge_id AND show_id = v_show_id
    );
  END LOOP;

  RETURN v_show_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_show_with_children(jsonb, jsonb, jsonb, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_show_with_children(jsonb, jsonb, jsonb, uuid[]) TO authenticated;

COMMENT ON FUNCTION public.create_show_with_children(jsonb, jsonb, jsonb, uuid[]) IS
  'Atomically creates a show with its trials, classes, and judge assignments. '
  'Fixed in migration 150: switched boolean extractions (accept_check_payments, '
  'accept_cash_payments, hides_known) from -> to ->> to avoid jsonb-null cast failure. '
  'Fixed in migration 149: added ::TIME cast to classes.start_time. '
  'Hardened in migration 146: validates class trial_ids and judge UUIDs; idempotent inserts.';
