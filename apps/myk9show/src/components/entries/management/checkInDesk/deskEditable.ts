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
    !row.isScored &&
    row.entryStatus === EntryStatus.ACCEPTED &&
    !TERMINAL_ENTRY_STATUSES.has(row.entryStatus) &&
    !TERMINAL_CLASS_STATUSES.has(row.classStatus)
  );
}
