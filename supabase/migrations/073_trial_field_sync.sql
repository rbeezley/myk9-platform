-- Migration 073: Trial Field Sync
-- Adds missing columns and converts time-of-day columns from TIMESTAMPTZ to TEXT.
-- See: docs/superpowers/specs/2026-03-17-trial-field-sync-design.md

-- =============================================
-- ADD MISSING COLUMNS
-- =============================================

ALTER TABLE trials ADD COLUMN IF NOT EXISTS event_number TEXT;
ALTER TABLE trials ADD COLUMN IF NOT EXISTS display_order INTEGER DEFAULT 0;
ALTER TABLE trials ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE trials ADD COLUMN IF NOT EXISTS image_url TEXT;

-- =============================================
-- CONVERT TIME-OF-DAY COLUMNS: TIMESTAMPTZ → TEXT
-- =============================================
-- These columns store display-format times like "9:00 AM", not points-in-time.
-- Use AT TIME ZONE 'UTC' for deterministic conversion.

ALTER TABLE trials
  ALTER COLUMN planned_start_time TYPE TEXT
  USING CASE
    WHEN planned_start_time IS NOT NULL
    THEN to_char(planned_start_time AT TIME ZONE 'UTC', 'FMHH:MI AM')
    ELSE NULL
  END;

ALTER TABLE trials
  ALTER COLUMN actual_start_time TYPE TEXT
  USING CASE
    WHEN actual_start_time IS NOT NULL
    THEN to_char(actual_start_time AT TIME ZONE 'UTC', 'FMHH:MI AM')
    ELSE NULL
  END;

ALTER TABLE trials
  ALTER COLUMN actual_end_time TYPE TEXT
  USING CASE
    WHEN actual_end_time IS NOT NULL
    THEN to_char(actual_end_time AT TIME ZONE 'UTC', 'FMHH:MI AM')
    ELSE NULL
  END;
