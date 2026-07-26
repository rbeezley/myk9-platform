import type { Show } from '@/types/show-types';
import { getEntryStatus } from '@/utils/entryStatusUtils';

export type ShowMarkerStatus = 'open' | 'closing-soon' | 'full' | 'waitlist' | 'closed';

/**
 * Optional live-capacity signal. The browse pipeline doesn't carry entry
 * counts yet, so callers omit this today — 'full'/'waitlist' pins activate
 * when counts are plumbed through, without another marker-logic change.
 */
export interface MarkerCapacityInput {
  totalEntryCount: number;
  maxTotalEntries: number;
  waitlistEnabled?: boolean;
}

/** Show statuses whose entry availability is decided by the entry window. */
const ENTERABLE_STATUSES: ReadonlySet<string> = new Set(['published', 'accepting_entries']);

/**
 * Marker color status for the Find Shows map.
 *
 * Entry availability delegates to getEntryStatus — the same timezone-aware,
 * close-date-inclusive rule the browse cards display — so a pin and its card
 * never disagree. Lifecycle statuses outside the enterable pair (draft,
 * cancelled, completed, ...) always render closed.
 */
export function deriveShowMarkerStatus(
  show: Show,
  capacity?: MarkerCapacityInput
): ShowMarkerStatus {
  if (!ENTERABLE_STATUSES.has(show.status)) return 'closed';

  const entry = getEntryStatus(show);
  if (!entry.canEnter) return 'closed';

  if (capacity && capacity.maxTotalEntries > 0) {
    if (capacity.totalEntryCount >= capacity.maxTotalEntries) {
      return capacity.waitlistEnabled ? 'waitlist' : 'full';
    }
    if (capacity.totalEntryCount / capacity.maxTotalEntries >= 0.9) return 'closing-soon';
  }

  return entry.status === 'closing_soon' ? 'closing-soon' : 'open';
}
