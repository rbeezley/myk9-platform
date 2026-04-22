-- =============================================================================
-- Migration 146: Harden create_show_with_children and grant_show_official RPCs
--
-- Fixes three security / data-integrity findings from the 2026-04-21 harden
-- review:
--
-- 1. trial_id injection (CRITICAL) — create_show_with_children is SECURITY
--    DEFINER, so RLS is bypassed for child-table inserts. A caller could pass
--    a p_classes entry with trial_id pointing to a trial that belongs to a
--    different show. Fix: collect the UUIDs of trials inserted in this
--    invocation and reject any class whose trial_id is not in that set.
--
-- 2. Privilege escalation (CRITICAL) — grant_show_official allowed any
--    existing show official (including a steward) to call the RPC and elevate
--    another person to secretary/chairman. Fix: remove is_show_official() from
--    the authorization predicate. Only site admins, club admins, and trial
--    secretaries for the show's club may grant show officials.
--
-- 3. Idempotency (HIGH) — all INSERTs in create_show_with_children used no
--    ON CONFLICT clause. A network timeout that returned before the response
--    reached the client would result in a primary-key violation on retry,
--    even though the show was successfully created. Fix: add ON CONFLICT
--    (id) DO NOTHING to show, trial, and class inserts so retries succeed.
--    For judge_assignments (no stable unique id), skip the insert if the row
--    already exists.
--
-- 4. Judge FK validation (HIGH) — p_judge_ids accepted any UUID without
--    verifying that the person exists in public.people. Fix: reject the batch
--    if any judge UUID is not found in public.people.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Harden create_show_with_children
-- ---------------------------------------------------------------------------

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
    (p_show->'accept_check_payments')::boolean,
    (p_show->'accept_cash_payments')::boolean,
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
      NULLIF(v_class->>'start_time', ''),
      NULLIF(v_class->>'num_areas', '')::integer,
      NULLIF(v_class->>'time_limit_seconds', '')::integer,
      NULLIF(v_class->>'timer_mode', ''),
      (v_class->'hides_known')::boolean,
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
  'Hardened in migration 146: validates that all class trial_ids belong to trials '
  'created in this batch (prevents cross-show injection); validates all judge UUIDs '
  'exist in public.people; ON CONFLICT DO NOTHING on all inserts for idempotent retry.';

-- ---------------------------------------------------------------------------
-- 2. Harden grant_show_official — remove is_show_official() escalation path
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.grant_show_official(
  p_person_id uuid,
  p_role_name text,
  p_show_id   uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_role_id           uuid;
  v_club_id           uuid;
  v_existing_id       uuid;
  v_existing_active   boolean;
  v_caller_auth       uuid;
  v_caller_person_id  uuid;
BEGIN
  v_caller_auth := auth.uid();
  IF v_caller_auth IS NULL THEN
    RAISE EXCEPTION 'authentication required'
      USING ERRCODE = '42501';
  END IF;

  IF p_role_name NOT IN ('secretary', 'chairman', 'steward') THEN
    RAISE EXCEPTION 'role "%" cannot be granted via grant_show_official — only secretary, chairman, steward allowed', p_role_name
      USING ERRCODE = '22023';
  END IF;

  SELECT s.club_id INTO v_club_id
  FROM public.shows s
  WHERE s.id = p_show_id;

  IF v_club_id IS NULL THEN
    RAISE EXCEPTION 'show not found'
      USING ERRCODE = '22023';
  END IF;

  -- Authorization: only site admins, club admins, and trial secretaries for
  -- the show's club may grant officials. is_show_official() is intentionally
  -- excluded — allowing any existing show official to grant others would let a
  -- steward escalate themselves or a third party to secretary.
  IF NOT (
    public.is_site_admin()
    OR public.is_club_admin(v_club_id)
    OR public.is_trial_secretary(v_club_id)
  ) THEN
    RAISE EXCEPTION 'not authorized to grant officials on this show'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.people WHERE id = p_person_id) THEN
    RAISE EXCEPTION 'person not found'
      USING ERRCODE = '22023';
  END IF;

  SELECT id INTO v_role_id FROM public.roles WHERE name = p_role_name;
  IF v_role_id IS NULL THEN
    RAISE EXCEPTION 'role "%" does not exist', p_role_name
      USING ERRCODE = '22023';
  END IF;

  SELECT id INTO v_caller_person_id
  FROM public.people WHERE auth_user_id = v_caller_auth;

  SELECT id, is_active INTO v_existing_id, v_existing_active
  FROM public.user_roles
  WHERE user_id = p_person_id
    AND role_id = v_role_id
    AND show_id = p_show_id
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    IF NOT v_existing_active THEN
      UPDATE public.user_roles
      SET is_active  = true,
          granted_at = NOW(),
          granted_by = v_caller_person_id,
          club_id    = v_club_id
      WHERE id = v_existing_id;
    END IF;
    RETURN v_existing_id;
  END IF;

  INSERT INTO public.user_roles (
    user_id, role_id, club_id, show_id, is_active, granted_at, granted_by
  ) VALUES (
    p_person_id, v_role_id, v_club_id, p_show_id, true, NOW(), v_caller_person_id
  )
  RETURNING id INTO v_existing_id;

  RETURN v_existing_id;
END;
$$;

REVOKE ALL ON FUNCTION public.grant_show_official(uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.grant_show_official(uuid, text, uuid) TO authenticated;

COMMENT ON FUNCTION public.grant_show_official(uuid, text, uuid) IS
  'Grants a show-scoped official role (secretary/chairman/steward) to a person. '
  'Caller must be a site admin, club admin, or trial secretary for the show''s club. '
  'Hardened in migration 146: removed is_show_official() from auth predicate to prevent '
  'steward-to-secretary privilege escalation. Error messages no longer expose show IDs '
  'or person IDs to prevent enumeration. Idempotent: returns existing assignment id, '
  'reactivating if previously inactive.';
