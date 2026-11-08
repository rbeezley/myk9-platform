import type { CheckInStatus } from '@myk9/core';
import { updateReplicatedCheckInStatus } from '@/services/show-day/checkInStatus';
import { replicatedEntriesTable } from '@/services/replication';
import { logger } from '@/services/LoggingService';

/** What a scoresheet opening replaced, so leaving without a score can put it back. */
export interface RingMove {
  entryId: string;
  previousStatus: CheckInStatus;
  previousRingEntryTime: string | undefined;
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

  updateReplicatedCheckInStatus(entryId, 'in-ring', {
    ring_entry_time: new Date().toISOString(),
  }).catch(err =>
    logger.error('Failed to transition entry to in-ring', 'scoring', {}, err as Error)
  );
  return {
    entryId,
    previousStatus: currentStatus ?? 'no-status',
    previousRingEntryTime: ringEntryTime ?? undefined,
  };
}

/**
 * MYK9-1762: the scoresheet was left without a score (Cancel, Up, back gesture), so undo
 * what opening it did: put back the check-in status and ring time the dog had. Only when the
 * dog is still in the ring and unscored, so a saved score, or a status someone else has set
 * since, is never overwritten. Goes through the replicated path, so it works offline.
 */
export async function restoreFromInRing(move: RingMove): Promise<void> {
  const isStillOurs = (row: {
    checkInStatus?: CheckInStatus | undefined;
    isScored?: boolean | undefined;
    is_scored?: boolean | undefined;
  }) => row.checkInStatus === 'in-ring' && !(row.isScored ?? row.is_scored);
  try {
    const current = await replicatedEntriesTable.get(move.entryId);
    if (!current || !isStillOurs(current)) return;
    await replicatedEntriesTable.updateEntryWith(move.entryId, row =>
      isStillOurs(row)
        ? {
            checkInStatus: move.previousStatus,
            check_in_status: move.previousStatus,
            ring_entry_time: move.previousRingEntryTime,
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
