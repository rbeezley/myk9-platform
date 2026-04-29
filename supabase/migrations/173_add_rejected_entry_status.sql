-- Migration 173: Add 'rejected' to entry_status constraint
--
-- Previously REJECTED mapped to 'withdrawn' (same as exhibitor-cancelled),
-- causing the UI to display "Cancelled" after a secretary rejects an entry.
-- 'rejected' is now a distinct value for secretary-rejected entries.

BEGIN;

ALTER TABLE entries DROP CONSTRAINT IF EXISTS entries_entry_status_check;

ALTER TABLE entries ADD CONSTRAINT entries_entry_status_check CHECK (entry_status IN (
  -- Core lifecycle
  'no-status', 'draft', 'submitted', 'paid', 'confirmed',
  -- Day-of / ring states
  'checked-in', 'at-gate', 'in-ring', 'competing', 'completed',
  -- Terminal / removal states
  'withdrawn', 'scratched', 'absent', 'moved', 'rejected',
  -- Waitlist promotion flow
  'pending-payment', 'promotion-expired',
  -- Secretary-approval workflow states
  'scratch_requested', 'move_up_requested'
));

-- Backfill: any existing 'withdrawn' rows that came from the REJECTED UI path
-- cannot be distinguished from true cancellations, so leave them as-is.

COMMIT;
