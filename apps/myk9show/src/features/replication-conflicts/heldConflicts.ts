import { mutationManager } from '@/services/replication/sharedMutationManager';
import { logger } from '@/services/LoggingService';

type ConflictSnapshot = {
  tableName: string;
  rowId: string;
  localData?: { showId?: unknown; trialId?: unknown } | null;
};

type ConflictSource = {
  getConflictedRows: () => Promise<ConflictSnapshot[]>;
};

/** One change this device holds for a choice, with the show it belongs to. */
export interface HeldConflict {
  snapshot: ConflictSnapshot;
  showId: string;
}

async function showIdOf(snapshot: ConflictSnapshot): Promise<string | null> {
  const { showId, trialId } = snapshot.localData ?? {};
  if (typeof showId === 'string' && showId) return showId;
  // A class reaches its show through its trial.
  if (snapshot.tableName === 'classes' && typeof trialId === 'string' && trialId) {
    const { replicatedTrialsTable } = await import('@/services/replication');
    const trial = await replicatedTrialsTable.get(trialId);
    return trial?.showId || null;
  }
  return null;
}

/**
 * The conflicts this signed-in user's device holds for a choice, across all replicated tables, each
 * with its show. Read from the persisted snapshots, so it works offline and after the notice was
 * closed. Only a conflict this user still has a queued change for counts (the queue read is per
 * user), so another account's leftovers on a shared device are neither shown nor resolved here.
 * A table that cannot be read is skipped (logged), never counted as "no conflict" for the others.
 */
export async function listHeldConflicts(): Promise<HeldConflict[]> {
  // Loaded on use: the provider wires the replicated tables at import time, which hooks that only
  // read the sync status (and their tests) must not trigger.
  const { REPLICATED_TABLES } = await import('@/providers/ReplicationSyncProvider');
  const held: HeldConflict[] = [];
  for (const { name, table } of REPLICATED_TABLES) {
    try {
      const snapshots = await (table as unknown as ConflictSource).getConflictedRows();
      if (snapshots.length === 0) continue;
      const mine = new Set(
        (await mutationManager.getPendingMutationsForTable(name)).map(mutation => mutation.rowId)
      );
      for (const snapshot of snapshots) {
        if (!mine.has(snapshot.rowId)) continue;
        const showId = await showIdOf(snapshot);
        if (showId) held.push({ snapshot, showId });
      }
    } catch (err) {
      logger.warn('Could not read held conflicts for a table', 'replication', { err });
    }
  }
  return held;
}

/**
 * Brings the existing notice back for this show's held conflicts: the persisted snapshot is
 * re-dispatched as `replication:conflict`, the same event the sync raises and the sign-in replays.
 * The notice is keyed by table and row, so a conflict already on screen is updated, never doubled.
 */
export async function reopenHeldConflicts(showId: string): Promise<number> {
  const held = (await listHeldConflicts()).filter(item => item.showId === showId);
  for (const { snapshot } of held) {
    window.dispatchEvent(new CustomEvent('replication:conflict', { detail: snapshot }));
  }
  return held.length;
}
