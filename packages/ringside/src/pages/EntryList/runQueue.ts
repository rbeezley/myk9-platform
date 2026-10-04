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
 * Numeric key for ORDERING only: an entry with no armband sorts ahead of
 * numbered ones. Never a display value or an identity -- render with
 * `formatArmband`, and compare entries by `id`. (Lives here, not in
 * utils/armband, because this module must stay free of runtime imports.)
 */
export function armbandSortKey(armband: number | null | undefined): number {
  return armband ?? 0;
}

/**
 * The minimum an entry must expose to be placed in a class run queue.
 *
 * Optionals are explicitly `| undefined` so hosts compiled with
 * `exactOptionalPropertyTypes` (myK9Show is) can assign a normalized object
 * literal without widening every field at the call site.
 */
export interface RunQueueEntry {
  id: string;
  armband: number | null;
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
  return (
    (a.exhibitorOrder || armbandSortKey(a.armband)) -
    (b.exhibitorOrder || armbandSortKey(b.armband))
  );
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

/**
 * Where one entry stands in its class, for display (MYK9-992).
 *
 * The stored `run_order` is internal -- a sort key that starts above 1 and has
 * gaps once dogs finish or a class is re-placed -- so no surface may render it.
 * What a person wants is the place in line, which is derived here from the one
 * queue rule above and never stored. `pulled` wins over `done` (a dog scratched
 * after a score stays scratched), and the in-ring dog is outside the waiting
 * queue (INTENT above), so it reports its state, not a place.
 */
export type RunQueueState =
  | { kind: 'waiting'; place: number }
  /**
   * Waiting, but the rows available cannot say where in line. An exhibitor's
   * own rows are the whole picture only for their own dogs, so counting the
   * dogs ahead from them would promise "Next up" with strangers in front.
   * `runQueueStateOf` never returns this; callers holding a partial queue do.
   */
  | { kind: 'waiting-unknown' }
  | { kind: 'in-ring' }
  | { kind: 'done' }
  | { kind: 'pulled' };

/**
 * The entry's state in `entries` (one class's rows), or null when the entry is
 * not among them. `place` is 1-based over `pendingByRunOrder`.
 */
export function runQueueStateOf(
  entries: readonly RunQueueEntry[],
  entryId: string
): RunQueueState | null {
  const target = entries.find(entry => entry.id === entryId);
  if (!target) return null;
  if (target.status === 'pulled') return { kind: 'pulled' };
  if (target.isScored) return { kind: 'done' };
  if (isInRingEntry(target)) return { kind: 'in-ring' };
  const index = pendingByRunOrder(entries).findIndex(entry => entry.id === entryId);
  return index === -1 ? null : { kind: 'waiting', place: index + 1 };
}

/** 1-based place in line, or null for a dog that is finished, in the ring, pulled or unknown. */
export function placeInLine(entries: readonly RunQueueEntry[], entryId: string): number | null {
  const state = runQueueStateOf(entries, entryId);
  return state?.kind === 'waiting' ? state.place : null;
}

/** "Next up", "2nd up", "3rd up", "11th up", "21st up". */
export function formatPlaceInLine(place: number): string {
  if (place <= 1) return 'Next up';
  const lastTwo = place % 100;
  const last = place % 10;
  const suffix =
    lastTwo >= 11 && lastTwo <= 13
      ? 'th'
      : last === 1
        ? 'st'
        : last === 2
          ? 'nd'
          : last === 3
            ? 'rd'
            : 'th';
  return `${place}${suffix} up`;
}

/** The label for any state: a place for a waiting dog, otherwise the state itself. */
export function formatRunQueueState(state: RunQueueState): string {
  switch (state.kind) {
    case 'waiting':
      return formatPlaceInLine(state.place);
    case 'waiting-unknown':
      return 'Waiting';
    case 'in-ring':
      return 'In ring';
    case 'done':
      return 'Done';
    case 'pulled':
      return 'Pulled';
  }
}
