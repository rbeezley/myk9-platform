-- Migration: Add results_released_at column to classes table
-- Author: Claude Code
-- Date: 2025-11-28
--
-- Problem: The classes table is missing the results_released_at column,
-- causing 400 Bad Request errors when the app queries for this field.
--
-- This column tracks when results for a class were released to exhibitors,
-- enabling role-based result visibility control.

-- Add the results_released_at column
ALTER TABLE classes
ADD COLUMN IF NOT EXISTS results_released_at TIMESTAMPTZ DEFAULT NULL;

-- Add helpful comment
COMMENT ON COLUMN classes.results_released_at IS
'Timestamp when results were released to exhibitors. NULL means results not yet released.';

-- Create index for performance when filtering by release status
CREATE INDEX IF NOT EXISTS idx_classes_results_released_at
ON classes(results_released_at)
WHERE results_released_at IS NOT NULL;
