-- Simplify trial statuses to 4 values: upcoming, in_progress, completed, cancelled
-- "planned", "published", "check_in", "scoring" are removed:
--   - planned/published are show-level concerns, not trial-level
--   - check_in/scoring are operational phases within "in_progress"

-- Step 1: Drop old constraint first so we can update values
ALTER TABLE trials DROP CONSTRAINT IF EXISTS trials_status_check;

-- Step 2: Migrate existing rows to valid statuses
UPDATE trials SET status = 'upcoming' WHERE status IN ('planned', 'published', 'check_in');
UPDATE trials SET status = 'completed' WHERE status = 'scoring';

-- Step 3: Add new constraint with simplified statuses
ALTER TABLE trials ADD CONSTRAINT trials_status_check
  CHECK (status IN ('upcoming', 'in_progress', 'completed', 'cancelled'));

-- Step 4: Update default
ALTER TABLE trials ALTER COLUMN status SET DEFAULT 'upcoming';
