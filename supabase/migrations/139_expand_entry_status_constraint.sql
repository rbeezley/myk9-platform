-- ---------------------------------------------------------------------------
-- Migration 139: Expand entry_status CHECK constraint
-- ---------------------------------------------------------------------------
-- Migration 116 accidentally dropped 'pending-payment' and 'promotion-expired'
-- (added in migration 114 for the waitlist promotion flow) when it rewrote the
-- constraint for myK9Q compatibility.
--
-- Additionally, the app code uses three workflow-transition values that were
-- never added to the constraint:
--   'scratch_requested' -- exhibitor has requested a scratch; awaiting approval
--   'move_up_requested' -- exhibitor has requested a move-up; awaiting approval
--   'moved'             -- entry was moved to a different class (source entry)
--
-- These three values are written/read by scratchQueries.ts and moveUpQueries.ts.
-- Without them in the constraint, every INSERT/UPDATE with these values fails
-- the CHECK and every SELECT filter on them silently returns zero rows.
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
