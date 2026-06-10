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

-- No new GRANTs or RLS: entries is already granted/policied, these columns are
-- written exclusively by the service-role edge function, and existing entry
-- read policies appropriately expose them to secretaries/club admins.
