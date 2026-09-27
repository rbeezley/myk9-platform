-- MYK9-773 follow-up: "Paid in Full: Online" runs the SAME entries cascade as
-- the desk, on the server.
--
-- THE BUG. 20260926024300 taught record_enrollment_payment that an entry the
-- ENROLLMENT refunded (refund_origin = 'enrollment') follows a later Paid in
-- Full / Payment Due. Entry Management's "Paid in Full: Online" never reached
-- that RPC: it wrote enrollments.payment_status = 'paid_online' over PostgREST
-- and then cascaded to the entries on the client, skipping every 'refunded'
-- entry. So an enrollment refunded and then marked paid online still showed
-- its entries refunded, and the two writes were not even one transaction.
--
-- DESIGN (owner decision: a server function).
--   * public.mark_enrollment_paid_online(p_enrollment_id): a NEW RPC, not a
--     new kind of record_enrollment_payment. That RPC is "the only writer of an
--     enrollment's cash/check money": its every branch reads the net-received
--     figure, writes a show_payments row for the Show Closeout cash box, and
--     accepts only cash or check. Online money has its own ledger (Stripe) and
--     moves none of that. An 'online' kind would skip every line of the core
--     except the cascade and weaken the cash/check-only invariant the closeout
--     card relies on. The online write is exactly what the client did before,
--     payment_status = 'paid_online' and nothing else on the enrollment (no
--     paid_amount, reference or refund column), now atomic with the cascade.
--   * The cascade rule moves, unchanged, out of record_enrollment_payment_core
--     into private.cascade_enrollment_entry_payment_status(), so it lives in
--     ONE place and both RPCs call it. The answer both return is built by one
--     helper too, private.enrollment_payment_answer(), so the client applies
--     the server's per-entry statuses from either (applyRecordedEnrollmentPayment).
--   * AUTHORIZATION. SECURITY DEFINER drops RLS, so the RPC restates the record
--     predicate record_enrollment_payment uses, private.can_record_show_payment
--     (site admin, or show office manager holding the secretary role), with the
--     show derived FROM the enrollment. That is the predicate the old client
--     write already effectively met: enrollments_update RLS
--     (is_show_office_manager) plus restrict_payment_status_update
--     (has_role('secretary') or platform admin).
--   * GRANTS. EXECUTE to authenticated (and service_role, like its sibling);
--     explicitly revoked from PUBLIC and anon. The private helpers are revoked
--     from PUBLIC and granted to no one: only the SECURITY DEFINER callers
--     (owner postgres) reach them, and the private schema is not exposed.
--
-- record_enrollment_payment_core is copied from its LATEST definition,
-- 20260926024300_myk9_773_inherited_refund_follows_payment.sql (verified
-- byte-identical to the live function body on 2026-09-26). The only changes:
-- the two answer blocks call enrollment_payment_answer(), and the cascade block
-- calls cascade_enrollment_entry_payment_status(). The cascade's `p_kind <>
-- 'refund'` test becomes `p_entry_status <> 'refunded'`, the same thing: the
-- core sets v_entry_status = 'refunded' exactly when p_kind = 'refund'.

-- ---------------------------------------------------------------------------
-- the answer: the enrollment's money columns plus every entry's status
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.enrollment_payment_answer(p_enrollment_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'id', e.id,
    'payment_status', e.payment_status,
    'paid_amount', e.paid_amount,
    'payment_reference', e.payment_reference,
    'refund_amount', e.refund_amount,
    'refund_notes', e.refund_notes,
    'refunded_at', e.refunded_at,
    -- MYK9-773: every entry as it stands; the client applies these.
    'entries', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                         'id', en.id, 'payment_status', en.payment_status) ORDER BY en.id),
                       '[]'::jsonb)
                  FROM public.entries en WHERE en.registration_id = e.id)
  )
  FROM public.enrollments e
 WHERE e.id = p_enrollment_id;
$$;

REVOKE ALL ON FUNCTION private.enrollment_payment_answer(uuid) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- the entries cascade: the ONE place the rule lives
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.cascade_enrollment_entry_payment_status(
  p_enrollment_id uuid,
  p_entry_status text
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF p_entry_status IS NULL OR p_entry_status NOT IN ('paid', 'pending', 'refunded') THEN
    RAISE EXCEPTION 'unsupported entry payment status: %', p_entry_status USING ERRCODE = '22023';
  END IF;

  -- The entries cascade: every entry of the enrollment takes the coarse status
  -- (paid_* -> 'paid', pending -> 'pending', refunds -> 'refunded'), except
  -- 'waived' ones and entries already 'refunded'.
  --
  -- MYK9-773: an entry the ENROLLMENT refunded (refund_origin = 'enrollment')
  -- follows a later payment or "Payment Due". An entry refunded on its own
  -- ('entry') or before the origin was recorded (NULL) never does, and neither
  -- does one carrying an entry-level refund stamp, whatever its origin says.
  -- A refund leaves every already-refunded entry, and its origin, alone.
  --
  -- The enrollment-refund flag is raised for THIS statement only, so the
  -- trigger stamps 'enrollment' on exactly the entries this refund turns.
  IF p_entry_status = 'refunded' THEN
    PERFORM set_config('myk9.entry_refund_origin', 'enrollment', true);
  END IF;

  UPDATE public.entries
     SET payment_status = p_entry_status,
         updated_at = now()
   WHERE registration_id = p_enrollment_id
     AND (
       payment_status NOT IN ('refunded', 'waived')
       OR (p_entry_status <> 'refunded'
           AND payment_status = 'refunded'
           AND refund_origin = 'enrollment'
           AND refund_amount IS NULL
           AND refunded_at IS NULL)
     );

  PERFORM set_config('myk9.entry_refund_origin', '', true);
END;
$$;

REVOKE ALL ON FUNCTION private.cascade_enrollment_entry_payment_status(uuid, text) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- record_enrollment_payment_core (copied from 20260926024300; calls the helpers)
-- ---------------------------------------------------------------------------

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
BEGIN
  IF p_kind NOT IN ('payment', 'refund', 'reversal') OR p_kind IS NULL THEN
    RAISE EXCEPTION 'unsupported payment kind: %', p_kind USING ERRCODE = '22023';
  END IF;

  SELECT e.show_id, COALESCE(e.paid_amount, 0), COALESCE(e.refund_amount, 0),
         e.total_amount, e.payment_status
    INTO v_show_id, v_paid, v_refunded, v_total_cents, v_status
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
    v_amount := COALESCE(p_amount, GREATEST(COALESCE(v_total_due, 0) - v_net, 0));
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
      WHEN v_total_due IS NOT NULL AND v_net >= v_total_due THEN 'paid_by_' || p_method
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
       -- 'refunded' once nothing is held; refund_amount accumulates.
       SET payment_status = CASE WHEN p_amount = v_net THEN 'refunded' ELSE 'partial_refund' END,
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
           payment_status = 'pending',
           updated_at = now()
     WHERE id = p_enrollment_id;

    v_entry_status := 'pending';
  END IF;

  -- The entries cascade (MYK9-773 rule): one place, shared with
  -- mark_enrollment_paid_online.
  PERFORM private.cascade_enrollment_entry_payment_status(p_enrollment_id, v_entry_status);

  RETURN private.enrollment_payment_answer(p_enrollment_id);
END;
$$;

REVOKE ALL ON FUNCTION private.record_enrollment_payment_core(uuid, text, numeric, text, date, text, text, uuid) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- mark_enrollment_paid_online: Entry Management's "Paid in Full: Online"
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.mark_enrollment_paid_online(p_enrollment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_show_id uuid;
BEGIN
  -- Locked like record_enrollment_payment_core, so a concurrent desk payment
  -- and this cascade are serialized on the enrollment.
  SELECT e.show_id INTO v_show_id
    FROM public.enrollments e
   WHERE e.id = p_enrollment_id
     FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'enrollment % not found', p_enrollment_id USING ERRCODE = '22023';
  END IF;

  -- SECURITY DEFINER drops RLS, so the record predicate is restated here, on
  -- the show derived from the enrollment.
  IF NOT private.can_record_show_payment(v_show_id) THEN
    RAISE EXCEPTION 'not authorized to record payments for enrollment %', p_enrollment_id
      USING ERRCODE = '42501';
  END IF;

  -- Online money never touches the cash-box figures: the status only, exactly
  -- what the client wrote before this function existed.
  UPDATE public.enrollments
     SET payment_status = 'paid_online',
         updated_at = now()
   WHERE id = p_enrollment_id;

  PERFORM private.cascade_enrollment_entry_payment_status(p_enrollment_id, 'paid');

  RETURN private.enrollment_payment_answer(p_enrollment_id);
END;
$$;

COMMENT ON FUNCTION public.mark_enrollment_paid_online(uuid) IS
  'MYK9-773: Entry Management''s "Paid in Full: Online". Sets the enrollment''s payment_status to paid_online (no money column, no show_payments row: online money is not the cash box''s) and runs the same entries cascade as record_enrollment_payment (private.cascade_enrollment_entry_payment_status): entries the enrollment refunded follow to paid, entry-level refunds and waived entries never change. Returns the enrollment''s money columns plus every entry''s resulting payment_status. Restates the record predicate (site admin, or show office manager holding the secretary role).';

REVOKE ALL ON FUNCTION public.mark_enrollment_paid_online(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_enrollment_paid_online(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.mark_enrollment_paid_online(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_enrollment_paid_online(uuid) TO service_role;
