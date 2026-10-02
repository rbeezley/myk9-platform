/**
 * Atomic "delete these rows unless they hold unsynced local work" (MYK9-922).
 *
 * A server-side removal purges the local replica, but a create or edit queued
 * from another tab a moment earlier must survive for normal sync. Checking each
 * row and then deleting is two steps with a gap another tab can write into, so
 * the check and the delete share ONE IndexedDB readwrite transaction over the
 * replica store and both mutation-queue stores (they live in the same
 * database). IndexedDB serializes overlapping readwrite transactions across
 * tabs, so a write either commits before this transaction (and the row is kept)
 * or after it (and recreates the row itself). Every await in the transaction is
 * an IndexedDB request: awaiting anything else would let it auto-commit early.
 */
import type { IDBPDatabase } from 'idb';
import type { PendingMutation, ReplicatedRow } from '../types';
import { REPLICATION_STORES } from './DatabaseManager';

export interface DeleteRowsIfCleanResult {
  /** Ids removed from the replica. */
  deleted: string[];
  /** Ids kept because they were dirty, local-only, or had a pending/failed mutation. */
  kept: string[];
}

export async function deleteRowsIfClean(
  db: IDBPDatabase,
  tableName: string,
  ids: Iterable<string>,
  remoteVersions?: ReadonlyMap<string, number>
): Promise<DeleteRowsIfCleanResult> {
  const unique = [...new Set([...ids].map(String))];
  const result: DeleteRowsIfCleanResult = { deleted: [], kept: [] };
  if (unique.length === 0) return result;

  const tx = db.transaction(
    [
      REPLICATION_STORES.REPLICATED_TABLES,
      REPLICATION_STORES.PENDING_MUTATIONS,
      REPLICATION_STORES.FAILED_MUTATIONS,
    ],
    'readwrite'
  );
  const rows = tx.objectStore(REPLICATION_STORES.REPLICATED_TABLES);
  const pending = tx.objectStore(REPLICATION_STORES.PENDING_MUTATIONS).index('tableName_rowId');
  const failed = tx.objectStore(REPLICATION_STORES.FAILED_MUTATIONS).index('tableName');

  // Any user's failed mutations count: keeping a row is the safe error.
  const failedRowIds = new Set(
    ((await failed.getAll(tableName)) as PendingMutation[]).map(m => String(m.rowId))
  );

  for (const id of unique) {
    const row = (await rows.get([tableName, id])) as ReplicatedRow<unknown> | undefined;
    if (!row) continue;
    const data = row.data as { _localOnly?: unknown } | null;
    const holdsWork =
      row.isDirty ||
      data?._localOnly === true ||
      failedRowIds.has(id) ||
      (await pending.count([tableName, id])) > 0;
    // A delayed deletion snapshot cannot erase a newer authorized restore.
    // Check its token inside the same transaction as the delete and queues.
    const remoteVersion = remoteVersions?.get(id);
    const newerSnapshot =
      remoteVersion !== undefined &&
      row.serverVersion !== undefined &&
      row.serverVersion > remoteVersion;
    if (holdsWork || newerSnapshot) {
      result.kept.push(id);
    } else {
      await rows.delete([tableName, id]);
      result.deleted.push(id);
    }
  }

  await tx.done;
  return result;
}
