-- Migration 033: Add scoring rule columns to classes
--
-- Adds timer_mode, hides_known, and distraction_count to the classes table.
-- These columns store sport-specific rules baked in at class creation time
-- (from sport_class_rules), so scoring works fully offline.
--
-- Existing columns already cover: num_areas, time_limit_seconds, num_hides.

ALTER TABLE classes ADD COLUMN IF NOT EXISTS timer_mode TEXT DEFAULT 'single';
ALTER TABLE classes ADD COLUMN IF NOT EXISTS hides_known BOOLEAN DEFAULT TRUE;
ALTER TABLE classes ADD COLUMN IF NOT EXISTS distraction_count INTEGER DEFAULT 0;
