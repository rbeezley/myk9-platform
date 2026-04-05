-- Migration 112: Payment detail columns on registrations table
--
-- The PaymentStep wizard collects check number, payment date, group reference,
-- and payment notes for non-online payment methods (check, cash, secretary_paid,
-- group_payment). These were previously captured in UI state but never persisted.

ALTER TABLE registrations
  ADD COLUMN IF NOT EXISTS check_number    TEXT,
  ADD COLUMN IF NOT EXISTS payment_date    TEXT,
  ADD COLUMN IF NOT EXISTS group_reference TEXT,
  ADD COLUMN IF NOT EXISTS payment_notes   TEXT;
