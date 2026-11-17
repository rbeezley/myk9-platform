import { formatSecondsAsMSSCC } from '@/lib/format/searchTime';

/** result_status values whose time and faults mean something: the dog was actually worked. */
const RAN_RESULT_STATUSES = ['qualified', 'nq', 'non_qualifying'] as const;

/** True when the stored result is one of a run that was worked (Q or NQ). */
export function isRanResultStatus(resultStatus: string | null | undefined): boolean {
  const status = resultStatus?.trim().toLowerCase();
  return RAN_RESULT_STATUSES.some(ran => ran === status);
}

/** "0 faults", "1 fault", "2 faults": how the run sheet and Show Desk word a fault count. */
export function formatRunFaults(faults: number): string {
  return `${faults} ${faults === 1 ? 'fault' : 'faults'}`;
}

/** The stored placement, or null when none is held (server-calculated, never computed here). */
export function storedPlacement(placement: number | null | undefined): number | null {
  return placement != null && placement > 0 ? placement : null;
}

/** A stored run time in seconds as "M:SS.HH", or '' when the entry has none. */
export function formatStoredRunTime(seconds: number | null | undefined): string {
  return seconds != null ? formatSecondsAsMSSCC(seconds) : '';
}
