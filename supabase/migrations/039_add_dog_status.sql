-- =============================================================================
-- ADD DOG STATUS COLUMN
-- =============================================================================
-- Adds a lifecycle status to dogs: active, retired, or deceased.
-- Backfills from existing deceased boolean.
-- Source of truth going forward (supersedes deceased boolean).

ALTER TABLE dogs ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active'
  CHECK (status IN ('active', 'retired', 'deceased'));

-- Backfill from existing deceased boolean
UPDATE dogs SET status = 'deceased' WHERE deceased = TRUE AND (status IS NULL OR status = 'active');

-- Index for status filtering (entry queries filter on this)
CREATE INDEX IF NOT EXISTS dogs_status_idx ON dogs(status);

COMMENT ON COLUMN dogs.status IS 'Dog lifecycle status: active, retired, or deceased. Source of truth (supersedes deceased boolean).';

SELECT 'Migration 039: Dog status column added successfully' as status;
