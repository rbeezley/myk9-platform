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

/**
 * The one definition of "exhibitor" for the entry lists: staff are the three roles with ring
 * authority; every other viewer (exhibitor, passcode exhibitor, no role) is held to their own
 * dogs. The viewer kind and the writer below both come from here, so they cannot disagree.
 */
export function viewerForRole(role: string | null | undefined): StatusViewer {
  return role === 'admin' || role === 'judge' || role === 'steward' ? 'staff' : 'exhibitor';
}

/** An exhibitor writes through the ownership-scoped RPC; staff through the replicated writer. */
export function writerForRole(role: string | null | undefined): 'self-checkin-rpc' | 'replicated' {
  return viewerForRole(role) === 'exhibitor' ? 'self-checkin-rpc' : 'replicated';
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
  if (input.notRunning) return input.viewer === 'staff' ? 'reinstate-staff' : 'reinstate';
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

/** Why a not-running row takes no status change, worded for who is looking. */
export const NOT_RUNNING_EXHIBITOR_MESSAGE =
  'The show secretary must reinstate this entry before it can be checked in.';
export const NOT_RUNNING_STAFF_MESSAGE = 'Reinstate this entry in Entry management first.';

/** The message to show when this viewer's write would be refused, or null when it may go. */
export function statusRefusalMessage(input: StatusAccessInput & { status: string }): string | null {
  if (maySetStatus(input)) return null;
  if (input.notRunning) {
    return input.viewer === 'staff' ? NOT_RUNNING_STAFF_MESSAGE : NOT_RUNNING_EXHIBITOR_MESSAGE;
  }
  return SELF_CHECKIN_REFUSED_MESSAGE;
}

/** The exact phrases `self_checkin_entry` raises when it turns a write away. */
const REFUSAL_PHRASES =
  /Not authorized: caller (?:is not linked to a person record|does not own entry)|Status \S+ is not allowed for self-check-in/;

/** Marks a refusal that came from the write itself (never from the refresh after it). */
export class SelfCheckinRefusedError extends Error {
  constructor(cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause));
    this.name = 'SelfCheckinRefusedError';
  }
}

/** The server refused an exhibitor's write (ownership, self check-in off, or a staff-only status). */
export function isSelfCheckinRefusal(error: unknown): boolean {
  if (error instanceof SelfCheckinRefusedError) return true;
  const message =
    error instanceof Error ? error.message : (error as { message?: unknown })?.message;
  return typeof message === 'string' && REFUSAL_PHRASES.test(message);
}
