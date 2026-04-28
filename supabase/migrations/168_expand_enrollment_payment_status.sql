-- Expand the payment_status check constraint on enrollments to include
-- all specific payment method values used by the secretary UI.
ALTER TABLE enrollments
  DROP CONSTRAINT IF EXISTS registrations_payment_status_check;

ALTER TABLE enrollments
  ADD CONSTRAINT registrations_payment_status_check
  CHECK (payment_status = ANY (ARRAY[
    'pending',
    'paid',
    'paid_online',
    'paid_by_cash',
    'paid_by_check',
    'refunded',
    'partial_refund',
    'waived'
  ]));
