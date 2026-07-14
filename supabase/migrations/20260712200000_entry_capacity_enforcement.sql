-- Race-safe class + judge-day capacity enforcement for every online entry
-- write boundary.
--
-- OpenSpec change: stripe-golive-enforcement (Phase A).
--
-- Rollout is backward compatible:
--   * submit_show_entries keeps its five-argument signature.
--   * submission_source is an additive key inside each p_entries JSON object.
--   * the legacy result.entries array still contains created entries only.
--   * result.outcomes is additive; a tolerant client deploys before this migration.
--
-- Lock order:
--   1. showcapacity:<show id> (serializes multi-class submit batches)
--   2. class id (EXACT existing add_to_waitlist/promotion identity)
--   3. judgeday:<judge id>:<trial date> in judge-id order
--
-- Emergency rollback: restore submit_show_entries from 20260711190000 and
-- create_online_paid_entry from 20260628202146, then DROP FUNCTION
-- public.evaluate_entry_capacity(uuid,uuid,uuid,uuid,text,boolean). The client
-- accepts the legacy response, so rollback does not require a client rollback.

-- Keep the physical judge-day pool aligned with active assignments. Pending or
-- cancelled assignments must not alter capacity for confirmed judge work.
CREATE OR REPLACE FUNCTION public.get_judge_day_capacity_live(
  p_judge_id uuid,
  p_show_id uuid,
  p_date date
)
RETURNS TABLE (
  judge_id uuid,
  show_date date,
  capacity integer,
  confirmed_count integer,
  waitlist_count integer,
  mail_in_reserved integer,
  available_spots integer,
  class_ids uuid[]
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_capacity integer;
  v_override integer;
  v_show_capacity integer;
  v_confirmed integer;
  v_waitlist integer;
  v_reserved integer;
  v_class_ids uuid[];
  v_mail_in_strategy text;
  v_mail_in_value integer;
  v_mail_in_auto_release boolean;
  v_mail_in_release_date date;
BEGIN
  SELECT COALESCE(ARRAY_AGG(DISTINCT ja.class_id), ARRAY[]::uuid[])
  INTO v_class_ids
  FROM public.judge_assignments ja
  JOIN public.classes c ON c.id = ja.class_id
  JOIN public.trials t ON t.id = c.trial_id
  WHERE ja.person_id = p_judge_id
    AND ja.show_id = p_show_id
    AND t.date = p_date
    AND ja.status = 'confirmed';

  SELECT
    s.default_judge_day_capacity,
    s.mail_in_strategy,
    s.mail_in_value,
    s.mail_in_auto_release,
    s.mail_in_release_date
  INTO
    v_show_capacity,
    v_mail_in_strategy,
    v_mail_in_value,
    v_mail_in_auto_release,
    v_mail_in_release_date
  FROM public.shows s
  WHERE s.id = p_show_id;

  SELECT MAX(ja.day_capacity_override)
  INTO v_override
  FROM public.judge_assignments ja
  JOIN public.classes c ON c.id = ja.class_id
  JOIN public.trials t ON t.id = c.trial_id
  WHERE ja.person_id = p_judge_id
    AND ja.show_id = p_show_id
    AND t.date = p_date
    AND ja.status = 'confirmed'
    AND ja.day_capacity_override IS NOT NULL;

  v_capacity := COALESCE(v_override, v_show_capacity, 125);

  v_reserved := 0;
  IF NOT (
    COALESCE(v_mail_in_auto_release, false)
    AND v_mail_in_release_date IS NOT NULL
    AND v_mail_in_release_date <= CURRENT_DATE
  ) THEN
    IF v_mail_in_strategy = 'fixed' THEN
      v_reserved := GREATEST(0, COALESCE(v_mail_in_value, 0));
    ELSIF v_mail_in_strategy = 'percentage' THEN
      v_reserved := GREATEST(0, FLOOR(v_capacity * COALESCE(v_mail_in_value, 0) / 100.0));
    END IF;
  END IF;

  SELECT COUNT(*)
  INTO v_confirmed
  FROM public.entries e
  WHERE e.class_id = ANY(v_class_ids)
    AND e.entry_status IN ('submitted', 'paid', 'confirmed', 'checked-in', 'competing', 'in-ring', 'pending-payment')
    AND e.deleted_at IS NULL;

  SELECT COUNT(*)
  INTO v_waitlist
  FROM public.waitlist_entries we
  WHERE we.class_id = ANY(v_class_ids)
    AND we.status = 'waiting';

  judge_id := p_judge_id;
  show_date := p_date;
  capacity := v_capacity;
  confirmed_count := v_confirmed;
  waitlist_count := v_waitlist;
  mail_in_reserved := v_reserved;
  available_spots := GREATEST(0, v_capacity - v_confirmed - v_reserved);
  class_ids := v_class_ids;

  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.get_judge_day_capacity_live(uuid, uuid, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_judge_day_capacity_live(uuid, uuid, date) TO service_role;


ALTER TABLE public.entries
  ADD COLUMN IF NOT EXISTS capacity_override boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.entries.capacity_override IS
  'True only when an authorized show-desk user explicitly entered a selection already at capacity.';

CREATE OR REPLACE FUNCTION public.evaluate_entry_capacity(
  p_class_id uuid,
  p_dog_id uuid,
  p_exhibitor_id uuid,
  p_handler_id uuid,
  p_submission_source text,
  p_allow_override boolean DEFAULT false
)
RETURNS TABLE (
  outcome text,
  waitlist_entry_id uuid,
  waitlist_position integer,
  resolved_show_id uuid,
  resolved_trial_id uuid,
  capacity_override boolean
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_trial_date date;
  v_allow_waitlist boolean;
  v_class_limit integer;
  v_class_count integer;
  v_is_full boolean := false;
  v_judge_id uuid;
  v_judge_capacity record;
  v_available integer;
  v_joined_via text;
BEGIN
  IF p_submission_source NOT IN ('self_service', 'organizer', 'show_desk') THEN
    RAISE EXCEPTION 'invalid submission source: %', p_submission_source
      USING ERRCODE = '22023';
  END IF;

  SELECT c.trial_id, t.show_id, t.date, COALESCE(c.allow_waitlist, false), c.max_entries
  INTO resolved_trial_id, resolved_show_id, v_trial_date, v_allow_waitlist, v_class_limit
  FROM public.classes c
  JOIN public.trials t ON t.id = c.trial_id
  WHERE c.id = p_class_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'class % not found', p_class_id
      USING ERRCODE = 'P0002';
  END IF;

  -- One common first lock prevents two submit_show_entries batches from taking
  -- different class/judge locks in opposite order. Existing single-entry and
  -- waitlist promotion paths still coordinate on the exact class/judge locks.
  PERFORM pg_advisory_xact_lock(
    hashtext('showcapacity:' || resolved_show_id::text)
  );
  PERFORM pg_advisory_xact_lock(hashtext(p_class_id::text));

  SELECT COUNT(*)::integer
  INTO v_class_count
  FROM public.entries e
  WHERE e.class_id = p_class_id
    AND e.entry_status IN (
      'submitted', 'paid', 'confirmed', 'checked-in', 'competing', 'in-ring', 'pending-payment'
    )
    AND e.deleted_at IS NULL;

  IF COALESCE(v_class_limit, 0) > 0 AND v_class_count >= v_class_limit THEN
    v_is_full := true;
  END IF;

  FOR v_judge_id IN
    SELECT DISTINCT ja.person_id
    FROM public.judge_assignments ja
    WHERE ja.class_id = p_class_id
      AND ja.show_id = resolved_show_id
      AND ja.status = 'confirmed'
      AND ja.person_id IS NOT NULL
    ORDER BY ja.person_id
  LOOP
    PERFORM pg_advisory_xact_lock(
      hashtext('judgeday:' || v_judge_id::text || ':' || v_trial_date::text)
    );

    SELECT *
    INTO v_judge_capacity
    FROM public.get_judge_day_capacity_live(v_judge_id, resolved_show_id, v_trial_date)
    LIMIT 1;

    IF p_submission_source = 'self_service' THEN
      v_available := COALESCE(v_judge_capacity.available_spots, 0);
    ELSE
      -- Organizer-entered rows consume the physical pool, including the
      -- portion reserved away from self-service online entry.
      v_available := GREATEST(
        0,
        COALESCE(v_judge_capacity.capacity, 0)
          - COALESCE(v_judge_capacity.confirmed_count, 0)
      );
    END IF;

    IF v_available <= 0 THEN
      v_is_full := true;
    END IF;
  END LOOP;

  IF NOT v_is_full THEN
    outcome := 'available';
    waitlist_entry_id := NULL;
    waitlist_position := NULL;
    capacity_override := false;
    RETURN NEXT;
    RETURN;
  END IF;

  IF p_submission_source = 'show_desk' AND p_allow_override THEN
    outcome := 'available';
    waitlist_entry_id := NULL;
    waitlist_position := NULL;
    capacity_override := true;
    RETURN NEXT;
    RETURN;
  END IF;

  IF NOT v_allow_waitlist OR p_exhibitor_id IS NULL THEN
    outcome := 'denied';
    waitlist_entry_id := NULL;
    waitlist_position := NULL;
    capacity_override := false;
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT we.id, we.position
  INTO waitlist_entry_id, waitlist_position
  FROM public.waitlist_entries we
  WHERE we.class_id = p_class_id
    AND we.dog_id = p_dog_id
    AND we.status IN ('waiting', 'offered')
  ORDER BY we.position NULLS LAST, we.created_at
  LIMIT 1;

  IF FOUND THEN
    outcome := 'waitlisted';
    capacity_override := false;
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT COALESCE(MAX(we.position), 0) + 1
  INTO waitlist_position
  FROM public.waitlist_entries we
  WHERE we.class_id = p_class_id
    AND we.status = 'waiting';

  v_joined_via := CASE
    WHEN p_submission_source = 'self_service' THEN 'online'
    ELSE 'mail_in'
  END;

  INSERT INTO public.waitlist_entries (
    class_id,
    exhibitor_id,
    dog_id,
    handler_id,
    position,
    joined_via
  )
  VALUES (
    p_class_id,
    p_exhibitor_id,
    p_dog_id,
    p_handler_id,
    waitlist_position,
    v_joined_via
  )
  ON CONFLICT (class_id, dog_id) WHERE status IN ('waiting', 'offered')
  DO NOTHING
  RETURNING id, position INTO waitlist_entry_id, waitlist_position;

  IF waitlist_entry_id IS NULL THEN
    SELECT we.id, we.position
    INTO waitlist_entry_id, waitlist_position
    FROM public.waitlist_entries we
    WHERE we.class_id = p_class_id
      AND we.dog_id = p_dog_id
      AND we.status IN ('waiting', 'offered')
    ORDER BY we.position NULLS LAST, we.created_at
    LIMIT 1;
  END IF;

  outcome := 'waitlisted';
  capacity_override := false;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.evaluate_entry_capacity(
  uuid, uuid, uuid, uuid, text, boolean
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.evaluate_entry_capacity(
  uuid, uuid, uuid, uuid, text, boolean
) TO service_role;

COMMENT ON FUNCTION public.evaluate_entry_capacity(uuid, uuid, uuid, uuid, text, boolean) IS
  'Shared post-lock class/judge-day capacity decision for paid-cart and submit_show_entries. '
  'Self-service preserves mail-in reserve; organizer uses physical capacity; authorized show_desk '
  'may record an explicit override. Not client-callable.';
