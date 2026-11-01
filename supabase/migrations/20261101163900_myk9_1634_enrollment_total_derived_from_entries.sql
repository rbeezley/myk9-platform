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
--     "Paid in full" (soft_delete_entry and the soft_delete_dog cascade soft-delete entries
--     without touching the total). Move-up supersession keeps the source entry live as
--     'moved' with its fee and gives the destination fee 0, so it is unaffected here.
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
--   * a captured stripe_orders row (any status but pending/failed/canceled/expired, so a
--     later 'refunded' still counts) linked to it (enrollment_id) or covering one of its
--     entries (entry_ids) - permanent, and nothing a desk payment or an exhibitor can
--     write. An unknown future status also counts, which keeps the stored total: the
--     conservative side;
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
            WHERE o.status NOT IN ('pending', 'failed', 'canceled', 'cancelled', 'expired')
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
  v_id uuid;
  v_total integer;
BEGIN
  FOR v_id IN
    SELECT DISTINCT x
      FROM unnest(CASE TG_OP
                    WHEN 'INSERT' THEN ARRAY[NEW.registration_id]
                    WHEN 'DELETE' THEN ARRAY[OLD.registration_id]
                    ELSE ARRAY[OLD.registration_id, NEW.registration_id]
                  END) AS x
     WHERE x IS NOT NULL
     ORDER BY x
  LOOP
    -- Lock the form BEFORE summing (ids in order, so a move between two forms cannot
    -- deadlock with itself). Under READ COMMITTED each statement below then sees every
    -- entry change committed before the lock was granted: two staff deleting separate
    -- entries of one form at once serialise here, and the second sums both deletions.
    PERFORM 1 FROM public.enrollments en WHERE en.id = v_id FOR UPDATE;

    -- Each helper runs once per touched form. The UPDATE names total_amount, so
    -- trg_enrollments_derive_total recomputes it; rows already right are skipped (no
    -- updated_at churn), and Stripe forms are left alone.
    IF private.enrollment_total_is_stripe(
         v_id, (SELECT en.payment_reference FROM public.enrollments en WHERE en.id = v_id)) THEN
      CONTINUE;
    END IF;
    v_total := private.enrollment_entries_total_cents(v_id);
    UPDATE public.enrollments en
       SET total_amount = v_total
     WHERE en.id = v_id
       AND en.total_amount IS DISTINCT FROM v_total;
  END LOOP;

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

-- The order marker's entry_ids overlap test, served by an index rather than a scan.
CREATE INDEX IF NOT EXISTS idx_stripe_orders_entry_ids_gin
  ON public.stripe_orders USING gin (entry_ids);

-- Backfill: every mail-in form whose stored total differs from its entries. total_amount
-- only (the BEFORE trigger computes the value); paid_amount and refunds are untouched.
UPDATE public.enrollments en
   SET total_amount = private.enrollment_entries_total_cents(en.id)
 WHERE NOT private.enrollment_total_is_stripe(en.id, en.payment_reference)
   AND en.total_amount IS DISTINCT FROM private.enrollment_entries_total_cents(en.id);
