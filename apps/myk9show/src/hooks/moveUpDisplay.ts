/**
 * Move-up display resolution for the exhibitor's "My Entries" view.
 *
 * A move-up leaves two rows in the database for the same dog: the source row
 * (`entry_status='moved'`, untouched in its original class) and a freshly
 * INSERTed destination row (`entry_status='confirmed'`) in the target class.
 * Written by the Show Map mutation
 * `features/show-map/showMapActionMutations.ts:moveUpShowMapEntry`.
 *
 * Rendering both rows shows the exhibitor a phantom duplicate: the source row
 * will never run in its class, yet the un-filtered feeder labels it "Upcoming".
 * The secretary's Show Map already resolves the dog to its destination class
 * (the capacity guard counts only `confirmed`/`checked-in`), so to keep the two
 * roles in agreement the exhibitor view must do the same.
 *
 * This module is the pure join. It consumes the minimal entry shape and returns:
 *  - `suppressedEntryIds` — dead `moved` source rows to hide from the run schedule.
 *  - `movedUpFromClassIdByEntryId` — destination entryId → the *source* class id,
 *    so the hook can resolve a human "Moved up from <class>" annotation.
 *
 * Suppression is presence-based, not linkage-based. A `moved` row is always a
 * dead source — a move-up always creates a successor entry (and rolls back to
 * `confirmed` on insert failure), so the dog never runs in a `moved` row's class.
 * We therefore suppress every `moved` row for a dog as long as the dog still has
 * at least one non-`moved` entry. This is what makes chained move-ups correct:
 * Novice → Advanced → Excellent overwrites the intermediate row's note with
 * "Moved up to …" (see the Show Map mutation), destroying the
 * back-pointer, so a linkage-only rule would leak the Novice row back. The only
 * case we keep a `moved` row is the pathological all-failed chain (every one of a
 * dog's entries is `moved`), where hiding them would make the dog vanish entirely.
 *
 * The annotation is the only consumer of the free-text linkage: the `confirmed`
 * destination's note `"Moved up from class <sourceClassId>[: reason]"` (written by
 * `buildMovedUpFromNote`). A parse miss degrades gracefully to no label.
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
  /** Dead `moved` source rows to hide (the dog has a surviving non-`moved` entry). */
  suppressedEntryIds: Set<string>;
  /** Destination entryId → source class id (for a "Moved up from <class>" label). */
  movedUpFromClassIdByEntryId: Map<string, string>;
}

/**
 * Parses the source class id out of a destination's `special_requests` note.
 * Matches the format written by `buildMovedUpFromNote`:
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

export function resolveMoveUpDisplay(entries: readonly MoveUpLinkInput[]): MoveUpResolution {
  const suppressedEntryIds = new Set<string>();
  const movedUpFromClassIdByEntryId = new Map<string, string>();

  // First pass: record which dogs still have a surviving (non-`moved`) entry, and
  // index each destination's origin class for the annotation. These are
  // independent — suppression is presence-based; the parse feeds the label only.
  const dogHasLiveEntry = new Set<string>();
  for (const entry of entries) {
    if (entry.status !== 'moved') dogHasLiveEntry.add(entry.dogId);
    const sourceClassId = parseMovedUpFromClassId(entry.specialRequests);
    if (sourceClassId) movedUpFromClassIdByEntryId.set(entry.id, sourceClassId);
  }

  // Second pass: a `moved` row is a dead source. Suppress it as long as the dog
  // has a surviving entry; keep it only when every one of the dog's entries is
  // `moved`, so a pathological all-failed chain doesn't hide the dog entirely.
  for (const entry of entries) {
    if (entry.status === 'moved' && dogHasLiveEntry.has(entry.dogId)) {
      suppressedEntryIds.add(entry.id);
    }
  }

  return { suppressedEntryIds, movedUpFromClassIdByEntryId };
}
