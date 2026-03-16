-- Align show and class statuses for consistency across the hierarchy
-- Shows: draft, published, upcoming, in_progress, completed, cancelled
-- Trials: upcoming, in_progress, completed, cancelled (already done in 071)
-- Classes: upcoming, in_progress, completed, cancelled

-- =============================================================================
-- SHOWS: simplify from 7 to 6 statuses
-- Remove "accepting_entries" (covered by "published") and "closed" (use "upcoming")
-- =============================================================================

ALTER TABLE shows DROP CONSTRAINT IF EXISTS shows_status_check;

-- Migrate existing data
UPDATE shows SET status = 'draft' WHERE status = 'unpublished';
UPDATE shows SET status = 'published' WHERE status = 'accepting_entries';
UPDATE shows SET status = 'upcoming' WHERE status = 'closed';

ALTER TABLE shows ADD CONSTRAINT shows_status_check
  CHECK (status IN ('draft', 'published', 'upcoming', 'in_progress', 'completed', 'cancelled'));

-- =============================================================================
-- CLASSES: simplify from 5 to 4 statuses
-- Remove "no-status" and "check-in", normalize hyphenated values
-- =============================================================================

ALTER TABLE classes DROP CONSTRAINT IF EXISTS classes_status_check;

-- Migrate existing data
UPDATE classes SET status = 'upcoming' WHERE status IN ('no-status', 'check-in', 'Scheduled', 'Upcoming');
UPDATE classes SET status = 'in_progress' WHERE status IN ('in-progress', 'In Progress');
UPDATE classes SET status = 'completed' WHERE status IN ('Completed');
UPDATE classes SET status = 'cancelled' WHERE status IN ('Cancelled');

ALTER TABLE classes ADD CONSTRAINT classes_status_check
  CHECK (status IN ('upcoming', 'in_progress', 'completed', 'cancelled'));

ALTER TABLE classes ALTER COLUMN status SET DEFAULT 'upcoming';
