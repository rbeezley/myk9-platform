/**
 * Plain-language copy for "Your dogs today" that is derived from data, kept
 * pure so the wording is testable without rendering (MYK9-1046).
 */

export const SAVED_INFO_NOTICE =
  'Showing saved information. Check-in and running order may be out of date.';

/**
 * What `detectMyRingConflicts` actually finds: two or more of MY entries near
 * the front (in the ring, or within the lead-dogs preference of going in) in
 * DIFFERENT in-progress classes. It is not "same time", and it can be one dog
 * in two classes. `label` already describes the OTHER class or classes.
 */
export function formatRingConflictNotice(label: string): string {
  return `Close to going in at more than one ring. Also near the front: ${label}. The ring steward can help.`;
}

/** "updated 12:05 PM" on the trial's clock; the device's own when the zone is unknown. */
export function formatPlaceUpdatedAt(
  updatedAt: number,
  timeZone: string | null | undefined
): string {
  const time = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    ...(timeZone ? { timeZone } : {}),
  }).format(updatedAt);
  // Newer ICU puts a narrow no-break space before AM/PM; keep the label plain.
  return `updated ${time.replace(/\s/g, ' ')}`;
}
