-- Fix entries.entry_status CHECK constraint — restore hyphen forms
--
-- Migrations 173 and 174 rewrote the constraint using underscore spellings
-- ('scratch_requested', 'move_up_requested').  The app has written hyphen
-- spellings ('scratch-requested', 'move-up-requested') since migration 142,
-- which explicitly normalised all stored values to hyphens.  Any app write of
-- 'scratch-requested' after migration 173 hits a CHECK violation.
--
-- Fix: include both forms so existing rows and current app writes both pass.

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
  -- Secretary-approval workflow states (hyphen = what the app writes per mig 142;
  -- underscore retained for any rows written between migrations 173–174)
  'scratch-requested', 'scratch_requested',
  'move-up-requested',  'move_up_requested'
));

COMMIT;
