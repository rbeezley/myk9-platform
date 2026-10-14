import type { EnrichedShowEntry } from '@/hooks/useShowEntriesForUser';
import { getEntryStatusKind } from '@/services/entryDisplay/entryDisplaySelectors';
import { mapEntryStatus } from '@/services/entryDisplay/entryStatusUiAdapter';
import { isClassCheckInEligibleAnyDay } from '@/pages/MyEntriesPage/modules/dayCheckIn';
import type { MyShowClass } from '@/pages/MyEntriesPage/modules/groupEntriesByShow';
import type { MyEntry } from '@/pages/MyEntriesPage/modules/my-entries-types';

/**
 * MYK9-1173: would My Shows offer check-in for this schedule row on SOME day?
 * Runs the one shared predicate (`isClassCheckInEligibleAnyDay`: entry accepted,
 * class entered, not unresolved, self check-in open) over the fields this tab
 * holds, so a future row promises "Check in on the day" exactly where My Shows
 * does. The schedule has no unresolved placeholder rows, so that flag is false.
 */
export function isScheduleRowCheckInEligible(
  entry: EnrichedShowEntry,
  selfCheckinByClassId: Record<string, boolean>
): boolean {
  const entryStatus = mapEntryStatus(entry.entryStatus);
  const order = { isShowCancelled: false, entryStatus, dogs: [] } as unknown as MyEntry;
  const cls = {
    id: entry.entryId,
    orderId: 'schedule',
    classId: entry.classId,
    status: 'entered',
    entryStatus,
    entryStatusKind: getEntryStatusKind(entry.entryStatus),
    checkInStatus: entry.checkInStatus,
    isScored: entry.hasResult,
    unresolved: false,
  } as unknown as MyShowClass;
  return isClassCheckInEligibleAnyDay(cls, {
    now: new Date(),
    ordersById: { schedule: order },
    selfCheckinByClassId,
    isPastShow: false,
  });
}
