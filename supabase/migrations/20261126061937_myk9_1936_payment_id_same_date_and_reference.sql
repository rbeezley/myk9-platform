-- MYK9-1936: a reused client_payment_id must name the SAME payment, received date and
-- reference included.
--
-- Entry Management's payment dialogs keep a payment's id across a retry of a save whose
-- answer was lost (the dialog keeps what the secretary typed, MYK9-2156). The retry
-- check matched only the enrollment, kind, method and amount, so a secretary who fixed
-- the received date or check number before retrying, when the first call had in fact
-- landed, was answered "saved" while the ledger kept the old date and check number.
-- Now a reused id whose received date (when one is sent) or reference differs from the
-- row already recorded is refused with its own message, and nothing is written.
--
-- record_enrollment_payment_core is copied from its latest definition
-- (20261114013900_myk9_1961_refunded_fee_not_owed.sql), changed ONLY in the retry block.
-- Signature, SECURITY INVOKER, search_path and grants are unchanged; CREATE OR REPLACE
-- keeps the owner and grants, and the REVOKE is restated as that file does.

CREATE OR REPLACE FUNCTION private.record_enrollment_payment_core(
  p_enrollment_id uuid,
  p_kind text,
  p_amount numeric DEFAULT NULL,
  p_method text DEFAULT NULL,
  p_received_on date DEFAULT NULL,
  p_reference text DEFAULT NULL,
  p_note text DEFAULT NULL,
  p_client_payment_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_show_id uuid;
  v_paid numeric;
  v_refunded numeric;
  v_net numeric;
  v_card numeric;
  v_total_cents integer;
  v_status text;
  v_total_due numeric;
  v_amount numeric;
  v_tz text;
  v_today date;
  v_received date;
  v_entry_status text;
  v_group record;
  v_existing public.show_payments%ROWTYPE;
  v_reopen_cents integer;
BEGIN
  IF p_kind NOT IN ('payment', 'refund', 'reversal') OR p_kind IS NULL THEN
    RAISE EXCEPTION 'unsupported payment kind: %', p_kind USING ERRCODE = '22023';
  END IF;

  SELECT e.show_id, COALESCE(e.paid_amount, 0), COALESCE(e.refund_amount, 0),
         e.total_amount, e.payment_status, e.card_covered_cents / 100.0
    INTO v_show_id, v_paid, v_refunded, v_total_cents, v_status, v_card
    FROM public.enrollments e
   WHERE e.id = p_enrollment_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'enrollment % not found', p_enrollment_id USING ERRCODE = '22023';
  END IF;

  -- IDEMPOTENT RETRY. A payment sent with a key that already has a row was
  -- recorded by an earlier call whose answer never arrived (or whose caller
  -- failed after it): answer from the enrollment as it stands and write
  -- nothing, so paid_amount is not added twice. The same key for a different
  -- payment is a caller bug, refused. Checked after the enrollment lock, so two
  -- concurrent calls with one key are serialized.
  IF p_client_payment_id IS NOT NULL THEN
    IF p_kind <> 'payment' THEN
      RAISE EXCEPTION 'client_payment_id is only accepted for a payment' USING ERRCODE = '22023';
    END IF;
    SELECT * INTO v_existing FROM public.show_payments sp
     WHERE sp.client_payment_id = p_client_payment_id;
    IF FOUND THEN
      IF v_existing.enrollment_id IS DISTINCT FROM p_enrollment_id
         OR v_existing.kind <> 'payment'
         OR v_existing.method IS DISTINCT FROM p_method
         OR (p_amount IS NOT NULL AND v_existing.amount <> p_amount) THEN
        RAISE EXCEPTION 'client_payment_id % was already used for a different payment',
          p_client_payment_id USING ERRCODE = '22023';
      END IF;
      -- MYK9-1936: the same payment, but with its received date or reference changed
      -- since the call that recorded it. Answering "saved" would keep the old ones, so
      -- refuse and let the person look at the payment that is there. A NULL date is the
      -- "today" default and is not compared; the reference is compared as stored.
      IF (p_received_on IS NOT NULL AND v_existing.received_on <> p_received_on)
         OR v_existing.reference IS DISTINCT FROM NULLIF(btrim(p_reference), '') THEN
        RAISE EXCEPTION 'client_payment_id % was already saved with a different received date or reference',
          p_client_payment_id USING ERRCODE = '22023';
      END IF;
      -- MYK9-773: the entries as they stand, so a retry answers like a record.
      RETURN private.enrollment_payment_answer(p_enrollment_id);
    END IF;
  END IF;

  -- NET RECEIVED: the ONE figure every branch below reads. paid_amount is the
  -- gross ever received and refund_amount the cumulative amount handed back,
  -- both on the enrollment. Read from the enrollment, not summed from the
  -- ledger, on purpose: an enrollment paid before the ledger existed has no
  -- rows, and a Stripe/other refund is recorded on the enrollment but never in
  -- the ledger (it is not box money). The enrollment columns hold both.
  v_net := v_paid - v_refunded;
  -- MYK9-1961: a refunded entry is not in total_amount. A payment never reopens it (owner,
  -- 2026-11-13), so a payment is judged on total_amount alone. "Payment Due" reopens the
  -- ones this form's refund closed (MYK9-773), so it is judged on total_amount plus them.
  v_reopen_cents := private.enrollment_reopen_cents(p_enrollment_id);
  -- MYK9-1637: CARD MONEY (v_card) is held too, but it is not desk money: it counts toward
  -- what is received ("Paid in Full", the status) and never toward what the desk may hand
  -- back (owner, 2026-11-01: card money is refunded only through Stripe).

  v_tz := private.show_time_zone(v_show_id);
  v_today := (now() AT TIME ZONE v_tz)::date;
  v_received := COALESCE(p_received_on, v_today);
  IF v_received > v_today THEN
    RAISE EXCEPTION 'received date % is after today (%) on the show''s calendar', v_received, v_today
      USING ERRCODE = '22023';
  END IF;

  IF p_kind = 'payment' THEN
    IF p_method IS NULL OR p_method NOT IN ('cash', 'check') THEN
      RAISE EXCEPTION 'a payment is recorded as cash or check, got %', p_method
        USING ERRCODE = '22023';
    END IF;
    -- What is due: the enrollment's total (cents) when it has one, otherwise the
    -- sum of its live entries' fees -- the rule enrollmentGrouping.ts applies.
    v_total_due := COALESCE(
      v_total_cents / 100.0,
      (SELECT sum(en.entry_fee) FROM public.entries en
        WHERE en.registration_id = p_enrollment_id AND en.deleted_at IS NULL)
    );
    -- NULL amount = "Paid in Full": whatever is still due after refunds.
    v_amount := COALESCE(p_amount, GREATEST(COALESCE(v_total_due, 0) - v_net - v_card, 0));
    IF v_amount < 0 OR v_amount <> round(v_amount, 2) THEN
      RAISE EXCEPTION 'invalid payment amount %', v_amount USING ERRCODE = '22023';
    END IF;
    IF p_amount IS NOT NULL AND p_amount <= 0 THEN
      RAISE EXCEPTION 'a payment amount must be greater than zero' USING ERRCODE = '22023';
    END IF;

    IF v_amount > 0 THEN
      INSERT INTO public.show_payments
        (show_id, enrollment_id, kind, amount, method, received_on, reference, note,
         recorded_by, client_payment_id)
      VALUES
        (v_show_id, p_enrollment_id, 'payment', v_amount, p_method, v_received,
         NULLIF(btrim(p_reference), ''), NULLIF(btrim(p_note), ''), auth.uid(),
         p_client_payment_id);
    END IF;

    v_paid := v_paid + v_amount;
    v_net := v_net + v_amount;
    v_status := CASE
      WHEN v_total_due IS NOT NULL AND v_net + v_card >= v_total_due THEN 'paid_by_' || p_method
      ELSE 'pending'
    END;

    UPDATE public.enrollments
       SET paid_amount = v_paid,
           payment_status = v_status,
           payment_reference = CASE
             WHEN NULLIF(btrim(p_reference), '') IS NOT NULL THEN btrim(p_reference)
             ELSE payment_reference END,
           check_number = CASE
             WHEN p_method = 'check' AND NULLIF(btrim(p_reference), '') IS NOT NULL
               THEN btrim(p_reference)
             ELSE check_number END,
           updated_at = now()
     WHERE id = p_enrollment_id;

    v_entry_status := CASE WHEN v_status = 'pending' THEN 'pending' ELSE 'paid' END;

  ELSIF p_kind = 'refund' THEN
    IF p_amount IS NULL OR p_amount <= 0 OR p_amount <> round(p_amount, 2) THEN
      RAISE EXCEPTION 'invalid refund amount %', p_amount USING ERRCODE = '22023';
    END IF;
    -- Capped by what is still held, so two $30 refunds of a $50 payment are
    -- refused the second time.
    IF p_amount > v_net THEN
      RAISE EXCEPTION 'refund % exceeds the % still held (% paid, % already refunded)',
        p_amount, v_net, v_paid, v_refunded USING ERRCODE = '22023';
    END IF;
    -- NULL method = refunded some other way (Stripe, other): not box money, so
    -- the enrollment records it and the ledger does not.
    IF p_method IS NOT NULL AND p_method NOT IN ('cash', 'check') THEN
      RAISE EXCEPTION 'a desk refund is cash or check, got %', p_method USING ERRCODE = '22023';
    END IF;

    IF p_method IS NOT NULL THEN
      INSERT INTO public.show_payments
        (show_id, enrollment_id, kind, amount, method, received_on, reference, note, recorded_by)
      VALUES
        (v_show_id, p_enrollment_id, 'refund', -p_amount, p_method, v_received,
         NULLIF(btrim(p_reference), ''), NULLIF(btrim(p_note), ''), auth.uid());
    END IF;

    UPDATE public.enrollments
       -- 'refunded' once nothing is held, card money included; refund_amount accumulates.
       SET payment_status = CASE WHEN p_amount = v_net AND v_card = 0 THEN 'refunded'
                                 ELSE 'partial_refund' END,
           refund_amount = v_refunded + p_amount,
           refund_notes = NULLIF(btrim(p_note), ''),
           refunded_at = now(),
           updated_at = now()
     WHERE id = p_enrollment_id;

    v_entry_status := 'refunded';

  ELSE -- reversal: "Payment Due" -- nothing was received after all.
    -- Net every (method, day) group this enrollment recorded back to zero ON THE
    -- DAY IT WAS RECORDED, so undoing a mail-in check does not take money out
    -- of today's desk total, and undoing a desk payment does. A legacy
    -- paid_amount with no ledger rows has nothing to reverse here; the
    -- enrollment still resets, exactly as before the ledger.
    FOR v_group IN
      SELECT sp.method, sp.received_on, sum(sp.amount) AS net
        FROM public.show_payments sp
       WHERE sp.enrollment_id = p_enrollment_id
       GROUP BY sp.method, sp.received_on
      HAVING sum(sp.amount) <> 0
    LOOP
      INSERT INTO public.show_payments
        (show_id, enrollment_id, kind, amount, method, received_on, reference, note, recorded_by)
      VALUES
        (v_show_id, p_enrollment_id, 'reversal', -v_group.net, v_group.method,
         v_group.received_on, NULL, NULLIF(btrim(p_note), ''), auth.uid());
    END LOOP;

    -- Net received goes to zero on the enrollment too: nothing paid, nothing
    -- handed back. Clearing only paid_amount would leave a refund_amount that
    -- makes the net negative, and the next "Paid in Full" would charge it.
    UPDATE public.enrollments
       SET paid_amount = 0,
           refund_amount = NULL,
           refund_notes = NULL,
           refunded_at = NULL,
           -- MYK9-1637: card money is untouched, so a form it still covers stays paid.
           payment_status = CASE WHEN v_card > 0
                                  AND v_card * 100 >= v_total_cents + v_reopen_cents
                                 THEN 'paid' ELSE 'pending' END,
           updated_at = now()
     WHERE id = p_enrollment_id;

    v_entry_status := CASE WHEN v_card > 0
                            AND v_card * 100 >= v_total_cents + v_reopen_cents
                           THEN 'paid' ELSE 'pending' END;
  END IF;

  -- The entries cascade (MYK9-773 rule): one place, shared with
  -- mark_enrollment_paid_online. Only "Payment Due" reopens the entries the form refunded.
  PERFORM private.cascade_enrollment_entry_payment_status(
    p_enrollment_id, v_entry_status, p_kind = 'reversal');

  RETURN private.enrollment_payment_answer(p_enrollment_id);
END;
$$;
-- Grants as live today (CREATE OR REPLACE preserves them; restated so this migration, now
-- the latest definition, carries them).
REVOKE ALL ON FUNCTION private.record_enrollment_payment_core(uuid, text, numeric, text, date, text, text, uuid) FROM PUBLIC;
