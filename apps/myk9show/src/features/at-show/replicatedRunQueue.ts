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

/** A replicated row plus the normalized fields the run queue sorts on. */
export interface ReplicatedQueueEntry extends RunQueueEntry {
  entry: ReplicatedEntry;
}

function parseArmband(entry: ReplicatedEntry): number {
  const raw = entry.armband ?? entry.armbandNumber;
  const parsed = Number.parseInt(raw ?? '', 10);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function toRunQueueEntry(entry: ReplicatedEntry): ReplicatedQueueEntry {
  return {
    id: entry.id,
    armband: parseArmband(entry),
    // Replicated rows carry run order under `runOrder`; ringside sorts on
    // `exhibitorOrder`, so map it across rather than adding a second sort key.
    exhibitorOrder: entry.runOrder ?? null,
    isScored: entry.isScored ?? entry.is_scored ?? false,
    status: entry.status ?? entry.entryStatus,
    inRing: entry.isInRing ?? entry.is_in_ring ?? false,
    entry,
  };
}

/** Every replicated entry still waiting to run, in run order. */
export function pendingReplicatedByRunOrder(entries: ReplicatedEntry[]): ReplicatedEntry[] {
  return pendingByRunOrder(entries.map(toRunQueueEntry)).map(row => row.entry);
}

/** The next `limit` replicated entries due to run, in run order. */
export function nextPendingReplicated(entries: ReplicatedEntry[], limit: number): ReplicatedEntry[] {
  return nextPendingCandidates(entries.map(toRunQueueEntry), limit).map(row => row.entry);
}

/** The replicated entry currently in the ring, or null. */
export function inRingReplicated(entries: ReplicatedEntry[]): ReplicatedEntry | null {
  return findInRingEntry(entries.map(toRunQueueEntry))?.entry ?? null;
}
