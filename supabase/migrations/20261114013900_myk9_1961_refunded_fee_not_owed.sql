-- MYK9-1961: a refunded or comped fee is never owed by its entry form.
-- Builds on MYK9-1634 (20261101184700) and MYK9-1637 (20261101213300); each function here
-- is copied from its latest definition in 20261101213300.
--
-- THE BUG. A desk refund (record_enrollment_payment, kind 'refund') turns the form's
-- entries 'refunded' and adds to enrollments.refund_amount, but private.enrollment_owed_cents
-- left out only deleted, waived and Stripe-stamped entries. So after a full cash or check
-- refund the form still owed its fees while holding nothing: "$25.00 due" on a refunded form.
--
-- ONE RULE, BOTH SIDES. An entry's fee counts toward what its form owes unless the entry is
-- Free (waived, or comped) or refunded (payment_status 'refunded' / 'partial_refund', or the
-- Stripe refund stamp). It is the per-entry rule of apps/myk9show/src/utils/entryAmountOwed.ts
-- (MYK9-1908); entryCountsTowardFormTotal there is this predicate for the client's forms that
-- have no enrollment row. Money received is unchanged: desk net (paid_amount - refund_amount)
-- plus card_covered_cents. So:
--   * full desk refund: owes 0, holds 0, nothing due;
--   * partial desk refund: the cascade turns every desk entry 'refunded', so the form owes
--     only its card-paid entries (which the card money covers) and the desk keeps holding the
--     rest of its money; nothing due;
--   * an entry added after a refund: owes its own fee.
--
-- OWNER DECISIONS (2026-11-13, MYK9-1961). Both replace MYK9-773's "a later payment
-- reopens the entries the form refunded" and Decision 1 of docs/plan-card-money-received.md.
--   1. MONEY STILL HELD COVERS A LATER ADD-ON. $50 paid, $10 refunded at the desk ($40
--      held), then a $30 class: the add-on is settled (paid) by the held money and the form
--      is paid in full. private.refresh_enrollment_money settles it from state: after any
--      change to what a form owes, a pending form (or a paid or refunded one holding an
--      add-on) whose money received covers a non-zero total becomes 'paid' and its pending
--      desk entries 'paid'; so does an add-on changed or removed until the form is
--      covered. "Paid in Full" then charges $0.
--   2. A PAYMENT COVERS ONLY WHAT IT IS FOR; IT NEVER REOPENS REFUNDED ENTRIES. $50 paid,
--      fully refunded, then a $30 class: the form owes $30, "Paid in Full" charges $30, and
--      the refunded entries stay refunded. The entries cascade
--      (private.cascade_enrollment_entry_payment_status) no longer reopens a refunded entry
--      on a payment: not on a desk payment (record_enrollment_payment_core, and so the
--      desk payment submit_show_entries records at submission), and not on "Paid in Full:
--      Online" (mark_enrollment_paid_online). A refunded form that gains an add-on it does
--      not cover reads 'pending'.
--   "Payment Due" (the reversal) still reopens the entries the form refunded (MYK9-773):
--   it nets the ledger, the refund rows included, back to zero and clears refund_amount, so
--   the refund is undone and those entries are owed again. It is judged on total_amount
--   plus those fees (private.enrollment_reopen_cents).
--
-- THE TRIGGER. trg_entries_refresh_enrollment_total_on_update now also fires when an entry
-- enters or leaves the refunded statuses, or its comp flag changes, so the form's total
-- follows a refund, a Payment Due, and a comp.
--
-- MONEY. Nothing here creates or queues a refund, calls Stripe, or writes paid_amount,
-- refund_amount, refund_requests or a payout. The backfill recomputes total_amount only.

-- What a form owes (cents).
CREATE OR REPLACE FUNCTION private.enrollment_owed_cents(p_enrollment_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(round(sum(e.entry_fee) * 100), 0)::integer
    FROM public.entries e
   WHERE e.registration_id = p_enrollment_id
     AND e.deleted_at IS NULL
     AND e.payment_status IS DISTINCT FROM 'waived'
     AND e.payment_status IS DISTINCT FROM 'refunded'
     AND e.payment_status IS DISTINCT FROM 'partial_refund'
     AND e.comped IS NOT TRUE
     AND e.refund_amount IS NULL;
$$;

COMMENT ON FUNCTION private.enrollment_owed_cents(uuid) IS
  'MYK9-1634/1637/1961: what an entry form owes (cents): entry_fee over its entries that are not deleted, not Free (waived or comped) and not refunded (refunded status or the Stripe refund stamp).';

-- Fees "Payment Due" brings back: the entries its cascade
-- (private.cascade_enrollment_entry_payment_status with p_reopen_refunded) reopens, less any
-- comped one. A payment reopens nothing (owner, 2026-11-13).
CREATE OR REPLACE FUNCTION private.enrollment_reopen_cents(p_enrollment_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(round(sum(e.entry_fee) * 100), 0)::integer
    FROM public.entries e
   WHERE e.registration_id = p_enrollment_id
     AND e.deleted_at IS NULL
     AND e.payment_status = 'refunded'
     AND e.refund_origin = 'enrollment'
     AND e.refund_amount IS NULL
     AND e.refunded_at IS NULL
     AND e.comped IS NOT TRUE
     AND NOT private.entry_is_card_paid(e.id, e.refund_amount);
$$;

COMMENT ON FUNCTION private.enrollment_reopen_cents(uuid) IS
  'MYK9-1961: fees of the entries Payment Due reopens (refunded by their form, MYK9-773): not in enrollment_owed_cents until the cascade reopens them. A payment never reopens them.';

-- The MYK9-1637 WHEN clause, with the refunded statuses and the comp flag beside waived.
DROP TRIGGER IF EXISTS trg_entries_refresh_enrollment_total_on_update ON public.entries;
CREATE TRIGGER trg_entries_refresh_enrollment_total_on_update
  AFTER UPDATE ON public.entries
  FOR EACH ROW
  WHEN (NEW.entry_fee IS DISTINCT FROM OLD.entry_fee
        OR (NEW.deleted_at IS NULL) <> (OLD.deleted_at IS NULL)
        OR NEW.registration_id IS DISTINCT FROM OLD.registration_id
        OR (COALESCE(NEW.payment_status, '') IN ('waived', 'refunded', 'partial_refund'))
           <> (COALESCE(OLD.payment_status, '') IN ('waived', 'refunded', 'partial_refund'))
        OR NEW.comped IS DISTINCT FROM OLD.comped
        OR (NEW.refund_amount IS NULL) <> (OLD.refund_amount IS NULL))
  EXECUTE FUNCTION private.entries_refresh_enrollment_total();

-- ---------------------------------------------------------------------------
-- refresh_enrollment_money (from 20261101213300): owner decision 1, money still held
-- covers a later add-on; a refunded form that gains an add-on it does not cover is pending.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.refresh_enrollment_money(p_enrollment_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_old_total integer;
  v_old_card integer;
  v_status text;
  v_desk_cents numeric;
  v_total integer;
  v_card integer;
  v_received numeric;
  v_settle boolean;
BEGIN
  -- NO KEY UPDATE, not UPDATE: an entry INSERT already holds KEY SHARE on its form from
  -- the foreign-key check, which FOR UPDATE would wait on, so two concurrent inserts onto
  -- one form would deadlock; NO KEY UPDATE queues them instead (MYK9-1634).
  SELECT en.total_amount, en.card_covered_cents, en.payment_status,
         (COALESCE(en.paid_amount, 0) - COALESCE(en.refund_amount, 0)) * 100
    INTO v_old_total, v_old_card, v_status, v_desk_cents
    FROM public.enrollments en
   WHERE en.id = p_enrollment_id
     FOR NO KEY UPDATE;

  -- A form deleted with its entries is left alone.
  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_total := private.enrollment_owed_cents(p_enrollment_id);
  v_card := private.enrollment_card_covered_cents(p_enrollment_id);
  IF v_total IS NOT DISTINCT FROM v_old_total AND v_card = v_old_card THEN
    RETURN;
  END IF;
  v_received := v_desk_cents + v_card;

  -- MYK9-1961 (owner decision 1, 2026-11-13): SETTLE FROM STATE, not from the direction the
  -- total moved. After any change to what the form owes or to its card money, a form whose
  -- money received (desk net + card) covers a non-zero total settles: the pending desk
  -- entries that money covers are paid (below), and a form in an owed state is paid. It
  -- settles when it is
  --   * 'pending': whatever made it pending (an add-on the held money did not cover, a part
  --     payment), it is paid once nothing is due: a class removed, a fee lowered, card money
  --     captured;
  --   * paid, refunded or partial_refund, holding a pending desk entry: an add-on, since a
  --     payment's or a refund's cascade left none. A paid form stays as it is labelled; a
  --     refunded one is paid. Without an add-on, a refunded form whose card money covers its
  --     card-paid entries is not a settled form and stays refunded.
  -- Guards: no money held never settles (received 0 < total); an emptied form (total 0) is
  -- not settled by this rule; 'waived' is untouched. The add-on test is the entry filter of
  -- the settle UPDATE below.
  v_settle := v_total > 0
              AND v_received >= v_total
              AND (v_status = 'pending'
                   OR (v_status IN ('paid', 'paid_by_cash', 'paid_by_check',
                                    'refunded', 'partial_refund')
                       AND EXISTS (
                         SELECT 1
                           FROM public.entries e
                          WHERE e.registration_id = p_enrollment_id
                            AND e.deleted_at IS NULL
                            AND e.payment_status = 'pending'
                            AND e.comped IS NOT TRUE
                            AND e.payment_method IS DISTINCT FROM 'online'
                            AND NOT private.entry_is_card_paid(e.id, e.refund_amount))));

  UPDATE public.enrollments en
     SET total_amount = v_total,
         card_covered_cents = v_card,
         payment_status = CASE
           WHEN v_status IN ('paid', 'paid_by_cash', 'paid_by_check', 'waived')
            AND (v_total > COALESCE(v_old_total, 0) OR v_card < v_old_card)
            AND v_received < v_total
           THEN 'pending'
           -- MYK9-1961: a refunded form owes a later add-on it does not cover (owner
           -- decision 2); its refunded entries stay refunded.
           WHEN v_status IN ('refunded', 'partial_refund')
            AND v_total > COALESCE(v_old_total, 0)
            AND v_received < v_total
           THEN 'pending'
           WHEN v_settle AND v_status IN ('pending', 'refunded', 'partial_refund')
           THEN 'paid'
           WHEN v_status IN ('pending', 'waived')
            AND v_card > v_old_card
            AND v_received >= v_total
           THEN 'paid'
           ELSE en.payment_status
         END
   WHERE en.id = p_enrollment_id;

  -- The add-ons the money received covers are paid. Only a pending desk entry: a refunded,
  -- waived or comped one is closed, a card-paid one is the card's (MYK9-1637), and an
  -- online-method entry is marked paid only by the payment service. The status moves
  -- between two statuses the total does not read, so no trigger here fires again.
  IF v_settle THEN
    UPDATE public.entries e
       SET payment_status = 'paid',
           updated_at = now()
     WHERE e.registration_id = p_enrollment_id
       AND e.deleted_at IS NULL
       AND e.payment_status = 'pending'
       AND e.comped IS NOT TRUE
       AND e.payment_method IS DISTINCT FROM 'online'
       AND NOT private.entry_is_card_paid(e.id, e.refund_amount);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION private.refresh_enrollment_money(uuid) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- The status guard (from 20261101213300): the two MYK9-1961 derived moves of
-- refresh_enrollment_money (a refunded form to pending, and the settle to paid) are allowed
-- inside an exhibitor's own add-on, class change or removal.
-- CREATE OR REPLACE keeps its grants.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.restrict_payment_status_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    -- Allow service_role (edge functions, Stripe webhooks) to bypass
    IF (SELECT current_setting('role', true)) = 'service_role' THEN
        RETURN NEW;
    END IF;

    -- Allow platform_admin and site_admin to bypass
    IF (SELECT is_platform_admin()) THEN
        RETURN NEW;
    END IF;

    -- Allow secretaries to bypass
    IF (SELECT has_role('secretary'::text)) THEN
        RETURN NEW;
    END IF;

    IF NEW.payment_status IS DISTINCT FROM OLD.payment_status THEN
        -- MYK9-1634/1637: an exhibitor's own add-on onto a settled form reopens it in
        -- private.refresh_enrollment_money(), inside the exhibitor's request. That one
        -- change is allowed: settled -> 'pending' on a form whose total (already derived by
        -- trg_enrollments_derive_total) exceeds the money received, desk and card. It is
        -- the state the database derives for that form, and moves no money.
        --
        -- MYK9-1961: the same move from a refunded form (refunded / partial_refund), whose
        -- later add-on it no longer covers (owner decision 2, 2026-11-13).
        IF NEW.payment_status = 'pending'
           AND OLD.payment_status IN ('paid', 'paid_by_cash', 'paid_by_check', 'waived',
                                      'refunded', 'partial_refund')
           AND COALESCE(NEW.total_amount, 0)
               > (COALESCE(NEW.paid_amount, 0) - COALESCE(NEW.refund_amount, 0)) * 100
                 + NEW.card_covered_cents THEN
            RETURN NEW;
        END IF;

        -- MYK9-1637: the other derived move, 'pending' -> 'paid' when the form's card money
        -- grew and now covers it (a capture). card_covered_cents is recomputed from
        -- succeeded orders by trg_enrollments_derive_total before this guard runs, so no
        -- caller can make it grow by writing it.
        IF NEW.payment_status = 'paid'
           AND OLD.payment_status = 'pending'
           AND NEW.card_covered_cents > OLD.card_covered_cents
           AND (COALESCE(NEW.paid_amount, 0) - COALESCE(NEW.refund_amount, 0)) * 100
                 + NEW.card_covered_cents >= COALESCE(NEW.total_amount, 0) THEN
            RETURN NEW;
        END IF;

        -- MYK9-1961 (owner decision 1, 2026-11-13): the settle of
        -- private.refresh_enrollment_money, inside an exhibitor's own add-on, class change or
        -- removal: pending / refunded / partial_refund -> 'paid' when what the form owes or
        -- its card money just changed and the money received, desk and card, covers a
        -- non-zero total. Both figures are recomputed (from the entries and from succeeded
        -- orders) by trg_enrollments_derive_total before this guard runs, and the money
        -- columns have their own guard, so a direct UPDATE cannot change either one: it
        -- meets the "changed" test only where the stored figures were stale, and then the
        -- move is the state the database derives for the form. It moves no money.
        IF NEW.payment_status = 'paid'
           AND OLD.payment_status IN ('pending', 'refunded', 'partial_refund')
           AND (NEW.total_amount IS DISTINCT FROM OLD.total_amount
                OR NEW.card_covered_cents IS DISTINCT FROM OLD.card_covered_cents)
           AND COALESCE(NEW.total_amount, 0) > 0
           AND (COALESCE(NEW.paid_amount, 0) - COALESCE(NEW.refund_amount, 0)) * 100
                 + NEW.card_covered_cents >= COALESCE(NEW.total_amount, 0) THEN
            RETURN NEW;
        END IF;

        -- Block any other attempt to change payment_status by unprivileged users
        RAISE EXCEPTION 'payment_status can only be modified by the service role, a platform admin, or a secretary';
    END IF;

    RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------------------
-- The entries cascade (from 20261101213300): a payment never reopens a refunded entry
-- (owner decision 2). Only "Payment Due" (p_reopen_refunded) reopens the entries the form
-- refunded. A new argument, so the old two-argument function is dropped; its callers
-- (record_enrollment_payment_core below, mark_enrollment_paid_online) name the function
-- only in their bodies, and a two-argument call takes the default: no reopening.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS private.cascade_enrollment_entry_payment_status(uuid, text);

CREATE OR REPLACE FUNCTION private.cascade_enrollment_entry_payment_status(
  p_enrollment_id uuid,
  p_entry_status text,
  p_reopen_refunded boolean DEFAULT false
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
  -- MYK9-1961 (owner, 2026-11-13): a payment covers only what it is for, so it never
  -- reopens a refunded entry. "Payment Due" (p_reopen_refunded) undoes the refund too, so
  -- an entry the ENROLLMENT refunded (refund_origin = 'enrollment', MYK9-773) follows it.
  -- An entry refunded on its own ('entry') or before the origin was recorded (NULL) never
  -- does, and neither does one carrying an entry-level refund stamp, whatever its origin
  -- says. A refund leaves every already-refunded entry, and its origin, alone.
  --
  -- The enrollment-refund flag is raised for THIS statement only, so the
  -- trigger stamps 'enrollment' on exactly the entries this refund turns.
  IF p_entry_status = 'refunded' THEN
    PERFORM set_config('myk9.entry_refund_origin', 'enrollment', true);
  END IF;

  -- MYK9-1637: an entry a succeeded Stripe order paid for (and Stripe has not refunded)
  -- is paid by card whatever happens to the desk money, so the desk never relabels it.
  UPDATE public.entries
     SET payment_status = p_entry_status,
         updated_at = now()
   WHERE registration_id = p_enrollment_id
     AND NOT private.entry_is_card_paid(id, refund_amount)
     AND (
       payment_status NOT IN ('refunded', 'waived')
       OR (p_reopen_refunded
           AND p_entry_status <> 'refunded'
           AND payment_status = 'refunded'
           AND refund_origin = 'enrollment'
           AND refund_amount IS NULL
           AND refunded_at IS NULL)
     );

  PERFORM set_config('myk9.entry_refund_origin', '', true);
END;
$$;

REVOKE ALL ON FUNCTION private.cascade_enrollment_entry_payment_status(uuid, text, boolean) FROM PUBLIC;

-- mark_enrollment_paid_online is unchanged; its description follows the cascade.
COMMENT ON FUNCTION public.mark_enrollment_paid_online(uuid) IS
  'MYK9-773/1961: Entry Management''s "Paid in Full: Online". Sets the enrollment''s payment_status to paid_online (no money column, no show_payments row: online money is not the cash box''s) and runs the same entries cascade as record_enrollment_payment (private.cascade_enrollment_entry_payment_status): unpaid entries follow to paid; refunded and waived entries never change (MYK9-1961: a payment never reopens a refunded entry). Returns the enrollment''s money columns plus every entry''s resulting payment_status. Restates the record predicate (site admin, or show office manager holding the secretary role).';

-- ---------------------------------------------------------------------------
-- record_enrollment_payment_core (from 20261101213300): a payment reopens nothing and is
-- judged on what the form owes; "Payment Due" is judged on the total the form has once its
-- cascade reopens the entries the form refunded.
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
REVOKE ALL ON FUNCTION private.enrollment_owed_cents(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.enrollment_reopen_cents(uuid) FROM PUBLIC, anon, authenticated;

-- Backfill: naming total_amount fires trg_enrollments_derive_total, which recomputes both
-- derived figures. No status, paid amount or refund changes.
UPDATE public.enrollments en
   SET total_amount = en.total_amount
 WHERE en.total_amount IS DISTINCT FROM private.enrollment_owed_cents(en.id);
