-- Add paid_amount to enrollments for tracking manual/partial payments.
-- Stored in dollars (numeric) separate from total_amount (Stripe cents).
ALTER TABLE enrollments
  ADD COLUMN IF NOT EXISTS paid_amount numeric(10, 2) NOT NULL DEFAULT 0;
