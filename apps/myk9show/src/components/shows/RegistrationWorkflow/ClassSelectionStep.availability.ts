/**
 * Class-availability derivation for the registration wizard's class step.
 *
 * Extracted from ClassSelectionStep so the step file stays under the 500-line
 * ceiling, and so the "did we actually read this?" question has one testable
 * home rather than living inline next to the render.
 */

export interface ClassAvailabilityEntry {
  isFull: boolean;
  waitlistCount: number;
  allowsWaitlist: boolean;
}

interface AvailabilityClassLike {
  classId: string;
  isFull: boolean;
  waitlistCount: number;
  allowsWaitlist: boolean;
}

/**
 * True when availability could not be read at all, as opposed to read and found
 * empty.
 *
 * Availability is a direct server read: it cannot resolve offline, and the app's
 * query client uses `networkMode: 'online'`, so offline the query PAUSES —
 * `isLoading` false, `error` null, no rows. To a bare `cls.isFull &&` check that
 * is indistinguishable from every class having room, which is how the step came
 * to render full classes as selectable with no badge.
 */
export function isAvailabilityUnreadable(params: {
  isLoading: boolean;
  error: unknown;
  rowCount: number;
}): boolean {
  const { isLoading, error, rowCount } = params;
  if (isLoading) return false;
  return !!error || rowCount === 0;
}

/** Index availability rows by class id for O(1) lookup during render. */
export function buildAvailabilityMap(
  classes: readonly AvailabilityClassLike[]
): Map<string, ClassAvailabilityEntry> {
  const map = new Map<string, ClassAvailabilityEntry>();
  for (const cls of classes) {
    map.set(cls.classId, {
      isFull: cls.isFull,
      waitlistCount: cls.waitlistCount,
      allowsWaitlist: cls.allowsWaitlist,
    });
  }
  return map;
}

/**
 * Resolve a trial's registry id against the configured registry list. An
 * unrecognised value is treated as absent rather than passed through, so a
 * stale or free-text registry cannot silently drive prerequisite checks.
 */
export function resolveConfiguredRegistryId(
  rawRegistryId: string | null | undefined,
  configuredIds: readonly string[]
): string | null {
  const trimmed = rawRegistryId?.trim() || null;
  if (!trimmed) return null;
  return configuredIds.some(configuredId => configuredId === trimmed) ? trimmed : null;
}
