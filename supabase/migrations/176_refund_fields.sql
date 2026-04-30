-- Migration 176: Add refund tracking columns to enrollments table.
-- Secretaries record manual refunds here; Stripe auto-refund is deferred.
-- No new RLS policy needed — existing enrollment policies cover these columns.

ALTER TABLE enrollments
  ADD COLUMN IF NOT EXISTS refund_amount NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS refund_notes  TEXT,
  ADD COLUMN IF NOT EXISTS refunded_at   TIMESTAMPTZ;
