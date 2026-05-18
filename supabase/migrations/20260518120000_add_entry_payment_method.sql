-- Store show-day desk payment method on each entry.
--
-- Enrollments can describe a handler's overall show payment, but late-entry
-- add-ons are per-entry desk transactions. Keeping the method on entries lets
-- Wrap-up reconciliation separate cash/check/waived without Stripe automation.

ALTER TABLE public.entries
  ADD COLUMN IF NOT EXISTS payment_method TEXT;

ALTER TABLE public.entries
  DROP CONSTRAINT IF EXISTS entries_payment_method_check;

ALTER TABLE public.entries
  ADD CONSTRAINT entries_payment_method_check
  CHECK (
    payment_method IS NULL
    OR payment_method = ANY (ARRAY['online', 'cash', 'check', 'waived', 'secretary_paid'])
  );

COMMENT ON COLUMN public.entries.payment_method IS
  'Payment method captured for per-entry desk transactions such as day-of late entries.';
