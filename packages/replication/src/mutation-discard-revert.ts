import type { IDBPDatabase } from 'idb';
import { REPLICATION_STORES } from './core/DatabaseManager';
import { buildSyncedReplicatedRow } from './core/ReplicatedTableRowState';
import type { PendingMutation, ReplicatedRow } from './types';

/**
 * Put a row back to the last server state this device knew after the user
 * discards a refused UPDATE or DELETE for it (MYK9-1076). Without this the row
 * stays dirty with the refused value, and nothing ever replaces it: a clean
 * server row never overwrites a dirty one, and a server row that has not
 * changed is never downloaded again.
 *
 * The row reverts only when BOTH hold, or a newer local edit would be lost:
 * - it still holds the revision the discarded write produced
 *   (`rowRevision`), so nothing newer was written to it, queued or not; and
 * - no other pending or failed mutation names it.
 *
 * The restored data is the conflict's remote copy when the row is in conflict
 * (the newest server state seen), else the base captured when the row first
 * went dirty, which dirty-row reconciliation keeps at the latest server copy.
 * No network: this works offline, and the next sync carries on from there.
 *
 * The row and both queues are read, and the row written, in ONE readwrite
 * transaction (the removeOrphanedLocalOnlyRow pattern): a write another tab
 * queues for this row lands either before (and blocks the revert) or after.
 * Every await here is an IndexedDB request, so the transaction stays open.
 *
 * @returns true when the row was reverted.
 */
export async function revertDiscardedRowWrite(
  db: IDBPDatabase,
  discarded: PendingMutation
): Promise<boolean> {
  if (discarded.operation === 'INSERT' || discarded.rowRevision === undefined) return false;
  const rowId = String(discarded.rowId);
  const key = [discarded.tableName, rowId];

  const tx = db.transaction(
    [
      REPLICATION_STORES.REPLICATED_TABLES,
      REPLICATION_STORES.PENDING_MUTATIONS,
      REPLICATION_STORES.FAILED_MUTATIONS,
    ],
    'readwrite'
  );
  const rows = tx.objectStore(REPLICATION_STORES.REPLICATED_TABLES);
  const row = (await rows.get(key)) as ReplicatedRow<unknown> | undefined;
  const conflict = row?.conflict;
  const restored = conflict ? conflict.remoteData : row?.baseData;
  if (!row || !row.isDirty || row.version !== discarded.rowRevision || restored === undefined) {
    await tx.done;
    return false;
  }

  const pending = await tx
    .objectStore(REPLICATION_STORES.PENDING_MUTATIONS)
    .index('tableName_rowId')
    .count(key);
  const failed = (await tx
    .objectStore(REPLICATION_STORES.FAILED_MUTATIONS)
    .index('tableName')
    .getAll(discarded.tableName)) as PendingMutation[];
  if (pending > 0 || failed.some(m => String(m.rowId) === rowId && m.id !== discarded.id)) {
    await tx.done;
    return false;
  }

  const serverVersion = conflict
    ? Math.max(row.serverVersion ?? -Infinity, conflict.remoteServerVersion)
    : row.serverVersion;
  const reverted = buildSyncedReplicatedRow(
    {
      ...row,
      data: restored,
      // A local data change: bump the revision like any other write does.
      version: row.version + 1,
      ...(serverVersion !== undefined && { serverVersion }),
    },
    Date.now()
  );
  // The conflict's copy moved the token, so the record of this device's own
  // last upload no longer describes it.
  if (conflict) delete reverted.lastOwnUpload;
  await rows.put(reverted);
  await tx.done;
  return true;
}

/**
 * Tables that opted in to {@link revertDiscardedRowWrite}, keyed by table name,
 * each with the callback that tells its listeners a row changed.
 */
export class DiscardRevertRegistry {
  private readonly onReverted = new Map<string, () => void>();

  /** @returns an unregister function that removes only this registration. */
  register(tableName: string, onReverted: () => void): () => void {
    this.onReverted.set(tableName, onReverted);
    return () => {
      if (this.onReverted.get(tableName) === onReverted) this.onReverted.delete(tableName);
    };
  }

  has(tableName: string): boolean {
    return this.onReverted.has(tableName);
  }

  notify(tableName: string): void {
    this.onReverted.get(tableName)?.();
  }
}
