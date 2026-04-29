-- Migration 174: Add 'not_accepted' entry status; replace 'rejected'
--
-- 'rejected' was added in migration 173 but we're aligning on 'not_accepted'
-- as the user-facing term (softer, consistent with AKC terminology).
-- Backfill any 'rejected' rows written since migration 173.

BEGIN;

ALTER TABLE entries DROP CONSTRAINT IF EXISTS entries_entry_status_check;

ALTER TABLE entries ADD CONSTRAINT entries_entry_status_check CHECK (entry_status IN (
  -- Core lifecycle
  'no-status', 'draft', 'submitted', 'paid', 'confirmed',
  -- Day-of / ring states
  'checked-in', 'at-gate', 'in-ring', 'competing', 'completed',
  -- Terminal / removal states
  'withdrawn', 'scratched', 'absent', 'moved', 'not_accepted',
  -- Waitlist promotion flow
  'pending-payment', 'promotion-expired',
  -- Secretary-approval workflow states
  'scratch_requested', 'move_up_requested'
));

-- Backfill: 'rejected' (added in migration 173) → 'not_accepted'
UPDATE entries SET entry_status = 'not_accepted' WHERE entry_status = 'rejected';

COMMIT;
