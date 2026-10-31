-- MYK9-1634: an entry form's total is derived from its entries, in the database.
--
-- THE BUG. enrollments.total_amount (cents) is the fee owed: the entry form's footer
-- ("$X due"), the MYK9-1600 checklist and "Paid in full" (record_enrollment_payment with
-- amount NULL charges total - net received) all read it. It was a stored running sum with
-- several writers and no reconciliation:
--   * submit_show_entries added the created entries' fees only when the submission carried
--     a received payment;
--   * otherwise the client added them in a SECOND write after the RPC returned
--     (submitShowRegistration's recordEnrollmentPayment), so a closed tab or a failed write
--     left entries the total never counted;
--   * nothing ever subtracted: a deleted unpaid entry's fee stayed in "$X due" and in
--     "Paid in full" (soft_delete_entry, the soft_delete_dog cascade and move-up
--     supersession all soft-delete entries without touching the total).
--
-- THE FIX. For a form not paid by online checkout, total_amount IS the sum of its
-- non-deleted entries' entry_fee, in cents, and nothing else can set it:
--   * AFTER trigger on entries: an insert, a delete, or a change of entry_fee, deleted_at
--     or registration_id recomputes the total of every form the row was or is on;
--   * BEFORE trigger on enrollments: any INSERT, or an UPDATE naming total_amount or
--     payment_reference, has total_amount replaced by the derived figure. The existing
--     increments (the server's p_payment branch, the client's builders) therefore become
--     harmless and need no change; they stay as written.
--
-- WHICH FORMS. A form paid by online checkout keeps the Stripe charge as its total
-- (confirm_successful_checkout_enrollments writes it, processing fees included, and its
-- entries can carry entry_fee 0). It is recognised by EITHER marker:
--   * a succeeded stripe_orders row linked to it (enrollment_id) or covering one of its
--     entries (entry_ids) - permanent, and nothing a desk payment or an exhibitor can
--     write;
--   * the Stripe payment intent in payment_reference ('pi_...') - present from the
--     checkout INSERT itself, before the order row is linked. A later desk payment may
--     overwrite payment_reference with a check number (record_enrollment_payment_core),
--     which is why the order marker must also hold.
-- payment_method is NOT a marker: it defaults to 'online' on every row.
--
-- CONCURRENCY. Changing an entry now locks its row and then its form's row, while
-- record_enrollment_payment locks the form and then its entries. A delete and a payment
-- on the same form at the same instant can deadlock; Postgres aborts one with 40P01, a
-- retryable error that changes nothing. Accepted: rare, and nothing is written wrong.
--
-- WHAT COUNTS. Every non-deleted entry on the form, whatever its entry_status or
-- payment_status. That is what the old running sum held (it never subtracted on scratch,
-- pull, refund or rejection), and 48 of 62 live forms already equal it exactly; only
-- deletion changes meaning, as a deleted entry was never owed.
--
-- MONEY. Nothing here touches paid_amount, refund_amount, payment_status or the ledger,
-- and nothing creates or queues a refund. The backfill below changes total_amount only.

CREATE OR REPLACE FUNCTION private.enrollment_entries_total_cents(p_enrollment_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(round(sum(e.entry_fee) * 100), 0)::integer
    FROM public.entries e
   WHERE e.registration_id = p_enrollment_id
     AND e.deleted_at IS NULL;
$$;

COMMENT ON FUNCTION private.enrollment_entries_total_cents(uuid) IS
  'MYK9-1634: the derived total (cents) of an entry form: the sum of its non-deleted entries'' entry_fee.';

CREATE OR REPLACE FUNCTION private.enrollment_total_is_stripe(
  p_enrollment_id uuid,
  p_payment_reference text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(p_payment_reference LIKE 'pi\_%', false)
      OR EXISTS (
           SELECT 1
             FROM public.stripe_orders o
            WHERE o.status = 'succeeded'
              AND (o.enrollment_id = p_enrollment_id
                   OR o.entry_ids && ARRAY(SELECT e.id FROM public.entries e
                                            WHERE e.registration_id = p_enrollment_id)));
$$;

COMMENT ON FUNCTION private.enrollment_total_is_stripe(uuid, text) IS
  'MYK9-1634: a form paid by online checkout (a succeeded Stripe order covers it, or its payment_reference is the Stripe intent) keeps the Stripe charge as its total.';

-- BEFORE INSERT / UPDATE on enrollments: no writer can set a mail-in form's total.
CREATE OR REPLACE FUNCTION private.enrollments_derive_total()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT private.enrollment_total_is_stripe(NEW.id, NEW.payment_reference) THEN
    NEW.total_amount := private.enrollment_entries_total_cents(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_enrollments_derive_total
  BEFORE INSERT OR UPDATE OF total_amount, payment_reference ON public.enrollments
  FOR EACH ROW EXECUTE FUNCTION private.enrollments_derive_total();

-- AFTER on entries: keep each touched mail-in form's total equal to its entries.
CREATE OR REPLACE FUNCTION private.entries_refresh_enrollment_total()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_ids uuid[];
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_ids := ARRAY[NEW.registration_id];
  ELSIF TG_OP = 'DELETE' THEN
    v_ids := ARRAY[OLD.registration_id];
  ELSE
    v_ids := ARRAY[OLD.registration_id, NEW.registration_id];
  END IF;

  -- The UPDATE names total_amount, so trg_enrollments_derive_total recomputes it; the
  -- WHERE skips Stripe forms and rows already right (no updated_at churn).
  UPDATE public.enrollments en
     SET total_amount = private.enrollment_entries_total_cents(en.id)
   WHERE en.id = ANY (v_ids)
     AND NOT private.enrollment_total_is_stripe(en.id, en.payment_reference)
     AND en.total_amount IS DISTINCT FROM private.enrollment_entries_total_cents(en.id);

  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_entries_refresh_enrollment_total
  AFTER INSERT OR DELETE OR UPDATE OF entry_fee, deleted_at, registration_id ON public.entries
  FOR EACH ROW EXECUTE FUNCTION private.entries_refresh_enrollment_total();

REVOKE ALL ON FUNCTION private.enrollment_entries_total_cents(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.enrollment_total_is_stripe(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.enrollments_derive_total() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.entries_refresh_enrollment_total() FROM PUBLIC, anon, authenticated;

-- Backfill: every mail-in form whose stored total differs from its entries. total_amount
-- only (the BEFORE trigger computes the value); paid_amount and refunds are untouched.
UPDATE public.enrollments en
   SET total_amount = private.enrollment_entries_total_cents(en.id)
 WHERE NOT private.enrollment_total_is_stripe(en.id, en.payment_reference)
   AND en.total_amount IS DISTINCT FROM private.enrollment_entries_total_cents(en.id);
