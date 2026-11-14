import { EntryStatus } from '@/types/show-registration-types';
import type { CheckInStatus } from '@/types/check-in-types';
import type { EntryClass } from '@/types/entry-management-types';
import { DESK_STATUS_SET } from './deskStatus';

export const TERMINAL_ENTRY_STATUSES = new Set<EntryStatus>([
  EntryStatus.REJECTED,
  EntryStatus.WAITLIST,
  EntryStatus.CANCELLED,
  EntryStatus.SCRATCHED,
  EntryStatus.COMPLETED,
]);
// MYK9-632: 'withdrawn' is its own class status now. It is as terminal as a
// pull for roster purposes: neither dog is going in the ring.
export const TERMINAL_CLASS_STATUSES = new Set<EntryClass['status']>([
  'scratched',
  'withdrawn',
  'absent',
]);

/**
 * The one rule for where Pull is allowed (MYK9-1990), shared by the desks and the Entries page:
 * the entry is still going in the ring, or is waiting to. Pending and
 * missing-info entries are pulled before the show, so they count; rejected, waitlisted, cancelled,
 * completed, already-pulled and moved entries do not. The desk adds its own conditions on top.
 */
export const PULLABLE_ENTRY_STATUSES = new Set<EntryStatus>([
  EntryStatus.ACCEPTED,
  EntryStatus.PENDING,
  EntryStatus.MISSING_INFO,
]);

/**
 * The one rule for Pull, for the desks, the Entries page and the write: a dog that already has a
 * result is never pulled (owner, 2026-11-14), whatever its status.
 */
export function canPullEntry(entry: {
  entryStatus: EntryStatus | string | null | undefined;
  isScored?: boolean | null | undefined;
}): boolean {
  return !entry.isScored && PULLABLE_ENTRY_STATUSES.has(entry.entryStatus as EntryStatus);
}

/** Where Pull would be offered if the dog had no result: the Entries page explains instead. */
export function isPullBlockedByResult(entry: {
  entryStatus: EntryStatus | string | null | undefined;
  isScored?: boolean | null | undefined;
}): boolean {
  return Boolean(entry.isScored) && PULLABLE_ENTRY_STATUSES.has(entry.entryStatus as EntryStatus);
}

/** The plain note shown in place of Pull for a dog that already has a result. */
export function pullBlockedByResultNote(dogName: string, className: string): string {
  return `${dogName} already has a result in ${className}, so it can't be pulled. To change what happened, edit the result on Results.`;
}

/**
 * Whether the Check-in desk may set this class to one of `DESK_CHECK_IN_STATUSES` (MYK9-1736), on
 * any show day: accepted and active, not underway or closed, not scored. A scored run keeps its
 * check-in status (ringside scoring never writes it), so the score is what says it is finished.
 * `is_scored`, not `result_status`: that is 'pending' on every unscored entry. The one rule behind
 * the desk's status picker and the Show Desk class table's Check-in cell.
 */
export function deskStatusEditableFor(row: {
  entryStatus: EntryStatus;
  classStatus: EntryClass['status'];
  checkInStatus: CheckInStatus;
  isScored: boolean | null | undefined;
}): boolean {
  return (
    DESK_STATUS_SET.has(row.checkInStatus) &&
    canPullEntry(row) &&
    row.entryStatus === EntryStatus.ACCEPTED &&
    !TERMINAL_ENTRY_STATUSES.has(row.entryStatus) &&
    !TERMINAL_CLASS_STATUSES.has(row.classStatus)
  );
}
