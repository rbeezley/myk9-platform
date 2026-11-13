/**
 * entryStatusAccess: the one answer to "may this viewer set this status on this entry?" (MYK9-1807).
 *
 * Staff (admin, judge, steward) set any status the picker offers. An exhibitor writes through
 * `self_checkin_entry`, which accepts only their own dog, only while the class allows self
 * check-in, and only the statuses in `SELF_SETTABLE_STATUSES`. The card, the picker, the
 * tap handler and the refused-write message all ask this module, so the four cannot drift.
 */
import { STAFF_CHECK_IN_STATUSES, type CheckInStatus } from '@myk9/core';
import type { EntryStatusControl } from '@myk9/ringside';
import { SELF_RESTORABLE } from './offerPullUndo';

/** Staff may set anything the picker offers; an exhibitor is limited to their own dogs. */
export type StatusViewer = 'staff' | 'exhibitor';

/** Ring management statuses only stewards and judges may set. */
export const RING_MANAGEMENT_STATUSES: readonly CheckInStatus[] = ['in-ring', 'completed'];

/**
 * What `self_checkin_entry` accepts: what Undo can restore, plus Pulled (it records the
 * exhibitor's own decision; Undo cannot restore a staff-set status, but a pull is allowed).
 */
export const SELF_SETTABLE_STATUSES: ReadonlySet<string> = new Set([...SELF_RESTORABLE, 'pulled']);

/** Statuses the picker lists, in the order staff see them. */
export function pickerStatuses(
  viewer: StatusViewer,
  ringManagement: boolean
): readonly CheckInStatus[] {
  if (viewer === 'exhibitor') {
    return STAFF_CHECK_IN_STATUSES.filter(status => SELF_SETTABLE_STATUSES.has(status));
  }
  return ringManagement
    ? [...STAFF_CHECK_IN_STATUSES, ...RING_MANAGEMENT_STATUSES]
    : STAFF_CHECK_IN_STATUSES;
}

interface StatusAccessInput {
  viewer: StatusViewer;
  /** The entry belongs to the signed-in account (handler, owner or co-owner). */
  ownsEntry: boolean;
  /** The entry's class allows self check-in. */
  selfCheckinEnabled: boolean;
  /** Scratched, withdrawn or absent: only the secretary can bring the entry back. */
  notRunning: boolean;
}

/** What the card shows in place of (or as) the status control. */
export function statusControlFor(input: StatusAccessInput): EntryStatusControl {
  if (input.notRunning) return 'reinstate';
  if (input.viewer === 'staff') return 'open';
  if (!input.ownsEntry) return 'none';
  return input.selfCheckinEnabled ? 'open' : 'self-checkin-off';
}

/** True when this viewer's write of `status` would be accepted, so it is worth sending. */
export function maySetStatus(input: StatusAccessInput & { status: string }): boolean {
  if (input.notRunning) return false;
  if (input.viewer === 'staff') return true;
  return input.ownsEntry && input.selfCheckinEnabled && SELF_SETTABLE_STATUSES.has(input.status);
}

/** Plain words for an exhibitor whose change the server turned away. */
export const SELF_CHECKIN_REFUSED_MESSAGE =
  'Check-in was not changed. You can only check in your own dogs, and only while check-in is on for the class. Ask the show secretary.';

/** The server refused an exhibitor's write (ownership, self check-in off, or a staff-only status). */
export function isSelfCheckinRefusal(error: unknown): boolean {
  const message =
    error instanceof Error ? error.message : (error as { message?: unknown })?.message;
  return (
    typeof message === 'string' &&
    /not authorized|not allowed for self-check-in|self check-in is disabled/i.test(message)
  );
}
