-- ---------------------------------------------------------------------------
-- Migration 139: Expand entry_status CHECK constraint
-- ---------------------------------------------------------------------------
-- Migration 116 ("myK9Q compatibility") rewrote the constraint to add
-- ring-state values ('at-gate', 'in-ring') but did not carry forward the two
-- waitlist values ('pending-payment', 'promotion-expired') that migration 114
-- had added. This migration restores them.
--
-- It also adds three workflow-transition values the app code writes but the
-- constraint never allowed:
--   'scratch_requested' -- exhibitor has requested a scratch; awaiting approval
--   'move_up_requested' -- exhibitor has requested a move-up; awaiting approval
--   'moved'             -- entry was moved to a different class (source entry)
--
-- Written/read by scratchQueries.ts and moveUpQueries.ts. Every INSERT/UPDATE
-- with these values was failing the CHECK and every SELECT filter on them was
-- silently returning zero rows.
--
-- No data backfill is needed: the CHECK constraint has rejected unknown values
-- since migration 003, so no existing rows can hold any of the invalid values
-- the buggy code was attempting to write.
-- ---------------------------------------------------------------------------

BEGIN;

ALTER TABLE entries DROP CONSTRAINT IF EXISTS entries_entry_status_check;

ALTER TABLE entries ADD CONSTRAINT entries_entry_status_check CHECK (entry_status IN (
  -- Core lifecycle
  'no-status', 'draft', 'submitted', 'paid', 'confirmed',
  -- Day-of / ring states
  'checked-in', 'at-gate', 'in-ring', 'competing', 'completed',
  -- Terminal / removal states
  'withdrawn', 'scratched', 'absent', 'moved',
  -- Waitlist promotion flow (restored from migration 114, dropped in 116)
  'pending-payment', 'promotion-expired',
  -- Secretary-approval workflow states
  'scratch_requested', 'move_up_requested'
));

COMMIT;
