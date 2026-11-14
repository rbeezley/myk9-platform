import { logger } from '@/services/LoggingService';

type ConflictSource = {
  getConflictedRows: () => Promise<unknown[]>;
};

/**
 * Every conflict this device is holding for a choice, across all replicated tables. Read from the
 * persisted snapshots, so it works offline and after the notice was closed. A table that cannot be
 * read is skipped (logged), never counted as "no conflict" for the others.
 */
export async function listHeldConflicts(): Promise<unknown[]> {
  // Loaded on use: the provider wires the replicated tables at import time, which hooks that only
  // read the sync status (and their tests) must not trigger.
  const { REPLICATED_TABLES } = await import('@/providers/ReplicationSyncProvider');
  const held: unknown[] = [];
  for (const { table } of REPLICATED_TABLES) {
    try {
      held.push(...(await (table as unknown as ConflictSource).getConflictedRows()));
    } catch (err) {
      logger.warn('Could not read held conflicts for a table', 'replication', { err });
    }
  }
  return held;
}

/**
 * Brings the existing notice back for every held conflict: the persisted snapshot is re-dispatched
 * as `replication:conflict`, the same event the sync raises and the sign-in replays. The notice is
 * keyed by table and row, so a conflict already on screen is updated, never shown twice.
 */
export async function reopenHeldConflicts(): Promise<number> {
  const held = await listHeldConflicts();
  for (const snapshot of held) {
    window.dispatchEvent(new CustomEvent('replication:conflict', { detail: snapshot }));
  }
  return held.length;
}
