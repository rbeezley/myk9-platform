-- Server-side capacity gate for paid online cart entries.
--
-- Online self-service must not consume the mail-in reserve. The existing
-- get_judge_day_capacity() function already computes available_spots as
-- capacity - confirmed - reserved, including auto-release behavior. This RPC
-- makes that display rule authoritative at the write boundary by taking the
-- same judge-day advisory lock used by waitlist promotion, checking
-- available_spots, and inserting the entry in one transaction.

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
  p_trial_id uuid
)
RETURNS public.entries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_show_id uuid;
  v_trial_id uuid;
  v_trial_date date;
  v_judge_id uuid;
  v_judge_capacity record;
  v_entry public.entries;
BEGIN
  SELECT c.trial_id, t.show_id, t.date
  INTO v_trial_id, v_show_id, v_trial_date
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

    SELECT *
    INTO v_judge_capacity
    FROM public.get_judge_day_capacity(v_judge_id, v_show_id, v_trial_date)
    LIMIT 1;

    IF COALESCE(v_judge_capacity.available_spots, 0) <= 0 THEN
      RAISE EXCEPTION 'Judge-day capacity is full'
        USING errcode = '23514';
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

  RETURN v_entry;
END;
$$;

REVOKE ALL ON FUNCTION public.create_online_paid_entry(
  uuid, uuid, uuid, numeric, text, text, text, timestamptz, uuid, uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_online_paid_entry(
  uuid, uuid, uuid, numeric, text, text, text, timestamptz, uuid, uuid
) TO service_role;

NOTIFY pgrst, 'reload schema';
