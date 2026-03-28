import { CHECKIN_STATUS } from '@myk9/core';
import type { CheckInStatus } from '@myk9/core';
import { replicatedEntriesTable } from '@/services/replication/ReplicatedEntriesTable';
import { logger } from '@/services/LoggingService';

/**
 * Transition an entry to "in-ring" status when a scoresheet opens.
 * Sets check-in status + ring_entry_time. No-ops if already completed.
 */
export function transitionToInRing(
  entryId: string,
  currentStatus: CheckInStatus | undefined
): void {
  if (currentStatus === CHECKIN_STATUS.COMPLETED.value) return;

  replicatedEntriesTable
    .updateEntry(entryId, {
      checkInStatus: CHECKIN_STATUS.IN_RING.value,
      ring_entry_time: new Date().toISOString(),
    })
    .catch(err =>
      logger.error('Failed to transition entry to in-ring', 'scoring', {}, err as Error)
    );
}

/**
 * Transition an entry to "completed" status after scoring.
 * Sets check-in status + ring_exit_time.
 */
export function transitionToCompleted(entryId: string): void {
  replicatedEntriesTable
    .updateEntry(entryId, {
      checkInStatus: CHECKIN_STATUS.COMPLETED.value,
      ring_exit_time: new Date().toISOString(),
    })
    .catch(err =>
      logger.error('Failed to transition entry to completed', 'scoring', {}, err as Error)
    );
}
