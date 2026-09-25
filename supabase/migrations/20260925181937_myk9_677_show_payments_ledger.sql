-- MYK9-677: a payments ledger for the Show Closeout money card.
--
-- WHY. The closeout card reconciles the cash box against what the desk took
-- during the show. An enrollment carries ONE status, ONE paid_amount and (after
-- #2441) one received-on stamp, so a split payment ($35 mailed three weeks
-- early, $15 at the desk) could not be attributed to the right days, a partial
-- payment's cash/check method was never saved, and a check banked earlier got
-- the day it was marked paid. One row per payment received fixes all three.
--
-- SHAPE (owner decisions, 2026-09-25).
--   * `show_payments`, not `enrollment_payments`: a desk late entry
--     (`submitOfflineLateEntry`) is created OFFLINE with no enrollment at all,
--     so a row points at an enrollment OR an entry. EXACTLY one, never both: the
--     money of an entry that has an enrollment is recorded on the enrollment,
--     and a row naming both would be counted under two parents by any reader
--     that groups by either.
--   * kind: 'payment' (> 0), 'refund' (< 0, money handed back from the box),
--     'reversal' (either sign, a "Payment Due" reset undoing what was recorded).
--   * method: 'cash' | 'check' only. The card reconciles a cash box; online
--     (Stripe) money never reaches it, has its own ledger (stripe_orders /
--     stripe_order_refunds), and is left out of this one, refunds included.
--   * received_on: a `date` on the SHOW's calendar (its first trial's zone, the
--     same rule submit_show_entries and the client's getEntryWindowTimezone use).
--
-- WRITERS.
--   * private.record_enrollment_payment_core(): the ONE place the enrollment
--     money rules live. Called by public.record_enrollment_payment() (Entry
--     Management) and by submit_show_entries (20260925181939, a secretary-
--     received payment recorded in the same transaction as the entries); each
--     authorizes before calling it.
--   * public.record_enrollment_payment(): Entry Management's writer. It inserts
--     the ledger row AND moves enrollments.paid_amount / payment_status and the
--     entries cascade in one transaction, so the ledger and the enrollment
--     cannot disagree. Partial Payment's amount is now THIS payment (paid total
--     = previous + this), which fixes the overwrite that lost earlier payments.
--   * trg_entries_desk_payment_ledger: a desk late entry (no enrollment) that
--     reaches the server paid by cash or check gets exactly one 'payment' row,
--     derived from the entry's own fee, method and received date. It fires on
--     the replicated INSERT when the offline entry syncs, and on UPDATE for a
--     retried upsert; the partial unique index makes a second row impossible.
--
-- ACCESS. Clients read under RLS and never write the table directly: no
-- INSERT/UPDATE/DELETE grant or policy. A correction is a new row (a reversal
-- or refund), never an edit. The record predicate is the one Mark paid already
-- effectively enforces: enrollments_update RLS (is_show_office_manager) AND the
-- money-column triggers (has_role('secretary') or platform/site admin).
--
-- FKs are ON DELETE RESTRICT, like the Stripe ledger (MYK9-527): a money row
-- must never vanish with its parent. seed_demo_assert_no_paid_strays() gains a
-- ledger arm below so a reseed refuses with instructions instead of dying on a
-- raw 23503.

-- ---------------------------------------------------------------------------
-- helpers (private: not callable through PostgREST)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.show_time_zone(p_show_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  -- First trial's zone, validated against pg_timezone_names, default
  -- America/New_York: the rule submit_show_entries (20260918211700) uses.
  SELECT COALESCE(
    (SELECT n.name
       FROM pg_catalog.pg_timezone_names n
      WHERE n.name = (SELECT t.timezone
                        FROM public.trials t
                       WHERE t.show_id = p_show_id
                       ORDER BY t.date NULLS LAST, t.id
                       LIMIT 1)),
    'America/New_York'
  );
$$;

REVOKE ALL ON FUNCTION private.show_time_zone(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION private.can_record_show_payment(p_show_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT (SELECT public.is_site_admin())
      OR ((SELECT public.is_show_office_manager(p_show_id))
          AND (SELECT public.has_role('secretary'::text)));
$$;

REVOKE ALL ON FUNCTION private.can_record_show_payment(uuid) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- table
-- ---------------------------------------------------------------------------

CREATE TABLE public.show_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  show_id uuid NOT NULL REFERENCES public.shows(id) ON DELETE RESTRICT,
  enrollment_id uuid REFERENCES public.enrollments(id) ON DELETE RESTRICT,
  entry_id uuid REFERENCES public.entries(id) ON DELETE RESTRICT,
  kind text NOT NULL,
  amount numeric(10, 2) NOT NULL,
  method text NOT NULL,
  received_on date NOT NULL,
  reference text,
  note text,
  recorded_by uuid,
  -- A client-generated key that makes a payment write retryable: the wizard
  -- sends the same key again after a failed or lost response, and the RPC
  -- answers from the row it already wrote instead of writing a second one.
  client_payment_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT show_payments_one_parent CHECK (num_nonnulls(enrollment_id, entry_id) = 1),
  CONSTRAINT show_payments_kind_check CHECK (kind IN ('payment', 'refund', 'reversal')),
  CONSTRAINT show_payments_method_check CHECK (method IN ('cash', 'check')),
  CONSTRAINT show_payments_amount_sign CHECK (
    amount <> 0
    AND (kind <> 'payment' OR amount > 0)
    AND (kind <> 'refund' OR amount < 0)
  )
);

COMMENT ON TABLE public.show_payments IS
  'MYK9-677: one row per cash/check payment received, refunded or reversed on a show. Written only by record_enrollment_payment() and the desk-entry trigger; read by the Show Closeout money card.';

-- A desk entry gets at most one auto 'payment' row, however often it syncs.
CREATE UNIQUE INDEX show_payments_entry_payment_key
  ON public.show_payments (entry_id)
  WHERE entry_id IS NOT NULL AND kind = 'payment';
CREATE UNIQUE INDEX show_payments_client_payment_id_key
  ON public.show_payments (client_payment_id)
  WHERE client_payment_id IS NOT NULL;
CREATE INDEX show_payments_show_received_idx ON public.show_payments (show_id, received_on);
CREATE INDEX show_payments_enrollment_idx
  ON public.show_payments (enrollment_id)
  WHERE enrollment_id IS NOT NULL;

ALTER TABLE public.show_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.show_payments FORCE ROW LEVEL SECURITY;

-- Default privileges in this project hand anon (and authenticated) full CRUD on
-- every new table, so every grant here is explicit and anon is revoked.
REVOKE ALL ON public.show_payments FROM PUBLIC;
REVOKE ALL ON public.show_payments FROM anon;
REVOKE ALL ON public.show_payments FROM authenticated;
GRANT SELECT ON public.show_payments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.show_payments TO service_role;

-- Read: whoever may run the show's office (the enrollments_update predicate).
CREATE POLICY show_payments_select ON public.show_payments
  FOR SELECT TO authenticated
  USING ((SELECT public.is_site_admin()) OR public.is_show_office_manager(show_id));

-- ---------------------------------------------------------------------------
-- record_enrollment_payment: the rules live ONCE, in the private core; the
-- public RPC and submit_show_entries (20260925181939) each authorize, then call
-- it. The core does no authorization of its own and is not callable through
-- PostgREST (private schema, no grants).
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
        'refunded_at', v_row.refunded_at
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

  -- The entries cascade, EXACTLY as the pre-ledger client ran it
  -- (updateEnrollmentPaymentStatus on origin/main): every entry of the
  -- enrollment except those already 'refunded' or 'waived' takes the coarse
  -- status (paid_* -> 'paid', pending -> 'pending', refunds -> 'refunded').
  -- No other rule is added here.
  UPDATE public.entries
     SET payment_status = v_entry_status,
         updated_at = now()
   WHERE registration_id = p_enrollment_id
     AND payment_status NOT IN ('refunded', 'waived');

  SELECT * INTO v_row FROM public.enrollments WHERE id = p_enrollment_id;
  RETURN jsonb_build_object(
    'id', v_row.id,
    'payment_status', v_row.payment_status,
    'paid_amount', v_row.paid_amount,
    'payment_reference', v_row.payment_reference,
    'refund_amount', v_row.refund_amount,
    'refund_notes', v_row.refund_notes,
    'refunded_at', v_row.refunded_at
  );
END;
$$;

REVOKE ALL ON FUNCTION private.record_enrollment_payment_core(uuid, text, numeric, text, date, text, text, uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.record_enrollment_payment(
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
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_show_id uuid;
BEGIN
  SELECT e.show_id INTO v_show_id FROM public.enrollments e WHERE e.id = p_enrollment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'enrollment % not found', p_enrollment_id USING ERRCODE = '22023';
  END IF;

  -- SECURITY DEFINER drops RLS, so the record predicate is restated here.
  IF NOT private.can_record_show_payment(v_show_id) THEN
    RAISE EXCEPTION 'not authorized to record payments for enrollment %', p_enrollment_id
      USING ERRCODE = '42501';
  END IF;

  RETURN private.record_enrollment_payment_core(
    p_enrollment_id, p_kind, p_amount, p_method, p_received_on, p_reference, p_note,
    p_client_payment_id
  );
END;
$$;

COMMENT ON FUNCTION public.record_enrollment_payment(uuid, text, numeric, text, date, text, text, uuid) IS
  'MYK9-677: the only writer of an enrollment''s cash/check money. Every branch reads one net-received figure, paid_amount - refund_amount (the enrollment columns, which also cover pre-ledger payments and non-desk refunds). kind=payment (amount NULL = pay fee - net), refund (capped at net; refund_amount accumulates; method NULL = not desk money, no ledger row), reversal ("Payment Due": nets the ledger to zero per method and day, and the enrollment to paid 0 / no refund). A payment may carry p_client_payment_id: a retry with a key already recorded writes nothing and returns the enrollment. Updates paid_amount, payment_status and the entries cascade atomically. Restates the record predicate (site admin, or show office manager holding the secretary role).';

REVOKE ALL ON FUNCTION public.record_enrollment_payment(uuid, text, numeric, text, date, text, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_enrollment_payment(uuid, text, numeric, text, date, text, text, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.record_enrollment_payment(uuid, text, numeric, text, date, text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_enrollment_payment(uuid, text, numeric, text, date, text, text, uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- desk late entries: one ledger row per paid cash/check entry with no enrollment
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.entries_desk_payment_ledger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.registration_id IS NOT NULL
     OR NEW.deleted_at IS NOT NULL
     OR NEW.show_id IS NULL
     OR NEW.payment_status IS DISTINCT FROM 'paid'
     OR NEW.payment_method IS NULL
     OR NEW.payment_method NOT IN ('cash', 'check')
     OR COALESCE(NEW.entry_fee, 0) <= 0 THEN
    RETURN NULL;
  END IF;

  -- Only a caller who may record money on this show creates money. Anyone else
  -- (and the postgres/seed session, which has no auth.uid()) inserts the entry
  -- and no ledger row: never raise, the entry itself is not this trigger's call.
  IF NOT private.can_record_show_payment(NEW.show_id) THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.show_payments
    (show_id, entry_id, kind, amount, method, received_on, reference, note, recorded_by)
  VALUES (
    NEW.show_id, NEW.id, 'payment', round(NEW.entry_fee, 2), NEW.payment_method,
    COALESCE(
      NEW.payment_received_on,
      (COALESCE(NEW.submitted_at, NEW.created_at, now())
        AT TIME ZONE private.show_time_zone(NEW.show_id))::date
    ),
    NULLIF(btrim(NEW.payment_reference), ''), NULLIF(btrim(NEW.payment_notes), ''), auth.uid()
  )
  ON CONFLICT (entry_id) WHERE entry_id IS NOT NULL AND kind = 'payment' DO NOTHING;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION private.entries_desk_payment_ledger() FROM PUBLIC;

CREATE TRIGGER trg_entries_desk_payment_ledger
  AFTER INSERT OR UPDATE OF payment_status, payment_method, entry_fee, registration_id,
    deleted_at, payment_received_on
  ON public.entries
  FOR EACH ROW
  EXECUTE FUNCTION private.entries_desk_payment_ledger();

-- ---------------------------------------------------------------------------
-- backfill: what is already recorded, where the method is provable
-- ---------------------------------------------------------------------------

-- Enrollments marked paid by cash or check: one row for the paid amount.
-- received_on: the #2441 entry stamp, else a date-shaped payment_date, else the
-- enrollment's creation day on the show's calendar.
INSERT INTO public.show_payments
  (show_id, enrollment_id, kind, amount, method, received_on, reference, note)
SELECT e.show_id, e.id, 'payment', round(e.paid_amount, 2),
       CASE e.payment_status WHEN 'paid_by_cash' THEN 'cash' ELSE 'check' END,
       COALESCE(
         (SELECT min(en.payment_received_on) FROM public.entries en
           WHERE en.registration_id = e.id AND en.payment_received_on IS NOT NULL),
         CASE WHEN e.payment_date ~ '^\d{4}-\d{2}-\d{2}$' THEN e.payment_date::date END,
         (e.created_at AT TIME ZONE private.show_time_zone(e.show_id))::date
       ),
       COALESCE(e.check_number, e.payment_reference),
       'backfilled by 20260925181937'
  FROM public.enrollments e
 WHERE e.payment_status IN ('paid_by_cash', 'paid_by_check')
   AND round(COALESCE(e.paid_amount, 0), 2) > 0;

-- Refunded / partially refunded enrollments whose original cash or check
-- method is provable (the enrollment's payment_method, else a check number):
-- the gross payment row plus a negative refund row, the same pair
-- record_enrollment_payment writes, so the card nets them and paid_amount /
-- refund_amount stay the source of the refund cap. The refund row only when
-- the refund left the box: refund_notes starts with the dialog's "Cash
-- Returned" / "Check Mailed" label; a Stripe or Other refund writes none, as
-- the RPC does.
WITH refunded AS (
  SELECT e.*,
         CASE
           WHEN e.payment_method IN ('cash', 'check') THEN e.payment_method
           WHEN e.check_number IS NOT NULL THEN 'check'
         END AS method,
         (e.created_at AT TIME ZONE private.show_time_zone(e.show_id))::date AS paid_day
    FROM public.enrollments e
   WHERE e.payment_status IN ('partial_refund', 'refunded')
     AND round(COALESCE(e.paid_amount, 0), 2) > 0
)
INSERT INTO public.show_payments
  (show_id, enrollment_id, kind, amount, method, received_on, reference, note)
SELECT r.show_id, r.id, 'payment', round(r.paid_amount, 2), r.method,
       COALESCE(
         (SELECT min(en.payment_received_on) FROM public.entries en
           WHERE en.registration_id = r.id AND en.payment_received_on IS NOT NULL),
         CASE WHEN r.payment_date ~ '^\d{4}-\d{2}-\d{2}$' THEN r.payment_date::date END,
         r.paid_day
       ),
       COALESCE(r.check_number, r.payment_reference),
       'backfilled by 20260925181937'
  FROM refunded r
 WHERE r.method IS NOT NULL
UNION ALL
SELECT r.show_id, r.id, 'refund', -round(r.refund_amount, 2),
       CASE WHEN r.refund_notes ILIKE 'Cash Returned%' THEN 'cash' ELSE 'check' END,
       COALESCE((r.refunded_at AT TIME ZONE private.show_time_zone(r.show_id))::date, r.paid_day),
       NULL,
       'backfilled by 20260925181937'
  FROM refunded r
 WHERE r.method IS NOT NULL
   AND round(COALESCE(r.refund_amount, 0), 2) > 0
   AND (r.refund_notes ILIKE 'Cash Returned%' OR r.refund_notes ILIKE 'Check Mailed%');

-- Desk entries with no enrollment, paid by cash or check. No recorded_by: the
-- migration cannot know who took the money.
INSERT INTO public.show_payments
  (show_id, entry_id, kind, amount, method, received_on, reference, note)
SELECT en.show_id, en.id, 'payment', round(en.entry_fee, 2), en.payment_method,
       COALESCE(
         en.payment_received_on,
         (COALESCE(en.submitted_at, en.created_at) AT TIME ZONE private.show_time_zone(en.show_id))::date
       ),
       en.payment_reference,
       'backfilled by 20260925181937'
  FROM public.entries en
 WHERE en.registration_id IS NULL
   AND en.deleted_at IS NULL
   AND en.show_id IS NOT NULL
   AND en.payment_status = 'paid'
   AND en.payment_method IN ('cash', 'check')
   AND COALESCE(en.entry_fee, 0) > 0
ON CONFLICT (entry_id) WHERE entry_id IS NOT NULL AND kind = 'payment' DO NOTHING;

-- ---------------------------------------------------------------------------
-- seed guard: a ledger arm (copied from the LATEST definition,
-- 20260925072300_myk9_749_750_review_sweep_definer_fixes.sql, plus ledger_stray)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.seed_demo_assert_no_paid_strays()
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $fn$
DECLARE
  v_real integer; v_bare integer; v_ids text; v_bare_ids text;
  v_enroll_real integer; v_enroll_ids text;
  v_order_real integer; v_order_ids text;
  v_ledger_real integer; v_ledger_ids text;
BEGIN
  -- Guard the HARM, not the label. A paid/refunded row that also carries a
  -- trail — entry_status_history, a Stripe payment intent or order, a recorded
  -- payment reference, a refund — loses that trail when a parent cascade takes
  -- it, and the reseed deletes all four of entries' cascade parents (classes,
  -- dogs, shows, trials; pg_constraint confdeltype='c' on each). Those abort.
  --
  -- A bare `payment_status='paid'` with NONE of that corroboration is a QA-walk
  -- artifact, not money: nothing is lost by letting it cascade. Aborting on
  -- those put a mandatory manual DELETE in front of the reseed, which is the
  -- tool the seed-reset runbook reaches for when staging is already broken, and
  -- any walk that marks a demo entry paid re-armed it. Those WARN instead, so
  -- they stay visible without wedging recovery.
  --
  -- The seed cannot trip either branch on its own rows: both of its entry
  -- deletes run before this call, and every INSERT INTO public.entries in that
  -- file writes into the myk9_109 id range or the hard-coded id list they
  -- remove.
  WITH scope_shows AS (
    SELECT id FROM public.shows
    WHERE id IN ('dededede-0000-0000-0000-000000000010',
                 'dededede-0000-0000-0000-000000000011',
                 'dededede-0000-0000-0000-000000000012')
       OR (id >= 'a1090000-0000-0000-0010-000000000000'::uuid
           AND id <  'a1090000-0000-0000-0011-000000000000'::uuid)
  ),
  stray AS (
    SELECT e.id, e.stripe_payment_intent_id, e.payment_reference, e.refunded_at,
           e.refund_amount, e.refund_decided_at,
           e.payment_method, e.payment_received_on, e.payment_notes, e.entry_fee
    FROM public.entries e
    WHERE e.payment_status IN ('paid', 'refunded')
      AND (e.show_id IN (SELECT id FROM scope_shows)
           OR e.trial_id IN (SELECT id FROM public.trials WHERE show_id IN (SELECT id FROM scope_shows))
           OR e.class_id IN (SELECT c.id FROM public.classes c
                             JOIN public.trials t ON t.id = c.trial_id
                             WHERE t.show_id IN (SELECT id FROM scope_shows))
           OR (e.dog_id >= 'a1090000-0000-0000-0001-000000000000'::uuid
               AND e.dog_id <  'a1090000-0000-0000-0002-000000000000'::uuid)
           OR e.dog_id IN ('dededede-0000-0000-0000-000000000041','dededede-0000-0000-0000-000000000042',
                           'dededede-0000-0000-0000-000000000043','dededede-0000-0000-0000-000000000044',
                           'dededede-0000-0000-0000-000000000045','dededede-0000-0000-0000-000000000046'))
  ),
  substantiated AS (
    SELECT s.id FROM stray s
    WHERE s.stripe_payment_intent_id IS NOT NULL
       OR s.payment_reference IS NOT NULL
       OR s.refunded_at IS NOT NULL
       OR s.refund_amount IS NOT NULL
       OR s.refund_decided_at IS NOT NULL
       -- A check or cash payment a secretary recorded has no Stripe trail BY
       -- DESIGN. Keying corroboration on Stripe-shaped evidence alone made a
       -- recorded $30 check read as an artifact, which is how this guard came
       -- to classify money as disposable to keep the script green.
       --
       -- MYK9-539: but ONE method is a label rather than a payment.
       -- 'secretary_paid' is the secretary wizard's DEFAULT and is routinely
       -- written on a $0.00 entry, where no money moved and nothing is lost by
       -- the cascade; aborting on it put a mandatory manual DELETE in front of
       -- the recovery tool. So that method — and only that method — has to
       -- clear a non-zero entry_fee before it counts as corroboration.
       -- Everything else keeps the unconditional reading, on purpose and
       -- fail-safe in two directions: a recorded check or cash payment still
       -- aborts at ANY fee (a $0 cheque is nonsense, and refusing costs an
       -- operator one deliberate DELETE while the alternative destroys a
       -- ledger row), and a payment method added to the app LATER lands in the
       -- unconditional branch by default rather than in the lenient one.
       --
       -- The fee condition is deliberately NOT hoisted onto the whole CTE
       -- either: every other column here (a Stripe intent, a reference, a
       -- received-on date, operator notes, a refund, history) is evidence of
       -- money on its own terms, and an `AND entry_fee > 0` over all of them
       -- would collapse the substantiated/bare split instead of narrowing it —
       -- every demo entry carries a fee.
       OR (s.payment_method IS NOT NULL AND s.payment_method <> 'waived'
           AND (s.payment_method <> 'secretary_paid' OR coalesce(s.entry_fee, 0) > 0))
       OR s.payment_received_on IS NOT NULL
       OR s.payment_notes IS NOT NULL
       OR EXISTS (SELECT 1 FROM public.entry_status_history h WHERE h.entry_id = s.id)
       OR EXISTS (SELECT 1 FROM public.stripe_orders o WHERE o.entry_ids @> ARRAY[s.id])
  ),
  -- MYK9-528. Unlike the entries arm above, this arm has NO trail-substantiated
  -- vs. bare split — ANY in-scope paid/refunded enrollment aborts the reseed.
  -- The secretary's "Mark Paid Online" action (EnrollmentCard.tsx ->
  -- updateEnrollmentPaymentStatus) writes payment_status='paid_online' with no
  -- payment_reference, no paid_amount, no linked stripe_orders row — nothing a
  -- trail requirement could see — so requiring a trail here let a real paid
  -- enrollment cascade away silently, which is the opposite of what this guard
  -- exists for. The WARN-then-cascade leniency above exists to keep the
  -- 1260-row load-entries reseed from wedging on QA-walk noise; enrollments is
  -- a handful of rows and never needs that leniency.
  --
  -- "Paid" mirrors the entries arm's disposition (paid ∪ refunded, never
  -- pending/waived) widened to enrollments' own richer payment_status
  -- vocabulary (migration 168): 'paid' is the generic value the webhook
  -- trigger and the secretary_paid/group_payment UI paths write; 'paid_online'
  -- / 'paid_by_cash' / 'paid_by_check' are the specific values the same UI
  -- also writes (buildEnrollmentPaymentFields); 'refunded' / 'partial_refund'
  -- are the two refund outcomes (enrollmentPayment.ts). This matches
  -- apps/myk9show/src/utils/enrollmentGrouping.ts's dispositionOf().
  enrollment_stray AS (
    SELECT en.id
    FROM public.enrollments en
    WHERE en.payment_status IN
            ('paid', 'paid_online', 'paid_by_cash', 'paid_by_check', 'refunded', 'partial_refund')
      AND en.show_id IN (SELECT id FROM scope_shows)
      -- The seed's own multi-dog order (section 6b, id ...070) is paid by
      -- fixture, and unlike the entries case above there is no pre-guard
      -- delete to clear it first: entries.registration_id (NO ACTION) must be
      -- cleared before the enrollment itself can go, and that clear runs much
      -- further down the seed. So it is still present, unexcluded, every time
      -- this runs. Exclude it by id — confirmed the ONLY enrollment the seed
      -- inserts (one INSERT INTO public.enrollments in that file).
      AND en.id <> 'dededede-0000-0000-0000-000000000070'
  ),
  -- MYK9-527. Both stripe_orders scope FKs are ON DELETE RESTRICT as of
  -- migration 20260915191700, so any order pointing at a show the reseed
  -- deletes — or at an enrollment on one of those shows, which cascades from
  -- shows — now ABORTS the reseed with a bare 23503 somewhere deep in the
  -- delete sequence instead of silently nulling the ledger. Refuse here
  -- instead, before the first parent delete, with the same operator
  -- instructions the two arms above carry.
  --
  -- Scoped to EVERY show in scope_shows, not only show ...010: the narrower
  -- guard further down section 0 (added in #2248) covers the demo exhibitor's
  -- enrollment and show ...010 only, so an order on ...011, ...012 or any
  -- a1090000… load show was unguarded. That is the mechanism that produced the
  -- 22 fully-orphaned rows on staging.
  --
  -- Rows whose scope columns are ALREADY null are deliberately NOT matched:
  -- they reference no parent, so RESTRICT cannot fire on them and they block
  -- nothing. The seed reports them with its own RAISE WARNING instead.
  --
  -- MYK9-748: the seed ALSO deletes its own enrollment ...070 by id, wherever
  -- it sits. Reassigned to a show outside scope_shows, an order on it matched
  -- neither route above, and the reseed died on the raw RESTRICT error this
  -- arm exists to replace. It is named here on its own.
  order_stray AS (
    SELECT so.id
    FROM public.stripe_orders so
    WHERE so.show_id IN (SELECT id FROM scope_shows)
       OR so.enrollment_id IN (
            SELECT en.id FROM public.enrollments en
            WHERE en.show_id IN (SELECT id FROM scope_shows)
          )
       OR so.enrollment_id = 'dededede-0000-0000-0000-000000000070'
  ),
  -- MYK9-677. public.show_payments is a money ledger with ON DELETE RESTRICT
  -- on show, enrollment and entry, like stripe_orders above: refuse here, with
  -- instructions, instead of dying on a raw 23503 deep in the delete sequence.
  -- Every row carries show_id, and its enrollment or entry sits on that same
  -- show, so the show scope plus the seed's own enrollment covers it; an entry
  -- on a demo dog in an unscoped show is reached through the stray CTE.
  ledger_stray AS (
    SELECT sp.id
    FROM public.show_payments sp
    WHERE sp.show_id IN (SELECT id FROM scope_shows)
       OR sp.enrollment_id = 'dededede-0000-0000-0000-000000000070'
       OR sp.entry_id IN (SELECT id FROM stray)
  )
  SELECT (SELECT count(*) FROM substantiated),
         (SELECT count(*) FROM stray) - (SELECT count(*) FROM substantiated),
         -- Capped: an unbounded list put 756 ids in one error line when it ran.
         (SELECT string_agg(t.id::text, ', ' ORDER BY t.id)
          FROM (SELECT id FROM substantiated ORDER BY id LIMIT 10) t),
         (SELECT string_agg(t.id::text || ' (method=' || coalesce(t.payment_method,'none')
                            || ', fee=' || coalesce(t.entry_fee::text,'none') || ')', ', ' ORDER BY t.id)
          FROM (SELECT id, payment_method, entry_fee FROM stray
                WHERE id NOT IN (SELECT id FROM substantiated) ORDER BY id LIMIT 10) t),
         (SELECT count(*) FROM enrollment_stray),
         (SELECT string_agg(t.id::text, ', ' ORDER BY t.id)
          FROM (SELECT id FROM enrollment_stray ORDER BY id LIMIT 10) t),
         (SELECT count(*) FROM order_stray),
         (SELECT string_agg(t.id::text, ', ' ORDER BY t.id)
          FROM (SELECT id FROM order_stray ORDER BY id LIMIT 10) t),
         (SELECT count(*) FROM ledger_stray),
         (SELECT string_agg(t.id::text, ', ' ORDER BY t.id)
          FROM (SELECT id FROM ledger_stray ORDER BY id LIMIT 10) t)
    INTO v_real, v_bare, v_ids, v_bare_ids, v_enroll_real, v_enroll_ids,
         v_order_real, v_order_ids, v_ledger_real, v_ledger_ids;

  IF v_bare > 0 THEN
    RAISE WARNING 'seed-demo: % paid/refunded entr(ies) on data this reseed deletes carry no payment trail (no history, no Stripe record, no reference, no non-zero recorded payment) and will be removed with their parents. First ids: %', v_bare, v_bare_ids;
  END IF;

  IF v_real > 0 THEN
    RAISE EXCEPTION 'seed-demo: % paid or refunded entr(ies) with a real payment trail sit on a show, trial, class or dog this reseed deletes — refusing to cascade them away. First ids: %. For the full set, run the substantiated CTE of public.seed_demo_assert_no_paid_strays() as a SELECT. To clear it, HARD-delete those rows: DELETE FROM public.entries WHERE id IN (...). Soft-deleting will NOT clear this — the guard ignores deleted_at on purpose, because a soft-deleted row still cascades. Never widen this guard to get past it.', v_real, v_ids;
  END IF;

  IF v_enroll_real > 0 THEN
    RAISE EXCEPTION 'seed-demo: % paid or refunded enrollment(s) sit on a show this reseed deletes — refusing to cascade them away. First ids: %. For the full set, run the enrollment_stray CTE of public.seed_demo_assert_no_paid_strays() as a SELECT. To clear it, HARD-delete those rows from public.enrollments by id (there is no soft-delete column to set instead — a cascade from shows takes the row regardless). Never widen this guard to get past it.', v_enroll_real, v_enroll_ids;
  END IF;

  IF v_order_real > 0 THEN
    RAISE EXCEPTION 'seed-demo: % Stripe order(s) point at a show this reseed deletes, or at an enrollment on one of those shows or the seed''s own enrollment ...070 — refusing to orphan a money ledger row (MYK9-527). First ids: %. Both scope FKs are ON DELETE RESTRICT (migration 20260915191700), so continuing would abort with a raw foreign-key violation later anyway. For the full set, run the order_stray CTE of public.seed_demo_assert_no_paid_strays() as a SELECT. To clear it, resolve those orders deliberately — reassign their scope, or delete them only as a reviewed operator step, remembering public.stripe_order_refunds.order_id is RESTRICT too. Never widen this guard to get past it.', v_order_real, v_order_ids;
  END IF;

  IF v_ledger_real > 0 THEN
    RAISE EXCEPTION 'seed-demo: % show_payments ledger row(s) sit on a show, enrollment or entry this reseed deletes — refusing to delete recorded cash/check money (MYK9-677). First ids: %. Its show, enrollment and entry FKs are ON DELETE RESTRICT (migration 20260925181937), so continuing would abort with a raw foreign-key violation later anyway. For the full set, run the ledger_stray CTE of public.seed_demo_assert_no_paid_strays() as a SELECT. To clear it, delete those ledger rows only as a reviewed operator step. Never widen this guard to get past it.', v_ledger_real, v_ledger_ids;
  END IF;
END;
$fn$;

COMMENT ON FUNCTION public.seed_demo_assert_no_paid_strays() IS
  'Seed-maintenance guard (MYK9-538). Raises if supabase/seed-demo.sql would cascade away a paid/refunded entry with a payment trail, a paid enrollment, a scoped Stripe order, or a show_payments ledger row (MYK9-677). Called only by the reseed under the postgres/service role; never exposed to clients.';

-- Not an application RPC. Nothing in the client should ever be able to run a
-- function that names the seed's fixed ids and raises on live money rows.
REVOKE ALL ON FUNCTION public.seed_demo_assert_no_paid_strays() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.seed_demo_assert_no_paid_strays() FROM anon;
REVOKE ALL ON FUNCTION public.seed_demo_assert_no_paid_strays() FROM authenticated;
