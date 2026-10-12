/**
 * Plain-language copy for "Your dogs today" that is derived from data, kept
 * pure so the wording is testable without rendering (MYK9-1046).
 */

import { formatTime } from '@/lib/format/dates';

export const SAVED_INFO_NOTICE =
  'Showing saved information. Check-in and running order may be out of date.';

/** `label` names the OTHER class(es) near the front, not "same time"; see `placeRingConflicts`. */
export function formatRingConflictNotice(label: string): string {
  return `Close to going in at more than one ring. Also near the front: ${label}. The ring steward can help.`;
}

/** "updated 12:05 PM" on the trial's clock; the device's own when the zone is unknown. */
export function formatPlaceUpdatedAt(
  updatedAt: number,
  timeZone: string | null | undefined
): string {
  return `updated ${formatTime(new Date(updatedAt), timeZone ?? undefined)}`;
}
