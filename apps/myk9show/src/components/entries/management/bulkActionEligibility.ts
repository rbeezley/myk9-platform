import { EntryStatus } from '@/types/show-registration-types';
import type { EntryManagementEntry } from '@/types/entry-management-types';

/**
 * Bulk actions offered on the Entry Management table multi-select bar.
 * Withdraw/refund is intentionally NOT here — it stays per-entry (Lane 2.2 scope).
 */
export type BulkEntryAction = 'approve' | 'waitlist' | 'reject' | 'check-in';

/**
 * Statuses that are terminal or belong to a separate queue. A bulk status change
 * must never touch these — re-approving a `completed` (scored) entry or a
 * `move-up-requested` entry would corrupt closed records / the move-up queue.
 */
const CLOSED_STATUSES: ReadonlySet<EntryStatus> = new Set([
  EntryStatus.COMPLETED,
  EntryStatus.SCRATCHED,
  EntryStatus.MOVED,
  EntryStatus.CANCELLED,
  EntryStatus.MOVE_UP_REQUESTED,
]);

/** The entry status a status-changing action sets. `check-in` is not a status change. */
export function statusTargetForAction(action: BulkEntryAction): EntryStatus | null {
  switch (action) {
    case 'approve':
      return EntryStatus.ACCEPTED;
    case 'waitlist':
      return EntryStatus.WAITLIST;
    case 'reject':
      return EntryStatus.REJECTED;
    case 'check-in':
      return null;
  }
}

/**
 * Narrow a selection to the entries a given bulk action can validly affect.
 *
 * - Status changes (approve/waitlist/reject): exclude closed/terminal statuses and
 *   entries already at the target status (no-op).
 * - Check-in: only accepted entries that actually have a class to check into.
 */
export function getEligibleForBulkAction(
  entries: EntryManagementEntry[],
  action: BulkEntryAction
): EntryManagementEntry[] {
  if (action === 'check-in') {
    return entries.filter(
      entry => entry.entryStatus === EntryStatus.ACCEPTED && entry.classes.length > 0
    );
  }

  const target = statusTargetForAction(action);
  return entries.filter(
    entry => !CLOSED_STATUSES.has(entry.entryStatus) && entry.entryStatus !== target
  );
}
