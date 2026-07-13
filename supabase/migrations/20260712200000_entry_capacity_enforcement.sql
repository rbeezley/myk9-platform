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

CREATE OR REPLACE FUNCTION public.create_online_paid_entry(
  p_dog_id uuid,
  p_class_id uuid,
  p_handler_id uuid,
  p_entry_fee numeric,
  p_jump_height text,
  p_special_requests text,
  p_payment_intent_id text,
  p_submitted_at timestamptz,
  p_show_id uuid,
  p_trial_id uuid,
  p_exhibitor_id uuid
)
RETURNS TABLE (
  outcome text,
  entry_id uuid,
  waitlist_entry_id uuid
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_show_id uuid;
  v_trial_id uuid;
  v_entry public.entries;
  v_capacity record;
BEGIN
  SELECT c.trial_id, t.show_id
  INTO v_trial_id, v_show_id
  FROM public.classes c
  JOIN public.trials t ON t.id = c.trial_id
  WHERE c.id = p_class_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Class not found for online paid entry'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_show_id IS DISTINCT FROM p_show_id THEN
    RAISE EXCEPTION 'Class does not belong to paid cart show'
      USING ERRCODE = '23514';
  END IF;

  IF p_trial_id IS NOT NULL AND v_trial_id IS DISTINCT FROM p_trial_id THEN
    RAISE EXCEPTION 'Class does not belong to paid cart trial'
      USING ERRCODE = '23514';
  END IF;

  SELECT *
  INTO v_capacity
  FROM public.evaluate_entry_capacity(
    p_class_id,
    p_dog_id,
    p_exhibitor_id,
    p_handler_id,
    'self_service',
    false
  );

  IF v_capacity.outcome = 'waitlisted' THEN
    outcome := 'waitlisted';
    entry_id := NULL;
    waitlist_entry_id := v_capacity.waitlist_entry_id;
    RETURN NEXT;
    RETURN;
  END IF;

  IF v_capacity.outcome = 'denied' THEN
    outcome := 'denied';
    entry_id := NULL;
    waitlist_entry_id := NULL;
    RETURN NEXT;
    RETURN;
  END IF;

  INSERT INTO public.entries (
    dog_id,
    class_id,
    trial_id,
    show_id,
    handler_id,
    entry_status,
    payment_status,
    entry_fee,
    jump_height,
    special_requests,
    payment_method,
    submitted_at,
    stripe_payment_intent_id
  )
  VALUES (
    p_dog_id,
    p_class_id,
    v_trial_id,
    v_show_id,
    p_handler_id,
    'paid',
    'paid',
    p_entry_fee,
    p_jump_height,
    p_special_requests,
    'online',
    p_submitted_at,
    p_payment_intent_id
  )
  RETURNING * INTO v_entry;

  outcome := 'created_entry';
  entry_id := v_entry.id;
  waitlist_entry_id := NULL;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.create_online_paid_entry(
  uuid, uuid, uuid, numeric, text, text, text, timestamptz, uuid, uuid, uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_online_paid_entry(
  uuid, uuid, uuid, numeric, text, text, text, timestamptz, uuid, uuid, uuid
) TO service_role;

CREATE OR REPLACE FUNCTION public.submit_show_entries(
  p_show_id          uuid,
  p_registration_id  uuid,
  p_entries          jsonb,
  p_submission_id    uuid,
  p_payment_method   text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_entry              jsonb;
  v_dog_id             uuid;
  v_class_id           uuid;
  v_handler_name       text;
  v_handler_person_id  uuid;
  v_caller_person_id   uuid;
  v_exhibitor_profile_id uuid;
  v_client_cents       int;
  v_submission_source  text;

  v_show_pre_fee  numeric;
  v_show_dos_fee  numeric;
  v_show_start    date;
  v_class_fee     numeric;
  v_server_fee    numeric;
  v_server_cents  int;

  v_show_club_id  uuid;
  v_show_open     timestamptz;
  v_show_close    timestamptz;
  v_show_tz       text;
  v_is_official   boolean;

  v_trial_id      uuid;
  v_entry_id      uuid;
  v_capacity      record;
  v_entry_pairs   jsonb[] := '{}';
  v_outcomes      jsonb[] := '{}';

  v_result        jsonb;
BEGIN
  -- 1. Show fees, ownership scope, and entry-window timezone.
  SELECT s.pre_entry_fee, s.day_of_show_fee, s.start_date, s.club_id,
         s.entry_open_date, s.entry_close_date,
         COALESCE(
           (SELECT t.timezone
              FROM public.trials t
             WHERE t.show_id = s.id
             ORDER BY t.date NULLS LAST, t.id
             LIMIT 1),
           'America/New_York'
         )
  INTO   v_show_pre_fee, v_show_dos_fee, v_show_start, v_show_club_id,
         v_show_open, v_show_close, v_show_tz
  FROM   public.shows s
  WHERE  s.id = p_show_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'show % not found', p_show_id
      USING ERRCODE = '22023';
  END IF;

  -- 3. Show-official authority is the only source of organizer/show-desk provenance.
  v_is_official := (
    public.is_site_admin()
    OR public.is_show_secretary(p_show_id)
    OR public.is_club_admin(v_show_club_id)
  );

  IF NOT v_is_official
     AND v_show_open IS NOT NULL
     AND (now() AT TIME ZONE v_show_tz)::date < (v_show_open AT TIME ZONE 'UTC')::date THEN
    RAISE EXCEPTION 'entry period has not opened for show %', p_show_id
      USING ERRCODE = '42501';
  END IF;

  IF NOT v_is_official
     AND v_show_close IS NOT NULL
     AND (now() AT TIME ZONE v_show_tz)::date > (v_show_close AT TIME ZONE 'UTC')::date THEN
    RAISE EXCEPTION 'entry period has closed for show %', p_show_id
      USING ERRCODE = '42501';
  END IF;

  IF p_payment_method IN ('waived', 'secretary_paid', 'group_payment') AND NOT v_is_official THEN
    RAISE EXCEPTION 'unauthorized payment method: % requires secretary or admin role', p_payment_method
      USING ERRCODE = '42501';
  END IF;

  SELECT p.id INTO v_caller_person_id
  FROM public.people p
  WHERE p.auth_user_id = auth.uid();

  -- Waitlist ownership is anchored to the enrollment owner. Paper-only people
  -- without an auth-backed exhibitor profile can still be entered while space
  -- exists, but cannot receive an automated online waitlist offer.
  SELECT ep.id
  INTO v_exhibitor_profile_id
  FROM public.enrollments en
  JOIN public.exhibitor_profiles ep ON ep.person_id = en.handler_id
  WHERE en.id = p_registration_id
    AND en.show_id = p_show_id
    AND (v_is_official OR en.handler_id = v_caller_person_id)
  LIMIT 1;

  IF NOT v_is_official AND v_exhibitor_profile_id IS NULL THEN
    RAISE EXCEPTION 'registration % does not belong to the caller', p_registration_id
      USING ERRCODE = '42501';
  END IF;

  -- Idempotent retry after authorization. A submission UUID is bound to its
  -- original registration so it cannot expose another exhibitor's result.
  SELECT es.result INTO v_result
  FROM public.entry_submissions es
  WHERE es.id = p_submission_id;

  IF FOUND THEN
    IF v_result->>'registration_id' IS DISTINCT FROM p_registration_id::text THEN
      RAISE EXCEPTION 'submission % belongs to another registration', p_submission_id
        USING ERRCODE = '42501';
    END IF;
    RETURN v_result;
  END IF;

  -- 2. Per-entry validation, capacity decision, and insert/outcome.
  FOR v_entry IN SELECT * FROM jsonb_array_elements(p_entries)
  LOOP
    v_dog_id       := (v_entry->>'dog_id')::uuid;
    v_class_id     := (v_entry->>'class_id')::uuid;
    v_handler_name := v_entry->>'handler_name';
    v_handler_person_id := NULLIF(v_entry->>'handler_id', '')::uuid;
    v_client_cents := (v_entry->>'client_fee_cents')::int;
    v_submission_source := COALESCE(
      NULLIF(v_entry->>'submission_source', ''),
      CASE WHEN v_is_official THEN 'organizer' ELSE 'self_service' END
    );

    IF v_submission_source NOT IN ('self_service', 'organizer', 'show_desk') THEN
      RAISE EXCEPTION 'invalid submission source: %', v_submission_source
        USING ERRCODE = '22023';
    END IF;

    IF v_submission_source IN ('organizer', 'show_desk') AND NOT v_is_official THEN
      RAISE EXCEPTION 'submission source % requires a show official', v_submission_source
        USING ERRCODE = '42501';
    END IF;

    IF v_handler_person_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.people p WHERE p.id = v_handler_person_id
    ) THEN
      RAISE EXCEPTION 'handler % not found', v_handler_person_id
        USING ERRCODE = '22023';
    END IF;

    IF NOT v_is_official AND v_handler_person_id IS NOT NULL AND NOT EXISTS (
      SELECT 1
      FROM public.dogs d
      WHERE d.id = v_dog_id
        AND v_handler_person_id IN (d.owner_id, d.co_owner_id)
    ) THEN
      RAISE EXCEPTION 'caller cannot assign handler % for dog %', v_handler_person_id, v_dog_id
        USING ERRCODE = '42501';
    END IF;

    v_handler_person_id := COALESCE(v_handler_person_id, v_caller_person_id);

    IF NOT v_is_official AND NOT EXISTS (
      SELECT 1
      FROM public.dogs d
      JOIN public.people p ON p.id = d.owner_id
      WHERE d.id = v_dog_id
        AND p.auth_user_id = auth.uid()
    ) THEN
      RAISE EXCEPTION 'caller does not own dog %', v_dog_id
        USING ERRCODE = '42501';
    END IF;

    SELECT c.entry_fee, t.id
    INTO   v_class_fee, v_trial_id
    FROM   public.classes c
    JOIN   public.trials t ON t.id = c.trial_id
    WHERE  c.id = v_class_id
      AND  t.show_id = p_show_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'class % does not belong to show %', v_class_id, p_show_id
        USING ERRCODE = '22023';
    END IF;

    v_server_fee := COALESCE(
      CASE
        WHEN v_show_start IS NOT NULL AND CURRENT_DATE >= v_show_start THEN v_show_dos_fee
        ELSE v_show_pre_fee
      END,
      v_class_fee,
      0
    );

    v_server_cents := ROUND(v_server_fee * 100)::int;
    IF v_client_cents IS NOT NULL AND v_client_cents < v_server_cents THEN
      RAISE EXCEPTION 'fee mismatch: client sent % cents, server requires % cents',
        v_client_cents, v_server_cents
        USING ERRCODE = '22023';
    END IF;

    SELECT *
    INTO v_capacity
    FROM public.evaluate_entry_capacity(
      v_class_id,
      v_dog_id,
      v_exhibitor_profile_id,
      v_handler_person_id,
      v_submission_source,
      v_is_official
    );

    IF v_capacity.outcome = 'waitlisted' THEN
      v_outcomes := array_append(v_outcomes, jsonb_build_object(
        'dog_id', v_dog_id,
        'class_id', v_class_id,
        'outcome', 'waitlisted',
        'entry_id', NULL,
        'waitlist_entry_id', v_capacity.waitlist_entry_id,
        'waitlist_position', v_capacity.waitlist_position,
        'fee_cents', 0,
        'capacity_override', false
      ));
      CONTINUE;
    END IF;

    IF v_capacity.outcome = 'denied' THEN
      v_outcomes := array_append(v_outcomes, jsonb_build_object(
        'dog_id', v_dog_id,
        'class_id', v_class_id,
        'outcome', 'denied',
        'entry_id', NULL,
        'waitlist_entry_id', NULL,
        'waitlist_position', NULL,
        'fee_cents', 0,
        'capacity_override', false
      ));
      CONTINUE;
    END IF;

    INSERT INTO public.entries (
      show_id,
      trial_id,
      class_id,
      dog_id,
      handler,
      handler_id,
      entry_fee,
      entry_status,
      payment_status,
      payment_method,
      submitted_at,
      registration_id,
      capacity_override
    )
    VALUES (
      p_show_id,
      v_trial_id,
      v_class_id,
      v_dog_id,
      v_handler_name,
      v_handler_person_id,
      v_server_fee,
      'submitted',
      CASE
        WHEN p_payment_method IN ('secretary_paid', 'group_payment') THEN 'paid'
        WHEN p_payment_method IN ('waived') THEN 'waived'
        ELSE 'pending'
      END,
      p_payment_method,
      now(),
      p_registration_id,
      COALESCE(v_capacity.capacity_override, false)
    )
    RETURNING id INTO v_entry_id;

    v_entry_pairs := array_append(v_entry_pairs,
      jsonb_build_object('entry_id', v_entry_id, 'dog_id', v_dog_id));
    v_outcomes := array_append(v_outcomes, jsonb_build_object(
      'dog_id', v_dog_id,
      'class_id', v_class_id,
      'outcome', 'created',
      'entry_id', v_entry_id,
      'waitlist_entry_id', NULL,
      'waitlist_position', NULL,
      'fee_cents', v_server_cents,
      'capacity_override', COALESCE(v_capacity.capacity_override, false)
    ));
  END LOOP;

  v_result := jsonb_build_object(
    'entries', to_jsonb(v_entry_pairs),
    'outcomes', to_jsonb(v_outcomes),
    'registration_id', p_registration_id,
    'submission_id', p_submission_id
  );

  INSERT INTO public.entry_submissions (id, result)
  VALUES (p_submission_id, v_result);

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.submit_show_entries(uuid, uuid, jsonb, uuid, text) IS
  'Server-authoritative non-card entry submission with ownership, fee, entry-window, source, '
  'class capacity, judge-day capacity, mixed outcomes, and idempotency enforcement.';

NOTIFY pgrst, 'reload schema';
