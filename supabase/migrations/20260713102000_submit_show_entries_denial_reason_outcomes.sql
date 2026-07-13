-- Preserve capacity-denial reasons from evaluate_entry_capacity in the
-- submit_show_entries JSON response so the registration UI can show the real
-- reason instead of treating every denial as a full-class denial.

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

  v_is_official := (
    public.is_site_admin()
    OR public.is_show_secretary(p_show_id)
    OR public.is_club_admin(v_show_club_id)
  );

  SELECT p.id INTO v_caller_person_id
  FROM public.people p
  WHERE p.auth_user_id = auth.uid();

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

  PERFORM pg_advisory_xact_lock(hashtext('entrysubmission:' || p_submission_id::text));

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
        'capacity_override', false,
        'denial_reason', NULL
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
        'capacity_override', false,
        'denial_reason', v_capacity.denial_reason
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
      'capacity_override', COALESCE(v_capacity.capacity_override, false),
      'denial_reason', NULL
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
  'Server-authoritative non-card entry submission with ownership, fee, '
  'entry-window, source, class capacity, judge-day capacity, mixed outcomes, '
  'denial reasons, and idempotency enforcement.';

NOTIFY pgrst, 'reload schema';
