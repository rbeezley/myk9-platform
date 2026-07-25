/**
 * runQueue — the single source of truth for "who is in the ring, who runs next,
 * and in what order" within one class.
 *
 * INTENT (user decision 2026-06-11, inherited from dogsAheadInList): the in-ring
 * dog is NOT part of the waiting queue. `pendingByRunOrder` therefore excludes
 * it, which is why "You're next" shows while a dog is still running — that is
 * how exhibitors think about the queue ("I'm next after this one"). The
 * app-side helpers that once counted *from* the in-ring dog
 * (utils/conflictDetection.ts, hooks/useNotificationMonitor.ts) now normalize
 * through utils/showEntryRunQueue.ts onto this rule, so a push notification can
 * never state a different number than the screen.
 *
 * Typed structurally rather than on ringside's `Entry` so at-show callers can
 * pass replicated rows (which carry breed/call name the scoresheet chips need)
 * and get their own row type back — see `toRunQueueEntry` app-side for the
 * ReplicatedEntry normalizer.
 */

/**
 * The minimum an entry must expose to be placed in a class run queue.
 *
 * Optionals are explicitly `| undefined` so hosts compiled with
 * `exactOptionalPropertyTypes` (myK9Show is) can assign a normalized object
 * literal without widening every field at the call site.
 */
export interface RunQueueEntry {
  id: string;
  armband: number;
  exhibitorOrder?: number | null | undefined;
  isScored?: boolean | undefined;
  status?: string | undefined;
  /** @deprecated Use status === 'in-ring'; the data adapter still sets this. */
  inRing?: boolean | undefined;
}

export function isInRingEntry(entry: RunQueueEntry): boolean {
  return entry.inRing === true || entry.status === 'in-ring';
}

/** Entries still due to run: unscored and not pulled from the class. */
export function isInQueue(entry: RunQueueEntry): boolean {
  return !entry.isScored && entry.status !== 'pulled';
}

/** Run-order comparator (mirrors the `run` sort: exhibitorOrder, armband fallback). */
export function compareByRunOrder(a: RunQueueEntry, b: RunQueueEntry): number {
  return (a.exhibitorOrder || a.armband) - (b.exhibitorOrder || b.armband);
}

/** The dog currently in the ring, or null. First match wins. */
export function findInRingEntry<T extends RunQueueEntry>(entries: readonly T[]): T | null {
  return entries.find(isInRingEntry) ?? null;
}

/**
 * Every entry still waiting to run, in run order — in-ring, scored, and pulled
 * dogs excluded. Does not mutate the input array.
 */
export function pendingByRunOrder<T extends RunQueueEntry>(entries: readonly T[]): T[] {
  return entries.filter(entry => isInQueue(entry) && !isInRingEntry(entry)).sort(compareByRunOrder);
}

/**
 * The next `limit` dogs due to run, in run order. Returns fewer (or none) when
 * the class is nearly done. `limit` <= 0 yields an empty array.
 */
export function nextPendingCandidates<T extends RunQueueEntry>(
  entries: readonly T[],
  limit: number
): T[] {
  if (limit <= 0) return [];
  return pendingByRunOrder(entries).slice(0, limit);
}
