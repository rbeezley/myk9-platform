-- supabase/migrations/115_add_payment_method_flags.sql
ALTER TABLE shows
  ADD COLUMN IF NOT EXISTS accept_check_payments BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS accept_cash_payments  BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN shows.accept_check_payments IS 'Whether exhibitors may pay by check at this show. Online payment is always enabled.';
COMMENT ON COLUMN shows.accept_cash_payments  IS 'Whether exhibitors may pay by cash at this show. Online payment is always enabled.';
