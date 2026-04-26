-- Migration 164: Fix submit_show_entries RPC class-fee lookup
--
-- Migration 151 introduced submit_show_entries with this fragment:
--
--   SELECT entry_fee INTO v_class_fee
--   FROM   public.classes
--   WHERE  id = v_class_id
--     AND  show_id = p_show_id;
--
-- But `classes.show_id` does not exist. Classes link to shows via
-- `classes.trial_id -> trials.show_id`. Every call to submit_show_entries
-- has been failing with `column "show_id" does not exist (42703)` for the
-- show that mig 151 was meant to validate against.
--
-- This migration replaces the function body with the correct join. No
-- signature change — clients keep calling the same RPC with the same args.
--
-- Discovered while running the registration wizard's mail-in e2e end-to-end
-- after migration 163 unblocked the enrollments insert path. Out of scope
-- for the spec but on the critical path for the same e2e — without it the
-- wizard's submit step still 400s.

CREATE OR REPLACE FUNCTION public.submit_show_entries(
  p_show_id         uuid,
  p_registration_id uuid,
  p_entries         jsonb,
  p_submission_id   uuid,
  p_payment_method  text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entry         jsonb;
  v_dog_id        uuid;
  v_class_id      uuid;
  v_handler_name  text;
  v_client_cents  int;

  v_show_pre_fee  numeric;
  v_show_dos_fee  numeric;
  v_show_start    date;
  v_class_fee     numeric;
  v_server_fee    numeric;
  v_server_cents  int;

  v_show_club_id  uuid;
  v_is_official   boolean;

  v_entry_id      uuid;
  v_entry_pairs   jsonb[] := '{}';

  v_result        jsonb;
BEGIN
  -- Idempotency check: return previous result for duplicate submission_id
  SELECT result INTO v_result
  FROM public.entry_submissions
  WHERE id = p_submission_id;

  IF FOUND THEN
    RETURN v_result;
  END IF;

  -- Load show fee info and club_id for authorization checks
  SELECT pre_entry_fee, day_of_show_fee, start_date, club_id
  INTO   v_show_pre_fee, v_show_dos_fee, v_show_start, v_show_club_id
  FROM   public.shows
  WHERE  id = p_show_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'show % not found', p_show_id
      USING ERRCODE = '22023';
  END IF;

  -- Check if caller is a show official (secretary, club admin, or site admin)
  v_is_official := (
    public.is_site_admin()
    OR public.is_show_secretary(p_show_id)
    OR public.is_club_admin(v_show_club_id)
  );

  -- Payment method authorization
  IF p_payment_method IN ('waived', 'secretary_paid') AND NOT v_is_official THEN
    RAISE EXCEPTION 'unauthorized payment method: % requires secretary or admin role', p_payment_method
      USING ERRCODE = '42501';
  END IF;

  -- Per-entry validation and insert
  FOR v_entry IN SELECT * FROM jsonb_array_elements(p_entries)
  LOOP
    v_dog_id       := (v_entry->>'dog_id')::uuid;
    v_class_id     := (v_entry->>'class_id')::uuid;
    v_handler_name := v_entry->>'handler_name';
    v_client_cents := (v_entry->>'client_fee_cents')::int;

    -- Ownership check: caller must own the dog OR be an official
    IF NOT v_is_official THEN
      IF NOT EXISTS (
        SELECT 1
        FROM   public.dogs   d
        JOIN   public.people p ON p.id = d.owner_id
        WHERE  d.id = v_dog_id
          AND  p.auth_user_id = auth.uid()
      ) THEN
        RAISE EXCEPTION 'caller does not own dog %', v_dog_id
          USING ERRCODE = '42501';
      END IF;
    END IF;

    -- Server-side fee computation. Cross-show class injection is prevented
    -- by joining classes.trial_id -> trials.show_id and matching p_show_id.
    -- (Migration 151 used a non-existent classes.show_id column here.)
    SELECT c.entry_fee
    INTO   v_class_fee
    FROM   public.classes c
    JOIN   public.trials  t ON t.id = c.trial_id
    WHERE  c.id      = v_class_id
      AND  t.show_id = p_show_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'class % does not belong to show %', v_class_id, p_show_id
        USING ERRCODE = '22023';
    END IF;

    IF CURRENT_DATE >= v_show_start AND v_show_dos_fee IS NOT NULL THEN
      v_server_fee := v_show_dos_fee;
    ELSIF v_show_pre_fee IS NOT NULL THEN
      v_server_fee := v_show_pre_fee;
    ELSIF v_class_fee IS NOT NULL THEN
      v_server_fee := v_class_fee;
    ELSE
      v_server_fee := 0;
    END IF;

    v_server_cents := ROUND(v_server_fee * 100)::int;

    IF ABS(v_client_cents - v_server_cents) > 1 THEN
      RAISE EXCEPTION 'fee mismatch for class %: client sent % cents, server expects % cents',
        v_class_id, v_client_cents, v_server_cents
        USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.entries (
      show_id,
      class_id,
      dog_id,
      handler,
      entry_fee,
      entry_status,
      payment_status,
      submitted_at,
      registration_id
    )
    VALUES (
      p_show_id,
      v_class_id,
      v_dog_id,
      v_handler_name,
      v_server_fee,
      'submitted',
      CASE
        WHEN p_payment_method IN ('waived') THEN 'waived'
        ELSE 'pending'
      END,
      now(),
      p_registration_id
    )
    RETURNING id INTO v_entry_id;

    v_entry_pairs := array_append(v_entry_pairs,
      jsonb_build_object('entry_id', v_entry_id, 'dog_id', v_dog_id));
  END LOOP;

  v_result := jsonb_build_object(
    'entries',         to_jsonb(v_entry_pairs),
    'registration_id', to_jsonb(p_registration_id),
    'submission_id',   to_jsonb(p_submission_id)
  );

  INSERT INTO public.entry_submissions (id, result)
  VALUES (p_submission_id, v_result);

  RETURN v_result;
END;
$$;

NOTIFY pgrst, 'reload schema';
