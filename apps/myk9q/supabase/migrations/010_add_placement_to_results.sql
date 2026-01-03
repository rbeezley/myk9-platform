-- Add index for placement calculations
-- Migration: 010_add_placement_to_results.sql

-- Add index for faster placement queries using existing final_placement field
CREATE INDEX IF NOT EXISTS idx_results_final_placement
ON results(final_placement)
WHERE final_placement IS NOT NULL;

-- Add comment
COMMENT ON COLUMN results.final_placement IS 'Dog placement in class (1st, 2nd, 3rd, etc.) - calculated based on qualifying result, faults/points, and time';