import type { CheckInStatus } from '@myk9/core';
import type { EntryStatus } from '@/types/entry-lifecycle';

/** Targets that put a scratched dog back on the active list (the menu's Accept / Pending). */
const REACTIVATING_STATUSES: ReadonlySet<EntryStatus> = new Set<EntryStatus>([
  'confirmed',
  'submitted',
]);

export interface EntryStatusCheckInContext {
  /** The entry's DB status before this change. */
  previousEntryStatus?: EntryStatus | undefined;
  /** Check-in value to restore on an un-pull (Undo of a Pull); omitted on a plain Accept. */
  priorCheckInStatus?: CheckInStatus | undefined;
  /** MYK9-1396: `entries.check_in_status_before_pull`, the durable prior a Pull stored. Read-only here: the database trigger writes it. */
  storedCheckInStatusBeforePull?: CheckInStatus | null | undefined;
}

/**
 * MYK9-1384: the check-in value a lifecycle status change must write, or
 * `undefined` when it must leave check-in alone.
 *
 * - A Pull always writes `pulled`.
 * - Undo of a Pull restores the caller's captured value, whatever status it returns to.
 * - Otherwise leaving `scratched` for an active status restores the value the
 *   Pull stored (MYK9-1396, survives a reload), and only without one clears
 *   `pulled` with `no-status`, the established "not at the show" value.
 * - Every other transition (a plain confirm of a checked-in dog) writes nothing.
 */
export function resolveCheckInStatusForTransition(
  status: EntryStatus,
  context: EntryStatusCheckInContext = {}
): CheckInStatus | undefined {
  if (status === 'scratched') return 'pulled';
  if (context.previousEntryStatus !== 'scratched') return undefined;
  // Undo of a Pull restores the captured value whatever status it returns to
  // (Pull is offered on withdrawn and not-accepted entries too).
  if (context.priorCheckInStatus !== undefined) return context.priorCheckInStatus;
  if (!REACTIVATING_STATUSES.has(status)) return undefined;
  return context.storedCheckInStatusBeforePull ?? 'no-status';
}
