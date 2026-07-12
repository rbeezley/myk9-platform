-- Server-side entry-OPEN guard for the OFFLINE submission path.
--
-- Companion to 20260708130000 (entry-CLOSE guard). That migration closed the
-- late-side hole; this closes the early-side one. submit_show_entries — the
-- SECURITY DEFINER RPC behind the offline / pay-at-show / cash / check / group /
-- waived flow — enforced only entry_close_date, so a direct API call (or a
-- client with a stale / bypassed "entries open" view) could create brand-new
-- entries for a show whose entries had NOT YET opened. The client guards
-- (entryCloseGuard + canRegisterForShow) are advisory only; this is the
-- authoritative backstop.
--
-- Boundary semantics (kept identical to the close guard and the client-side
-- open guard so all agree):
--   * shows.entry_open_date is a timestamptz. An open date typed as a calendar
--     day (e.g. "2026-08-01") is stored as midnight UTC of that day, so the
--     *intended open day* is that value read in UTC:
--     (entry_open_date AT TIME ZONE 'UTC')::date.
--   * "Not yet open" means the current calendar date in the show's timezone is
--     strictly BEFORE the intended open day. "Now" is anchored to the show's
--     primary-trial timezone (trials.timezone, default America/New_York), and
--     the compare is inclusive: the whole open day onward is allowed — mirroring
--     entryStatusUtils' not_yet_open branch and canRegisterForShow.
--
-- Bypass: site admin / show secretary / club admin (the existing v_is_official
-- branch) still submit before open, so legitimate organizer pre-loading keeps
-- working. Unlike the client, "late entry mode" is NOT a bypass here — it is a
-- URL-derived client concept with no pre-open meaning; only RBAC officials pass.
--
-- Everything else is copied VERBATIM from migration 20260708130000
-- (guard_submit_show_entries_entry_close) so a partial edit cannot drift the
-- authz / handler / fee logic. Only step 2's SELECT list, the new v_show_open
-- declaration, and the new step 3a-open guard change.

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
  v_show_open     timestamptz;
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

  -- 2. Load show fee info, club_id, entry-open/close deadlines, and the show's
  --    primary-trial timezone (used by the entry-period guards in 3a).
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

  -- 3. Check if caller is a show official
  v_is_official := (
    public.is_site_admin()
    OR public.is_show_secretary(p_show_id)
    OR public.is_club_admin(v_show_club_id)
  );

  -- 3a-open. Entry-period guard (money path, early side). Reject self-service
  -- submissions before the show's entry period opens; officials bypass (see
  -- header). "Not yet open" = current date in the show timezone is before the
  -- intended open day. Inclusive: the whole open day onward is allowed.
  IF NOT v_is_official
     AND v_show_open IS NOT NULL
     AND (now() AT TIME ZONE v_show_tz)::date < (v_show_open AT TIME ZONE 'UTC')::date THEN
    RAISE EXCEPTION 'entry period has not opened for show %', p_show_id
      USING ERRCODE = '42501';
  END IF;

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
