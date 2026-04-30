-- Migration 175: Add withdrawal_reason column to entries table.
-- Stores the AKC withdrawal reason (In-Season Dog, Judge Change) plus optional notes.
-- No new RLS policy needed — existing secretary policy covers this column.

ALTER TABLE entries ADD COLUMN IF NOT EXISTS withdrawal_reason TEXT;
