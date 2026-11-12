import type { CheckInStatus } from '@myk9/core';
import { updateReplicatedCheckInStatus } from '@/services/show-day/checkInStatus';
import { replicatedEntriesTable, type ReplicatedEntry } from '@/services/replication';
import { logger } from '@/services/LoggingService';

/** A scoring start that can be undone if the sheet is left without a score. */
export interface RingMove {
  entryId: string;
  /** A restore only undoes its own stamp. */
  writtenRingEntryTime: string;
  /** The previous status, or null if this start made no change. */
  written: Promise<CheckInStatus | null>;
}

/** Mark the dog in-ring when the judge starts timing, using the current replica row. */
export function transitionToInRing(entryId: string): RingMove {
  const writtenRingEntryTime = new Date().toISOString();
  let previousStatus: CheckInStatus | null = null;
  const written = replicatedEntriesTable
    .updateEntryWith(entryId, row => {
      const status = row.checkInStatus ?? row.check_in_status ?? 'no-status';
      if (
        status === 'completed' ||
        status === 'pulled' ||
        (status === 'in-ring' && row.ring_entry_time) ||
        (row.isScored ?? row.is_scored) ||
        (row.awaitingRegistrationNumber ?? row.awaiting_registration_number)
      ) {
        return null;
      }
      previousStatus = status;
      return {
        checkInStatus: 'in-ring',
        check_in_status: 'in-ring',
        ring_entry_time: writtenRingEntryTime,
      };
    })
    .then(() => previousStatus)
    .catch(err => {
      logger.error('Failed to transition entry to in-ring', 'scoring', {}, err as Error);
      return null;
    });
  return { entryId, writtenRingEntryTime, written };
}

/** Restores still running: the screen a sheet returns to waits for these before it reads. */
const pendingRestores = new Set<Promise<void>>();

export function restoreFromInRing(move: RingMove): Promise<void> {
  const restore = runRestore(move).finally(() => pendingRestores.delete(restore));
  pendingRestores.add(restore);
  return restore;
}

/** The longest a list read waits for a restore; the restore is a local write, so this is a ceiling. */
const RESTORE_WAIT_CEILING_MS = 1500;

/**
 * MYK9-1779: the entry list mounts in the same commit that unmounts the sheet, so its first
 * read raced the restore and showed the dog "In ring" until the next debounced refresh. A
 * read of entries calls this first, so it sees the dog already put back. Resolves at once
 * when nothing is restoring; never rejects, and never holds a read past the ceiling.
 */
export async function settleRingRestores(): Promise<void> {
  if (pendingRestores.size === 0) return;
  let ceiling: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([
    Promise.allSettled([...pendingRestores]),
    new Promise<void>(resolve => {
      ceiling = setTimeout(resolve, RESTORE_WAIT_CEILING_MS);
    }),
  ]);
  clearTimeout(ceiling);
}

/**
 * MYK9-1762: undo an abandoned scoring start. A prior stamp is stale, so clear
 * it (MYK9-1778). Only restore our unscored run, so another device's status or
 * saved score is left alone. This goes through the replica and works offline.
 */
async function runRestore(move: RingMove): Promise<void> {
  // Compare instants because a server echo can reformat the stamp.
  const isStillOurs = (
    row: Pick<ReplicatedEntry, 'checkInStatus' | 'isScored' | 'is_scored' | 'ring_entry_time'>
  ) =>
    row.checkInStatus === 'in-ring' &&
    !(row.isScored ?? row.is_scored) &&
    Date.parse(row.ring_entry_time ?? '') === Date.parse(move.writtenRingEntryTime);
  try {
    // An instant Cancel must not read the row before the in-ring write has landed.
    const previousStatus = await move.written;
    if (!previousStatus) return;
    const current = await replicatedEntriesTable.get(move.entryId);
    if (!current || !isStillOurs(current)) return;
    await replicatedEntriesTable.updateEntryWith(move.entryId, row =>
      isStillOurs(row)
        ? {
            checkInStatus: previousStatus,
            check_in_status: previousStatus,
            ring_entry_time: undefined,
          }
        : null
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
