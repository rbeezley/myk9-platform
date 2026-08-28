import { EntryStatus } from '@/types/show-registration-types';
import type { EntryManagementEntry } from '@/types/entry-management-types';

/**
 * Bulk actions offered on the Entry Management table multi-select bar.
 *
 * Withdraw/refund is intentionally NOT here — it stays per-entry (refund nuance).
 * Waitlist is intentionally NOT here either: real waitlisting goes through the
 * dedicated `waitlist_entries` workflow (useWaitListMutations / WaitlistManagementPage),
 * not an `entry_status` change — a status write to 'waitlist' round-trips to PENDING
 * and never creates waitlist membership. Bulk waitlist is a follow-up.
 */
export type BulkEntryAction = 'approve' | 'reject' | 'check-in';

/**
 * Statuses that are terminal or belong to a separate queue. A bulk status change
 * must never touch these — re-approving a `completed` (scored) entry or a
 * `move-up-requested` entry would corrupt closed records / the move-up queue.
 */
export const CLOSED_STATUSES: ReadonlySet<EntryStatus> = new Set([
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
  return getEligibleForBulkStatusChange(entries, target);
}

/**
 * The same eligibility rule as `getEligibleForBulkAction`, keyed on the TARGET
 * STATUS rather than on a named action, so it also covers status changes that
 * are not `BulkEntryAction`s (the registration Actions menu offers
 * `MISSING_INFO`, for example).
 *
 * `getEligibleForBulkAction` is expressed in terms of this function so both
 * paths share one rule. Every bulk status change must be narrowed through it;
 * `useEntryManagementActions.handleEnrollmentBulkStatusChange` applies it to
 * whatever ids it is handed, so a caller that forgets cannot corrupt a scored
 * or moved-up entry — which is exactly what the registration Actions menu did
 * by passing `group.entries.map(e => e.id)` unfiltered.
 *
 * A `null` target means the action is not a status change at all, in which case
 * this rule does not apply and every entry is returned.
 */
export function getEligibleForBulkStatusChange(
  entries: EntryManagementEntry[],
  target: EntryStatus | null
): EntryManagementEntry[] {
  if (target === null) return entries;
  return entries.filter(
    entry => !CLOSED_STATUSES.has(entry.entryStatus) && entry.entryStatus !== target
  );
}
