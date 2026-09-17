/**
 * replicatedRunQueue — adapts offline-first `ReplicatedEntry` rows onto the
 * shared run-queue primitive in @myk9/ringside.
 *
 * Why this exists: replicated rows carry the same facts under several names
 * (`isScored`/`is_scored`, `isInRing`/`is_in_ring`, `status`/`entryStatus`),
 * store the armband as a *string*, and order by `runOrder` rather than the
 * ringside `exhibitorOrder`. Normalizing in one place keeps every at-show
 * consumer — class-row next-up preview, scoresheet quick-advance chips,
 * favorite-dog push proximity — on one ordering rule instead of three.
 *
 * The row itself is carried through untouched, so callers keep `dogCallName`
 * and `dogBreed` for display.
 */

import {
  findInRingEntry,
  nextPendingCandidates,
  pendingByRunOrder,
  type RunQueueEntry,
} from '@myk9/ringside';
import type { ReplicatedEntry } from '@/services/replication/ReplicatedEntriesTable';
import { isRunnableEntry } from '@/features/_shared/entryAccounting';

/** A replicated row plus the normalized fields the run queue sorts on. */
export interface ReplicatedQueueEntry extends RunQueueEntry {
  entry: ReplicatedEntry;
}

function parseArmband(entry: ReplicatedEntry): number {
  const raw = entry.armband ?? entry.armbandNumber;
  const parsed = Number.parseInt(raw ?? '', 10);
  return Number.isNaN(parsed) ? 0 : parsed;
}

/**
 * The status the run queue actually cares about.
 *
 * Replicated rows carry TWO status axes: `check_in_status` (the show-day flow —
 * this is where `pulled` and `in-ring` live, see CheckInStatus in @myk9/core)
 * and `entry_status` (the registration lifecycle). `isInQueue` / `isInRingEntry`
 * test for `pulled` / `in-ring`, so every state meaning "won't run" is folded
 * onto `pulled` and a single field answers queue membership.
 *
 * MEMBERSHIP IS `isRunnableEntry`, AND NOTHING ELSE DECIDES IT (MYK9-645).
 * The check-in axis is read only AFTER that predicate says yes, because the
 * two orderings are not equivalent: a withdrawn row carrying a stale
 * `check_in_status: 'in-ring'` (`entries.94db1b95` on staging) was announced as
 * the dog in the ring while listed under Not running, and an unscored row with
 * `result_status: 'absent'` was offered as "next up" after the counts had
 * already settled it. An in-ring flag on a row nobody expects to run is stale
 * data, not a ring state.
 *
 * This module holds NO status list of its own; adding one back is how the last
 * three rounds of this bug happened.
 */
function queueStatus(entry: ReplicatedEntry): string | undefined {
  if (!isRunnableEntry(entry)) return 'pulled';

  const checkIn = entry.checkInStatus ?? entry.check_in_status;
  return checkIn ?? entry.status ?? entry.entryStatus;
}

export function toRunQueueEntry(entry: ReplicatedEntry): ReplicatedQueueEntry {
  return {
    id: entry.id,
    armband: parseArmband(entry),
    // Replicated rows carry run order under `runOrder`; ringside sorts on
    // `exhibitorOrder`, so map it across rather than adding a second sort key.
    exhibitorOrder: entry.runOrder ?? null,
    isScored: entry.isScored ?? entry.is_scored ?? false,
    status: queueStatus(entry),
    // A dog sent into the ring on show day may be flagged only by the check-in
    // status, with neither boolean alias set -- but only a RUNNABLE row can be
    // in the ring at all. `isInRingEntry` ORs this flag with the status, so
    // leaving it ungated would re-announce exactly the stale row `queueStatus`
    // just excluded.
    inRing:
      isRunnableEntry(entry) &&
      ((entry.isInRing ?? entry.is_in_ring ?? false) ||
        (entry.checkInStatus ?? entry.check_in_status) === 'in-ring'),
    entry,
  };
}

/** Every replicated entry still waiting to run, in run order. */
export function pendingReplicatedByRunOrder(entries: ReplicatedEntry[]): ReplicatedEntry[] {
  return pendingByRunOrder(entries.map(toRunQueueEntry)).map(row => row.entry);
}

/** The next `limit` replicated entries due to run, in run order. */
export function nextPendingReplicated(
  entries: ReplicatedEntry[],
  limit: number
): ReplicatedEntry[] {
  return nextPendingCandidates(entries.map(toRunQueueEntry), limit).map(row => row.entry);
}

/** The replicated entry currently in the ring, or null. */
export function inRingReplicated(entries: ReplicatedEntry[]): ReplicatedEntry | null {
  return findInRingEntry(entries.map(toRunQueueEntry))?.entry ?? null;
}
