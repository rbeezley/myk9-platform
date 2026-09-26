-- MYK9-773: an entry refunded BECAUSE its enrollment was refunded follows a
-- later "Paid in Full" or "Payment Due" on that enrollment. An entry refunded
-- on its own never does.
--
-- THE BUG. record_enrollment_payment (MYK9-677, 20260925181937) cascades the
-- enrollment's coarse status to every entry EXCEPT those already 'refunded' or
-- 'waived' -- the rule the pre-ledger client ran. So an enrollment refund
-- turned its entries 'refunded', and the next Paid in Full or Payment Due
-- skipped them: Entry Management showed refunded entries under an enrollment
-- that was paid or pending again.
--
-- OWNER DECISION (2026-09-25/26). Entries refunded because their enrollment
-- was refunded follow a later Paid in Full / Payment Due on it. Entry-level
-- refunds (stripe-refund-entry, the show-cancellation bulk refund, any
-- per-entry refund) are NEVER un-refunded by an enrollment action.
--
-- MECHANISM: the refund's origin is RECORDED on the entry, never derived from
-- notes or amounts.
--   * entries.refund_origin: NULL unless payment_status = 'refunded';
--     'enrollment' = refunded by the enrollment-refund cascade;
--     'entry'      = refunded any other way.
--   * The value is written by ONE trigger, trg_entries_refund_origin, never by
--     a caller. Entering 'refunded' stamps 'entry' unless the enrollment-refund
--     cascade raised the transaction-local flag `myk9.entry_refund_origin`
--     around its own UPDATE; leaving 'refunded' clears it; an entry-level
--     refund stamp (refund_amount / refunded_at, which only stripe-refund-entry
--     and stamp_show_refund_entries may write) on an already-refunded entry
--     makes it 'entry'; anything else keeps the stored value. So every
--     entry-level path stamps 'entry' without being edited, a new path is
--     entry-level by default, and a client (or a stale replicated full-row
--     UPDATE) cannot write the column: whatever it sends is replaced. The flag
--     cannot be set through PostgREST (no SQL, pg_catalog not exposed).
--   * Existing refunded rows keep NULL = unknown, which is read exactly like
--     'entry': never un-refunded. Pre-launch; the safe default.
--
-- GRANTS. authenticated holds table-level INSERT/UPDATE/DELETE on entries
-- (live relacl `authenticated=awd`) and column-level SELECT on an allowlist;
-- anon holds nothing. A new column inherits the table-level write privileges
-- (a column REVOKE cannot narrow a table grant), which the trigger neutralises
-- as above. It gets NO column SELECT: no client reads it, Entry Management
-- takes each entry's new status from the RPC's answer (below) instead.
--
-- RETURN. record_enrollment_payment now also answers `entries`: every entry
-- of the enrollment as the cascade left it ({id, payment_status}), so the
-- client applies the server's statuses and never re-derives the rule.
--
-- private.record_enrollment_payment_core is copied from its LATEST (and only)
-- definition, 20260925181937_myk9_677_show_payments_ledger.sql; the changes
-- are marked MYK9-773. The public wrapper and submit_show_entries call it
-- unchanged.

ALTER TABLE public.entries
  ADD COLUMN IF NOT EXISTS refund_origin text;

ALTER TABLE public.entries
  DROP CONSTRAINT IF EXISTS entries_refund_origin_check;
ALTER TABLE public.entries
  ADD CONSTRAINT entries_refund_origin_check
  CHECK (
    refund_origin IS NULL
    OR (refund_origin IN ('enrollment', 'entry') AND payment_status = 'refunded')
  );

COMMENT ON COLUMN public.entries.refund_origin IS
  'MYK9-773: why a refunded entry is refunded. ''enrollment'' = its enrollment was refunded (follows a later Paid in Full / Payment Due on it); ''entry'' = refunded on its own (never un-refunded by an enrollment action); NULL = not refunded, or refunded before this column (read as entry-level). Written only by trg_entries_refund_origin.';

-- ---------------------------------------------------------------------------
-- the one writer of refund_origin
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.entries_stamp_refund_origin()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.payment_status IS DISTINCT FROM 'refunded' THEN
    NEW.refund_origin := NULL;
  ELSIF TG_OP = 'INSERT' OR OLD.payment_status IS DISTINCT FROM 'refunded' THEN
    -- Entering 'refunded'. Only the enrollment-refund cascade raises the flag.
    NEW.refund_origin := CASE
      WHEN current_setting('myk9.entry_refund_origin', true) = 'enrollment' THEN 'enrollment'
      ELSE 'entry'
    END;
  ELSIF NEW.refund_amount IS DISTINCT FROM OLD.refund_amount
     OR NEW.refunded_at IS DISTINCT FROM OLD.refunded_at THEN
    -- An entry-level refund stamped on an entry that was already refunded.
    NEW.refund_origin := 'entry';
  ELSE
    NEW.refund_origin := OLD.refund_origin;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.entries_stamp_refund_origin() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_entries_refund_origin ON public.entries;
CREATE TRIGGER trg_entries_refund_origin
  BEFORE INSERT OR UPDATE OF payment_status, refund_origin, refund_amount, refunded_at
  ON public.entries
  FOR EACH ROW
  EXECUTE FUNCTION private.entries_stamp_refund_origin();

-- ---------------------------------------------------------------------------
-- record_enrollment_payment_core (copied from 20260925181937; MYK9-773 marks)
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
  v_row public.enrollments%ROWTYPE;
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
      SELECT * INTO v_row FROM public.enrollments WHERE id = p_enrollment_id;
      RETURN jsonb_build_object(
        'id', v_row.id,
        'payment_status', v_row.payment_status,
        'paid_amount', v_row.paid_amount,
        'payment_reference', v_row.payment_reference,
        'refund_amount', v_row.refund_amount,
        'refund_notes', v_row.refund_notes,
        'refunded_at', v_row.refunded_at,
        -- MYK9-773: the entries as they stand, so a retry answers like a record.
        'entries', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                             'id', en.id, 'payment_status', en.payment_status) ORDER BY en.id),
                           '[]'::jsonb)
                      FROM public.entries en WHERE en.registration_id = p_enrollment_id)
      );
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
  IF p_kind = 'refund' THEN
    PERFORM set_config('myk9.entry_refund_origin', 'enrollment', true);
  END IF;

  UPDATE public.entries
     SET payment_status = v_entry_status,
         updated_at = now()
   WHERE registration_id = p_enrollment_id
     AND (
       payment_status NOT IN ('refunded', 'waived')
       OR (p_kind <> 'refund'
           AND payment_status = 'refunded'
           AND refund_origin = 'enrollment'
           AND refund_amount IS NULL
           AND refunded_at IS NULL)
     );

  PERFORM set_config('myk9.entry_refund_origin', '', true);

  SELECT * INTO v_row FROM public.enrollments WHERE id = p_enrollment_id;
  RETURN jsonb_build_object(
    'id', v_row.id,
    'payment_status', v_row.payment_status,
    'paid_amount', v_row.paid_amount,
    'payment_reference', v_row.payment_reference,
    'refund_amount', v_row.refund_amount,
    'refund_notes', v_row.refund_notes,
    'refunded_at', v_row.refunded_at,
    -- MYK9-773: every entry as the cascade left it; the client applies these.
    'entries', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                         'id', en.id, 'payment_status', en.payment_status) ORDER BY en.id),
                       '[]'::jsonb)
                  FROM public.entries en WHERE en.registration_id = p_enrollment_id)
  );
END;
$$;

REVOKE ALL ON FUNCTION private.record_enrollment_payment_core(uuid, text, numeric, text, date, text, text, uuid) FROM PUBLIC;

COMMENT ON FUNCTION public.record_enrollment_payment(uuid, text, numeric, text, date, text, text, uuid) IS
  'MYK9-677: the only writer of an enrollment''s cash/check money. Every branch reads one net-received figure, paid_amount - refund_amount (the enrollment columns, which also cover pre-ledger payments and non-desk refunds). kind=payment (amount NULL = pay fee - net), refund (capped at net; refund_amount accumulates; method NULL = not desk money, no ledger row), reversal ("Payment Due": nets the ledger to zero per method and day, and the enrollment to paid 0 / no refund). A payment may carry p_client_payment_id: a retry with a key already recorded writes nothing and returns the enrollment. Updates paid_amount, payment_status and the entries cascade atomically; MYK9-773: entries the enrollment refunded (refund_origin = enrollment) follow a later payment or reversal, entry-level refunds never do, and the answer carries every entry''s resulting payment_status. Restates the record predicate (site admin, or show office manager holding the secretary role).';
