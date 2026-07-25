/**
 * showEntryRunQueue — adapts entry-store `ShowEntry` rows onto the shared
 * run-queue primitive in @myk9/ringside.
 *
 * Why this exists: the exhibitor-facing hooks (`useShowEntriesForUser`,
 * `useMyEntriesInClass`), the ring-conflict scanner (`utils/conflictDetection`)
 * and the push monitor (`hooks/useNotificationMonitor`) each used to count
 * "dogs ahead" their own way — three of them from the front of the run order,
 * one of them *from* the in-ring dog. A push notification could therefore state
 * a different number than the screen the exhibitor was looking at.
 *
 * They now all normalize through here, so the ordering rule and the queue
 * semantics come from `runQueue` in the package. See the INTENT note there:
 * the in-ring dog is EXCLUDED from the waiting queue, which is why "You're next"
 * shows while a dog is still running.
 *
 * `ReplicatedEntry` rows have their own normalizer — see
 * `@/features/at-show/replicatedRunQueue`.
 */

import { isInQueue, isInRingEntry, pendingByRunOrder, type RunQueueEntry } from '@myk9/ringside';
import type { ShowEntry } from '@/store/entry-store-types';

/** A `ShowEntry` plus the normalized fields the run queue sorts on. */
export interface ShowEntryQueueRow extends RunQueueEntry {
  entry: ShowEntry;
}

function parseArmband(entry: ShowEntry): number {
  const parsed = Number.parseInt(entry.registrationData?.armband ?? '', 10);
  return Number.isNaN(parsed) ? 0 : parsed;
}

/**
 * Entry-lifecycle states that mean "this dog is not going to run", but which the
 * show-day check-in flow never sets. `entry_status` (migration 003) allows
 * no-status / draft / submitted / paid / confirmed / checked-in / competing /
 * completed / withdrawn / scratched / absent — it contains neither `pulled` nor
 * `in-ring`. `moved` marks the dead source row of a move-up.
 */
const NOT_RUNNING_LIFECYCLE = new Set(['withdrawn', 'scratched', 'absent', 'moved']);

/**
 * The status the run queue actually cares about.
 *
 * `ShowEntry` carries TWO status axes: `checkInStatus` (the show-day flow —
 * this is where `pulled` and `in-ring` live, see `CheckInStatus` in @myk9/core)
 * and `status` (the registration lifecycle). `isInQueue` / `isInRingEntry` test
 * for `pulled` / `in-ring`, so the check-in axis must win; comparing the
 * lifecycle axis against those values silently never matches. Lifecycle states
 * that also mean "won't run" fold onto `pulled` so a single field answers queue
 * membership.
 */
function queueStatus(entry: ShowEntry): string | undefined {
  const checkIn = entry.checkInStatus;
  if (checkIn === 'pulled' || checkIn === 'in-ring') return checkIn;
  if (NOT_RUNNING_LIFECYCLE.has(entry.status)) return 'pulled';
  return checkIn ?? entry.status;
}

export function toShowEntryQueueRow(entry: ShowEntry): ShowEntryQueueRow {
  const runOrder = entry.registrationData?.runOrder ?? 0;
  return {
    id: entry.id,
    armband: parseArmband(entry),
    // Entry-store rows carry run order under `registrationData.runOrder`;
    // ringside sorts on `exhibitorOrder`. 0 means "unassigned", and the
    // comparator's `exhibitorOrder || armband` fallback then orders by armband.
    exhibitorOrder: runOrder > 0 ? runOrder : null,
    isScored: entry.status === 'completed' || !!entry.competitionData,
    status: queueStatus(entry),
    inRing: entry.checkInStatus === 'in-ring',
    entry,
  };
}

/** Every entry still waiting to run in this class, in run order. */
export function pendingShowEntriesByRunOrder(entries: readonly ShowEntry[]): ShowEntry[] {
  return pendingByRunOrder(entries.map(toShowEntryQueueRow)).map(row => row.entry);
}

/**
 * How many dogs run before `entryId` in its class, or null when the entry is
 * not in the class / no longer in the queue (scored or pulled).
 *
 * The in-ring dog is not counted (INTENT in `runQueue`), so the dog at the head
 * of the waiting queue gets 0 — "You're next" — while a dog is still running.
 * An entry that is itself in the ring also reports 0: nobody runs before it.
 */
export function dogsAheadInClass(entries: readonly ShowEntry[], entryId: string): number | null {
  const rows = entries.map(toShowEntryQueueRow);
  const target = rows.find(row => row.id === entryId);
  if (!target || !isInQueue(target)) return null;
  if (isInRingEntry(target)) return 0;

  const position = pendingByRunOrder(rows).findIndex(row => row.id === entryId);
  return position === -1 ? null : position;
}
