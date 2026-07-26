export type ShowMarkerStatus = 'open' | 'closing-soon' | 'full' | 'waitlist' | 'closed';

export interface MarkerStatusInput {
  /** DB show status (draft | published | accepting_entries | closed | in_progress | completed | cancelled) */
  status: string;
  /** Entry close date/datetime string; absent = no deadline signal */
  entryCloseDate?: string | null;
  /** Live entry count for the show; absent = capacity signal unavailable */
  totalEntryCount?: number | null;
  maxTotalEntries?: number | null;
  waitlistEnabled?: boolean;
}

// Same 7-day "closing soon" rule as getEntryStatus in utils/entryStatusUtils.ts
// (kept separate: that helper is timezone-aware per trial; markers use UTC ms).
const CLOSING_SOON_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const CLOSING_SOON_CAPACITY_RATIO = 0.9;

/**
 * Marker color status for the Find Shows map, derived from the same
 * status/deadline/capacity data the browse cards display.
 *
 * Only `accepting_entries` counts as enterable — every other status renders
 * closed. "Closing soon" = enterable AND (entry close within 7 days OR >= 90%
 * of capacity filled). Missing count or deadline data degrades toward 'open'
 * rather than guessing.
 */
export function deriveShowMarkerStatus(input: MarkerStatusInput, now: Date): ShowMarkerStatus {
  if (input.status !== 'accepting_entries') return 'closed';

  const closeTime = input.entryCloseDate ? Date.parse(input.entryCloseDate) : NaN;
  if (Number.isFinite(closeTime) && closeTime <= now.getTime()) return 'closed';

  const hasCapacityData =
    input.totalEntryCount != null && input.maxTotalEntries != null && input.maxTotalEntries > 0;

  if (hasCapacityData && input.totalEntryCount! >= input.maxTotalEntries!) {
    return input.waitlistEnabled ? 'waitlist' : 'full';
  }

  const closingByDate =
    Number.isFinite(closeTime) && closeTime - now.getTime() <= CLOSING_SOON_WINDOW_MS;
  const closingByCapacity =
    hasCapacityData &&
    input.totalEntryCount! / input.maxTotalEntries! >= CLOSING_SOON_CAPACITY_RATIO;

  return closingByDate || closingByCapacity ? 'closing-soon' : 'open';
}
