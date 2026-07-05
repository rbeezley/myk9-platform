-- Persist payment_method on entries created via submit_show_entries.
--
-- Bug (found via Codex review of PR #1137): the RPC accepted p_payment_method
-- but never wrote it to entries.payment_method, so every cash/check entry
-- created through this path had a NULL method. The exhibitor's "My Shows" card
-- then couldn't tell cash/check from card for a *pending* entry and defaulted to
-- the online "Finish Payment" nag — the exact confusion UX walk task 4.C set out
-- to remove.
--
-- Safety: this RPC is the OFFLINE path only. Card entries go through the Stripe
-- cart checkout (submitRegistrationCartCheckout), never this function, so
-- p_payment_method here is only ever 'cash' / 'check' / 'waived' /
-- 'secretary_paid' / 'group_payment' — it can NEVER write 'online'. Refund and
-- payout logic keys on payment_method = 'online' (see _shared/showRefundPlan.ts);
-- both the old NULL and the new 'cash'/'check' values classify as offline_paid,
-- so that logic is unchanged.
--
-- Only the INSERT column list changes vs migration 182; everything else is
-- copied verbatim so a partial edit can't drift the authz/fee logic.

-- First widen the entries.payment_method CHECK constraint. It was
-- ['online','cash','check','waived','secretary_paid'] (migration
-- 20260518120000) and never included 'group_payment' — a real, user-selectable
-- wizard method (PaymentMethodSelector). Persisting it (below) would otherwise
-- raise 23514 and fail the whole submission. This was latent only because the
-- RPC never wrote the column before; writing it now surfaces the gap.
ALTER TABLE public.entries
  DROP CONSTRAINT IF EXISTS entries_payment_method_check;

ALTER TABLE public.entries
  ADD CONSTRAINT entries_payment_method_check
  CHECK (
    payment_method IS NULL
    OR payment_method = ANY (
      ARRAY['online', 'cash', 'check', 'waived', 'secretary_paid', 'group_payment']
    )
  );

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
  v_entry              jsonb;
  v_dog_id             uuid;
  v_class_id           uuid;
  v_handler_name       text;
  v_handler_person_id  uuid;
  v_client_cents       int;

  v_show_pre_fee  numeric;
  v_show_dos_fee  numeric;
  v_show_start    date;
  v_class_fee     numeric;
  v_server_fee    numeric;
  v_server_cents  int;

  v_show_club_id  uuid;
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

  -- 2. Load show fee info and club_id
  SELECT pre_entry_fee, day_of_show_fee, start_date, club_id
  INTO   v_show_pre_fee, v_show_dos_fee, v_show_start, v_show_club_id
  FROM   public.shows
  WHERE  id = p_show_id;

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

  -- 4. Payment method authorization
  IF p_payment_method IN ('waived', 'secretary_paid') AND NOT v_is_official THEN
    RAISE EXCEPTION 'unauthorized payment method: % requires secretary or admin role', p_payment_method
      USING ERRCODE = '42501';
  END IF;

  -- Resolve the caller's person ID once (used as handler_id on every entry)
  SELECT id INTO v_handler_person_id
  FROM   public.people
  WHERE  auth_user_id = auth.uid();

  -- 5. Per-entry validation and insert
  FOR v_entry IN SELECT * FROM jsonb_array_elements(p_entries)
  LOOP
    v_dog_id       := (v_entry->>'dog_id')::uuid;
    v_class_id     := (v_entry->>'class_id')::uuid;
    v_handler_name := v_entry->>'handler_name';
    v_client_cents := (v_entry->>'client_fee_cents')::int;

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

    -- 5d. Insert entry with handler_id, trial_id, and payment_method
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
    'entries', to_jsonb(v_entry_pairs)
  );

  INSERT INTO public.entry_submissions (id, result)
  VALUES (p_submission_id, v_result);

  RETURN v_result;
END;
$$;
