-- Server-side entry-period guard for the OFFLINE submission path.
--
-- Gap (found via the 2026-07-08 exhibitor role-journey audit follow-up): the
-- paid online path (stripe-checkout) already fails closed when a show's entry
-- period has passed, but submit_show_entries — the SECURITY DEFINER RPC behind
-- the offline / pay-at-show / cash / check / group / waived flow — had NO such
-- check. A direct API call (or a client with a stale "entries open" view) could
-- therefore create brand-new entries for a show whose entries had already
-- closed. This adds the missing guard.
--
-- Boundary semantics (kept identical to the client cart gate and the
-- stripe-checkout gate so all three agree):
--   * shows.entry_close_date is a timestamptz. A close date typed as a calendar
--     day (e.g. "2026-08-15") is stored as midnight UTC of that day
--     (2026-08-15 00:00:00+00), so the *intended close day* is that value read
--     in UTC: (entry_close_date AT TIME ZONE 'UTC')::date.
--   * "Closed" means the current calendar date in the show's timezone is past
--     the intended close day. "Now" is anchored to the show's primary-trial
--     timezone (trials.timezone, default America/New_York) so an exhibitor is
--     never blocked before the end of that local day — the exact early-close
--     defect the client-side fix (#1217) removed.
--
-- Bypass: site admin / show secretary / club admin (the existing v_is_official
-- branch) still submit after close, so legitimate late and day-of entries by
-- officials keep working. Only self-service exhibitor submissions are rejected.
--
-- Everything else is copied VERBATIM from migration 20260706190500
-- (submit_entries_preserve_selected_handler) so a partial edit cannot drift the
-- authz / handler / fee logic. Only step 2's SELECT list and the new step 3a
-- guard change.

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
SET search_path = public
AS $$
DECLARE
  v_entry              jsonb;
  v_dog_id             uuid;
  v_class_id           uuid;
  v_handler_name       text;
  v_handler_person_id  uuid;
  v_caller_person_id   uuid;
  v_client_cents       int;

  v_show_pre_fee  numeric;
  v_show_dos_fee  numeric;
  v_show_start    date;
  v_class_fee     numeric;
  v_server_fee    numeric;
  v_server_cents  int;

  v_show_club_id  uuid;
  v_show_close    timestamptz;
  v_show_tz       text;
  v_is_official   boolean;

  v_trial_id      uuid;
  v_entry_id      uuid;
  v_entry_pairs   jsonb[] := '{}';

  v_result        jsonb;
BEGIN
  -- 1. Idempotency check
  SELECT result INTO v_result
  FROM public.entry_submissions
  WHERE id = p_submission_id;

  IF FOUND THEN
    RETURN v_result;
  END IF;

  -- 2. Load show fee info, club_id, entry-close deadline, and the show's
  --    primary-trial timezone (used by the entry-period guard in 3a).
  SELECT s.pre_entry_fee, s.day_of_show_fee, s.start_date, s.club_id, s.entry_close_date,
         COALESCE(
           (SELECT t.timezone
              FROM public.trials t
             WHERE t.show_id = s.id
             ORDER BY t.date NULLS LAST, t.id
             LIMIT 1),
           'America/New_York'
         )
  INTO   v_show_pre_fee, v_show_dos_fee, v_show_start, v_show_club_id, v_show_close, v_show_tz
  FROM   public.shows s
  WHERE  s.id = p_show_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'show % not found', p_show_id
      USING ERRCODE = '22023';
  END IF;

  -- 3. Check if caller is a show official
  v_is_official := (
    public.is_site_admin()
    OR public.is_show_secretary(p_show_id)
    OR public.is_club_admin(v_show_club_id)
  );

  -- 3a. Entry-period guard (money path). Reject self-service submissions once
  -- the show's entry period has closed; officials bypass (see header). "Closed"
  -- = current date in the show timezone is past the intended close day.
  IF NOT v_is_official
     AND v_show_close IS NOT NULL
     AND (now() AT TIME ZONE v_show_tz)::date > (v_show_close AT TIME ZONE 'UTC')::date THEN
    RAISE EXCEPTION 'entry period has closed for show %', p_show_id
      USING ERRCODE = '42501';
  END IF;

  -- 4. Payment method authorization
  IF p_payment_method IN ('waived', 'secretary_paid', 'group_payment') AND NOT v_is_official THEN
    RAISE EXCEPTION 'unauthorized payment method: % requires secretary or admin role', p_payment_method
      USING ERRCODE = '42501';
  END IF;

  -- Legacy fallback for clients that do not send per-entry handler_id.
  SELECT id INTO v_caller_person_id
  FROM   public.people
  WHERE  auth_user_id = auth.uid();

  -- 5. Per-entry validation and insert
  FOR v_entry IN SELECT * FROM jsonb_array_elements(p_entries)
  LOOP
    v_dog_id       := (v_entry->>'dog_id')::uuid;
    v_class_id     := (v_entry->>'class_id')::uuid;
    v_handler_name := v_entry->>'handler_name';
    v_handler_person_id := NULLIF(v_entry->>'handler_id', '')::uuid;
    v_client_cents := (v_entry->>'client_fee_cents')::int;

    IF v_handler_person_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.people WHERE id = v_handler_person_id
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

    -- 5a. Ownership check
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

    -- 5b. Server-side fee computation + capture trial_id for the entry row
    -- Classes link to shows via trial_id -> trials.show_id (no direct show_id on classes).
    SELECT c.entry_fee, t.id
    INTO   v_class_fee, v_trial_id
    FROM   public.classes c
    JOIN   public.trials  t ON t.id = c.trial_id
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

    -- 5c. Fee guard: reject if client sent a fee lower than server computed
    v_server_cents := ROUND(v_server_fee * 100)::int;
    IF v_client_cents IS NOT NULL AND v_client_cents < v_server_cents THEN
      RAISE EXCEPTION 'fee mismatch: client sent % cents, server requires % cents',
        v_client_cents, v_server_cents
        USING ERRCODE = '22023';
    END IF;

    -- 5d. Insert entry with selected handler_id, trial_id, and payment_method
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
      registration_id
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
      -- Offline-only path: 'cash' / 'check' / 'waived' / 'secretary_paid' /
      -- 'group_payment'. Never 'online' (card uses the Stripe cart path).
      p_payment_method,
      now(),
      p_registration_id
    )
    RETURNING id INTO v_entry_id;

    v_entry_pairs := array_append(v_entry_pairs,
      jsonb_build_object('entry_id', v_entry_id, 'dog_id', v_dog_id));
  END LOOP;

  -- 6. Build result and record submission for idempotency
  v_result := jsonb_build_object(
    'entries', to_jsonb(v_entry_pairs),
    'registration_id', p_registration_id,
    'submission_id', p_submission_id
  );

  INSERT INTO public.entry_submissions (id, result)
  VALUES (p_submission_id, v_result);

  RETURN v_result;
END;
$$;
