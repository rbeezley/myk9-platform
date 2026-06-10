-- Entry-level Stripe refund tracking.
-- Migration 176 put refund columns on ENROLLMENTS for the April manual-desk
-- refund model; per-entry ONLINE refunds issued by stripe-refund-entry need
-- the same columns on entries (one refund per entry, amount capped at the
-- entry fee). Both coexist: entries.* = Stripe refunds, enrollments.* =
-- manual desk refunds.
-- Plan: docs/plans/2026-06-09-stripe-connect-implementation.md (Phase 4)

ALTER TABLE public.entries
  ADD COLUMN IF NOT EXISTS refund_amount NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS refund_notes  TEXT,
  ADD COLUMN IF NOT EXISTS refunded_at   TIMESTAMPTZ;

COMMENT ON COLUMN public.entries.refund_amount IS
  'Stripe refund issued via stripe-refund-entry, in dollars. Manual desk refunds live on enrollments (migration 176).';

-- No new GRANTs or RLS: entries is already granted/policied and existing read
-- policies appropriately expose the columns to secretaries/club admins.

-- Write guard (migration-110 pattern, stricter): the entries_update RLS policy
-- gives managers full-row UPDATE via PostgREST, which would let a refund
-- record be forged or wiped without Stripe ever being involved. Refund columns
-- must only ever be written by the stripe-refund-entry service role — humans
-- use the refund dialog, which calls that function.
CREATE OR REPLACE FUNCTION public.restrict_entry_refund_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF (SELECT current_setting('role', true)) = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF (NEW.refund_amount IS DISTINCT FROM OLD.refund_amount)
    OR (NEW.refund_notes IS DISTINCT FROM OLD.refund_notes)
    OR (NEW.refunded_at IS DISTINCT FROM OLD.refunded_at)
  THEN
    RAISE EXCEPTION
      'refund_amount, refund_notes, and refunded_at are written only by stripe-refund-entry';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_restrict_entry_refund_columns ON public.entries;

CREATE TRIGGER trg_restrict_entry_refund_columns
  BEFORE UPDATE ON public.entries
  FOR EACH ROW
  EXECUTE FUNCTION public.restrict_entry_refund_columns();
