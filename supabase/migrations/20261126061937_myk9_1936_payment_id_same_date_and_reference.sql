-- MYK9-1936: a desk retry that reuses a payment's id must name the SAME payment,
-- received date and check number included.
--
-- Entry Management's payment dialogs keep a payment's id across a retry of a save whose
-- answer was lost (the dialog keeps what the secretary typed, MYK9-2156). The core's
-- retry check matches only the enrollment, kind, method and amount, so a secretary who
-- fixed the received date or check number before retrying, when the first call had in
-- fact landed, was answered "saved" while the ledger kept the old date and check number.
--
-- The check lives in the public desk entry point ONLY. private.record_enrollment_payment_core
-- is unchanged, so its other callers (submit_show_entries keyed on the submission id, the
-- late-entry trigger keyed on the entry id) keep answering a replay as before, even one
-- whose "today" date has moved past midnight.
--
-- public.record_enrollment_payment is copied from its latest (and only) definition,
-- 20260925181937_myk9_677_show_payments_ledger.sql, a thin wrapper over the core; the one
-- change is the block before the core call. Signature, SECURITY DEFINER, search_path and
-- grants are unchanged; CREATE OR REPLACE keeps the owner, and the comment and grants are
-- restated as that file writes them.

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

  -- MYK9-1936: this enrollment's payment already recorded under this id, but sent again
  -- with a changed received date or check number. Answering "saved" would keep the old
  -- ones, so refuse and let the person look at the payment that is there. A NULL date is
  -- the "today" default and is not compared; the reference is compared as the core
  -- stores it. A row on another enrollment is left to the core's own refusal.
  -- Take the enrollment lock the core takes, first, so a retry overlapping a first call
  -- that is still committing waits for it and then sees its row (the core re-locks the
  -- same row in this transaction, which is a no-op).
  IF p_client_payment_id IS NOT NULL THEN
    PERFORM 1 FROM public.enrollments e WHERE e.id = p_enrollment_id FOR UPDATE;
  END IF;

  IF p_client_payment_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.show_payments sp
     WHERE sp.client_payment_id = p_client_payment_id
       AND sp.enrollment_id = p_enrollment_id
       AND ((p_received_on IS NOT NULL AND sp.received_on <> p_received_on)
            OR sp.reference IS DISTINCT FROM NULLIF(btrim(p_reference), ''))
  ) THEN
    RAISE EXCEPTION 'client_payment_id % was already saved with a different received date or reference',
      p_client_payment_id USING ERRCODE = '22023';
  END IF;

  RETURN private.record_enrollment_payment_core(
    p_enrollment_id, p_kind, p_amount, p_method, p_received_on, p_reference, p_note,
    p_client_payment_id
  );
END;
$$;

COMMENT ON FUNCTION public.record_enrollment_payment(uuid, text, numeric, text, date, text, text, uuid) IS
  'MYK9-677: the only writer of an enrollment''s cash/check money. Every branch reads one net-received figure, paid_amount - refund_amount (the enrollment columns, which also cover pre-ledger payments and non-desk refunds). kind=payment (amount NULL = pay fee - net), refund (capped at net; refund_amount accumulates; method NULL = not desk money, no ledger row), reversal ("Payment Due": nets the ledger to zero per method and day, and the enrollment to paid 0 / no refund). A payment may carry p_client_payment_id: a retry with a key already recorded writes nothing and returns the enrollment; MYK9-1936: a retry of that key on this enrollment with a different received date or reference is refused (this entry point only; the core is unchanged). Updates paid_amount, payment_status and the entries cascade atomically; MYK9-773: entries the enrollment refunded (refund_origin = enrollment) follow a later payment or reversal, entry-level refunds never do, and the answer carries every entry''s resulting payment_status. Restates the record predicate (site admin, or show office manager holding the secretary role).';

REVOKE ALL ON FUNCTION public.record_enrollment_payment(uuid, text, numeric, text, date, text, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_enrollment_payment(uuid, text, numeric, text, date, text, text, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.record_enrollment_payment(uuid, text, numeric, text, date, text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_enrollment_payment(uuid, text, numeric, text, date, text, text, uuid) TO service_role;
