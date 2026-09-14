/**
 * Class-availability derivation for the registration wizard's class step.
 *
 * Extracted from ClassSelectionStep so the step file stays under the 500-line
 * ceiling, and so the "did we actually read this?" question has one testable
 * home rather than living inline next to the render.
 */

import { CLASS_STATUS, normalizeClassStatus } from '@myk9/core';

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
  rowCount: number;
}): boolean {
  const { isLoading, rowCount } = params;
  if (isLoading) return false;
  // Deliberately NOT `|| !!error`. A failed refetch that retained earlier rows
  // still renders real Full and Wait list badges, so the notice's "none are
  // marked full or wait list below" would be a false statement. Unreadable
  // means we have nothing to show, whatever the reason.
  return rowCount === 0;
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
 * Whether a class can still be entered given its own lifecycle status.
 *
 * MYK9-516. Entry close is enforced by DATE (`entry_close_date`, a timestamptz
 * the server compares in the show's timezone). A class's status is a different
 * axis entirely: on show day the judge starts running a class and its status
 * moves to `in_progress`, then `completed`, while the date guard is still wide
 * open — a secretary who left entries open through the weekend, or any show
 * whose close date has not yet passed. The wizard did not read status at all,
 * so a running class rendered as an ordinary selectable chip and Payment
 * committed the entry. That is a refund and a phone call, not a cosmetic bug.
 *
 * `status` is free text constrained by `classes_status_check`
 * ('upcoming' | 'setup' | 'in_progress' | 'completed' | 'cancelled'), but the
 * canonical vocabulary in `@myk9/core` spells the same states 'In Progress' /
 * 'Completed', and three different sources feed this step (replication, the
 * classes query, the availability read) with different spellings. So the
 * lookup goes through `normalizeClassStatus`, which is the one shared map and
 * already falls back to 'Scheduled' for anything it does not recognise rather
 * than indexing undefined — the guard memory `project_status_map_lookup_crash_class`
 * asks for.
 *
 * Falling back to ENTERABLE for an unknown or absent status is deliberate: this
 * is the client half of a pair. The server rejects a started class on its own
 * (`submit_show_entries`, migration 20260914184500), so a status we cannot read
 * — offline, or a source that never carried the column — costs a clear message,
 * never a committed entry into a running ring.
 *
 * Staff are exempt. A secretary taking a day-of entry at the gate for a class
 * already in the ring is the normal late-entry case; blocking them would make
 * the wizard useless at the desk. The server applies the same carve-out through
 * its existing `v_is_official` predicate.
 */
export interface ClassEntryWindow {
  enterable: boolean;
  /** One short sentence for the chip. Null when the class is enterable. */
  reason: string | null;
}

const ENTERABLE: ClassEntryWindow = { enterable: true, reason: null };

export function getClassEntryWindow(params: {
  status: string | null | undefined;
  isStaff: boolean;
}): ClassEntryWindow {
  const { status, isStaff } = params;
  if (isStaff) return ENTERABLE;
  if (!status) return ENTERABLE;

  const normalized = normalizeClassStatus(status);
  if (normalized === CLASS_STATUS.IN_PROGRESS) {
    return { enterable: false, reason: 'This class has started' };
  }
  if (normalized === CLASS_STATUS.COMPLETED) {
    return { enterable: false, reason: 'This class has finished' };
  }
  return ENTERABLE;
}
