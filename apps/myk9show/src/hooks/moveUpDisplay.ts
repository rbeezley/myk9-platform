/**
 * Move-up display resolution for the exhibitor's "My Entries" view.
 *
 * A move-up leaves two rows in the database for the same dog: the source row
 * (`entry_status='moved'`, untouched in its original class) and a freshly
 * INSERTed destination row (`entry_status='confirmed'`) in the target class.
 * See `services/database/day-of-operations/move-up.ts:processMoveUp` and the
 * Show Map mutation in `features/show-map/showMapActionMutations.ts`.
 *
 * Rendering both rows shows the exhibitor a phantom duplicate: the source row
 * will never run in its class, yet the un-filtered feeder labels it "Upcoming".
 * The secretary's Show Map already resolves the dog to its destination class
 * (the capacity guard counts only `confirmed`/`checked-in`), so to keep the two
 * roles in agreement the exhibitor view must do the same.
 *
 * This module is the pure join. It consumes the minimal entry shape and returns:
 *  - `suppressedEntryIds` — `moved` source rows whose destination is present and
 *    should therefore be hidden from the run schedule.
 *  - `movedUpFromClassIdByEntryId` — destination entryId → the *source* class id,
 *    so the hook can resolve a human "Moved up from <class>" annotation.
 *
 * The linkage is the free-text `specialRequests` note `processMoveUp` writes on
 * the destination: `"Moved up from class <sourceClassId>[: reason]"`. We pair a
 * destination to its source by `dogId` + that source class id, which is
 * dog-scoped and 1:1 even when a dog moves up more than once.
 */

import type { EntryStatus } from '@/types/entry-lifecycle';

/** Minimal entry shape needed to resolve move-up source/destination pairs. */
export interface MoveUpLinkInput {
  id: string;
  dogId: string;
  classId: string;
  /** DB `entry_status` (store `status`). Typed so `'moved'` is checked, not guessed. */
  status: EntryStatus;
  /** DB `special_requests` (store `registrationData.specialRequests`). */
  specialRequests?: string | undefined;
}

export interface MoveUpResolution {
  /** `moved` source rows to hide because their destination is present. */
  suppressedEntryIds: Set<string>;
  /** Destination entryId → source class id (for a "Moved up from <class>" label). */
  movedUpFromClassIdByEntryId: Map<string, string>;
}

/**
 * Parses the source class id out of a destination's `special_requests` note.
 * Matches the format written by `processMoveUp`:
 *   `Moved up from class <classId>` (optionally followed by `: <reason>`).
 * Class ids carry no spaces or colons, so the capture stops at the first of
 * either, leaving any trailing reason out.
 */
export const MOVED_UP_FROM_PATTERN = /Moved up from class ([^\s:]+)/;

export function parseMovedUpFromClassId(specialRequests: string | undefined): string | null {
  if (!specialRequests) return null;
  const match = MOVED_UP_FROM_PATTERN.exec(specialRequests);
  return match?.[1] ?? null;
}

const linkKey = (dogId: string, classId: string) => `${dogId}::${classId}`;

export function resolveMoveUpDisplay(entries: readonly MoveUpLinkInput[]): MoveUpResolution {
  const suppressedEntryIds = new Set<string>();
  const movedUpFromClassIdByEntryId = new Map<string, string>();

  // First pass: index destinations by (dogId, sourceClassId) and record each
  // destination's origin class for annotation.
  const destinationKeys = new Set<string>();
  for (const entry of entries) {
    const sourceClassId = parseMovedUpFromClassId(entry.specialRequests);
    if (!sourceClassId) continue;
    movedUpFromClassIdByEntryId.set(entry.id, sourceClassId);
    destinationKeys.add(linkKey(entry.dogId, sourceClassId));
  }

  // Second pass: suppress a `moved` source row only when its destination is
  // present (guards against hiding a row whose move-up half-failed).
  for (const entry of entries) {
    if (entry.status !== 'moved') continue;
    if (destinationKeys.has(linkKey(entry.dogId, entry.classId))) {
      suppressedEntryIds.add(entry.id);
    }
  }

  return { suppressedEntryIds, movedUpFromClassIdByEntryId };
}
