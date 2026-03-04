-- Migration 048: Add is_results_reviewed to classes
-- Tracks whether the secretary has reviewed results before publishing.

ALTER TABLE classes
  ADD COLUMN IF NOT EXISTS is_results_reviewed BOOLEAN DEFAULT FALSE;
