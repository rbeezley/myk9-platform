import type { CheckInStatus } from '@myk9/core';
import { updateReplicatedCheckInStatus } from '@/services/show-day/checkInStatus';
import { replicatedEntriesTable, type ReplicatedEntry } from '@/services/replication';
import { logger } from '@/services/LoggingService';

/** What a scoresheet opening replaced, so leaving without a score can put it back. */
export interface RingMove {
  entryId: string;
  previousStatus: CheckInStatus;
  /** The stamp this opening wrote; a restore only undoes its own stamp. */
  writtenRingEntryTime: string;
  /** Settles once the in-ring write has been applied (or failed), so a restore follows it. */
  written: Promise<unknown>;
}

/**
 * Transition an entry to "in-ring" status when a scoresheet opens.
 * Sets check-in status + ring_entry_time. No-ops if already completed, or if already in-ring
 * with an entry time, so reopening (Resume) keeps the original ring_entry_time and sends no
 * extra write. A dog marked in-ring by hand has no time yet (that path writes only the
 * status), so the scoresheet opening still records it.
 *
 * Returns the move it made (null when it wrote nothing), for `restoreFromInRing`.
 */
export function transitionToInRing(
  entryId: string,
  currentStatus: CheckInStatus | undefined,
  ringEntryTime: string | null | undefined
): RingMove | null {
  if (currentStatus === 'completed') return null;
  if (currentStatus === 'in-ring' && ringEntryTime) return null;

  const writtenRingEntryTime = new Date().toISOString();
  const written = updateReplicatedCheckInStatus(entryId, 'in-ring', {
    ring_entry_time: writtenRingEntryTime,
  }).catch(err =>
    logger.error('Failed to transition entry to in-ring', 'scoring', {}, err as Error)
  );
  return {
    entryId,
    previousStatus: currentStatus ?? 'no-status',
    writtenRingEntryTime,
    written,
  };
}

/**
 * MYK9-1762: the scoresheet was left without a score (Cancel, Up, back gesture), so undo
 * what opening it did: put back the check-in status the dog had, with no ring time. Opening
 * only writes when the dog was not already in the ring with a time, so any time it had
 * before is stale (left by a score reset, for one) and is not put back (MYK9-1778). Only when the
 * dog is still in the ring, unscored and holding the ring time this opening wrote, so a saved
 * score, a status someone else has set since, or another device's run is never overwritten.
 * Goes through the replicated path, so it works offline.
 */
export async function restoreFromInRing(move: RingMove): Promise<void> {
  // Still in the ring, unscored, and carrying the stamp THIS opening wrote. Another device
  // that opened the same dog after us wrote nothing (Resume), so it relies on our stamp;
  // compared as instants because a server echo may format the timestamp differently.
  const isStillOurs = (
    row: Pick<ReplicatedEntry, 'checkInStatus' | 'isScored' | 'is_scored' | 'ring_entry_time'>
  ) =>
    row.checkInStatus === 'in-ring' &&
    !(row.isScored ?? row.is_scored) &&
    Date.parse(row.ring_entry_time ?? '') === Date.parse(move.writtenRingEntryTime);
  try {
    // An instant Cancel must not read the row before the in-ring write has landed.
    await move.written;
    const current = await replicatedEntriesTable.get(move.entryId);
    if (!current || !isStillOurs(current)) return;
    await replicatedEntriesTable.updateEntryWith(move.entryId, row =>
      isStillOurs(row)
        ? {
            checkInStatus: move.previousStatus,
            check_in_status: move.previousStatus,
            ring_entry_time: undefined,
          }
        : {}
    );
  } catch (err) {
    logger.error(
      'Failed to put the entry back after leaving the scoresheet',
      'scoring',
      {},
      err as Error
    );
  }
}

/**
 * Transition an entry to "completed" status after scoring.
 * Sets check-in status + ring_exit_time.
 */
export function transitionToCompleted(entryId: string): void {
  updateReplicatedCheckInStatus(entryId, 'completed', {
    ring_exit_time: new Date().toISOString(),
  }).catch(err =>
    logger.error('Failed to transition entry to completed', 'scoring', {}, err as Error)
  );
}
