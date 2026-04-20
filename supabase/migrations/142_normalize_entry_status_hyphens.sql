-- ---------------------------------------------------------------------------
-- Migration 142: Normalize entry_status underscore values to hyphenated form
-- ---------------------------------------------------------------------------
-- EntryStatus uses hyphens throughout ('checked-in', 'pending-payment', etc.)
-- except for two secretary-approval workflow values that were added with
-- underscores ('scratch_requested', 'move_up_requested').
--
-- Migration 139 added those underscore forms to the CHECK constraint so the
-- app could write them at all. This migration completes the normalization:
--   1. Expand the CHECK to accept both underscore and hyphen forms (safety net
--      for any writes that race this migration).
--   2. Backfill any existing rows to the hyphen form.
--   3. Narrow the CHECK to allow only the hyphen form.
--
-- App-side writes are updated simultaneously in this PR (scratchQueries.ts,
-- moveUpQueries.ts, TypeScript types). After this migration lands there are no
-- code paths that write the underscore form.
-- ---------------------------------------------------------------------------

BEGIN;

-- Step 1: accept both forms so no writes fail during the transition window
ALTER TABLE entries DROP CONSTRAINT IF EXISTS entries_entry_status_check;

ALTER TABLE entries ADD CONSTRAINT entries_entry_status_check CHECK (entry_status IN (
  'no-status', 'draft', 'submitted', 'paid', 'confirmed',
  'checked-in', 'at-gate', 'in-ring', 'competing', 'completed',
  'withdrawn', 'scratched', 'absent', 'moved',
  'pending-payment', 'promotion-expired',
  -- underscore (legacy, being retired)
  'scratch_requested', 'move_up_requested',
  -- hyphen (canonical going forward)
  'scratch-requested', 'move-up-requested'
));

-- Step 2: backfill any rows written with the old underscore values
UPDATE entries SET entry_status = 'scratch-requested'  WHERE entry_status = 'scratch_requested';
UPDATE entries SET entry_status = 'move-up-requested'  WHERE entry_status = 'move_up_requested';

-- Step 3: narrow to hyphen-only
ALTER TABLE entries DROP CONSTRAINT IF EXISTS entries_entry_status_check;

ALTER TABLE entries ADD CONSTRAINT entries_entry_status_check CHECK (entry_status IN (
  'no-status', 'draft', 'submitted', 'paid', 'confirmed',
  'checked-in', 'at-gate', 'in-ring', 'competing', 'completed',
  'withdrawn', 'scratched', 'absent', 'moved',
  'pending-payment', 'promotion-expired',
  'scratch-requested', 'move-up-requested'
));

COMMIT;
