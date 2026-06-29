-- Server-side capacity gate for paid online cart entries.
--
-- Online self-service must not consume the mail-in reserve. This RPC makes the
-- display capacity rule authoritative at the write boundary by taking the same
-- judge-day advisory lock used by waitlist promotion, then doing the capacity
-- count inline after the lock. Do not call the STABLE display helper here:
-- concurrent paid-cart RPCs can otherwise reuse a pre-lock snapshot.

DROP FUNCTION IF EXISTS public.create_online_paid_entry(
  uuid, uuid, uuid, numeric, text, text, text, timestamptz, uuid, uuid
);

DROP FUNCTION IF EXISTS public.create_online_paid_entry(
  uuid, uuid, uuid, numeric, text, text, text, timestamptz, uuid, uuid, uuid
);

CREATE UNIQUE INDEX IF NOT EXISTS waitlist_entries_active_class_dog_key
  ON public.waitlist_entries (class_id, dog_id)
  WHERE status IN ('waiting', 'offered');

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
  v_trial_date date;
  v_allow_waitlist boolean;
  v_judge_id uuid;
  v_entry public.entries;
  v_waitlist_entry public.waitlist_entries;
  v_waitlist_position integer;
  v_available_spots integer;
BEGIN
  SELECT c.trial_id, t.show_id, t.date, COALESCE(c.allow_waitlist, false)
  INTO v_trial_id, v_show_id, v_trial_date, v_allow_waitlist
  FROM public.classes c
  JOIN public.trials t ON t.id = c.trial_id
  WHERE c.id = p_class_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Class not found for online paid entry'
      USING errcode = 'P0002';
  END IF;

  IF v_show_id IS DISTINCT FROM p_show_id THEN
    RAISE EXCEPTION 'Class does not belong to paid cart show'
      USING errcode = '23514';
  END IF;

  IF p_trial_id IS NOT NULL AND v_trial_id IS DISTINCT FROM p_trial_id THEN
    RAISE EXCEPTION 'Class does not belong to paid cart trial'
      USING errcode = '23514';
  END IF;

  FOR v_judge_id IN
    SELECT DISTINCT ja.person_id
    FROM public.judge_assignments ja
    WHERE ja.class_id = p_class_id
      AND ja.show_id = v_show_id
      AND ja.status = 'confirmed'
      AND ja.person_id IS NOT NULL
    ORDER BY ja.person_id
  LOOP
    PERFORM pg_advisory_xact_lock(
      hashtext('judgeday:' || v_judge_id::text || ':' || v_trial_date::text)
    );

    SELECT available_spots
    INTO v_available_spots
    FROM public.get_judge_day_capacity_live(v_judge_id, v_show_id, v_trial_date);

    IF COALESCE(v_available_spots, 0) <= 0 THEN
      IF NOT v_allow_waitlist THEN
        outcome := 'denied';
        entry_id := NULL;
        waitlist_entry_id := NULL;
        RETURN NEXT;
        RETURN;
      END IF;

      PERFORM pg_advisory_xact_lock(hashtext(p_class_id::text));

      SELECT *
      INTO v_waitlist_entry
      FROM public.waitlist_entries
      WHERE class_id = p_class_id
        AND dog_id = p_dog_id
        AND status IN ('waiting', 'offered')
      ORDER BY position NULLS LAST, created_at
      LIMIT 1;

      IF FOUND THEN
        outcome := 'waitlisted';
        entry_id := NULL;
        waitlist_entry_id := v_waitlist_entry.id;
        RETURN NEXT;
        RETURN;
      END IF;

      SELECT COALESCE(MAX(position), 0) + 1
      INTO v_waitlist_position
      FROM public.waitlist_entries
      WHERE class_id = p_class_id
        AND status = 'waiting';

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
        v_waitlist_position,
        'online'
      )
      RETURNING * INTO v_waitlist_entry;

      outcome := 'waitlisted';
      entry_id := NULL;
      waitlist_entry_id := v_waitlist_entry.id;
      RETURN NEXT;
      RETURN;
    END IF;
  END LOOP;

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

NOTIFY pgrst, 'reload schema';
