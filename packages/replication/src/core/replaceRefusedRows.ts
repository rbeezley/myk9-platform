/**
 * Re-pull a row whose queued write the server refused, or the user discarded
 * (MYK9-1076), atomically. Adapted from the MYK9-1071 helper (PR #2873).
 *
 * The caller read each row's local revision (`ReplicatedRow.version`) before
 * fetching the server copy. Here, in ONE readwrite transaction over the rows and
 * the queue stores, each row is replaced only when:
 *  - its local revision is unchanged: a new edit writes the row (bumping the
 *    revision) before it queues, so this also covers the write-then-queue gap;
 *  - no pending, offline-queue or failed mutation names it: any of them is an
 *    edit the user still holds, and the server copy would hide it;
 *  - the server copy is not older than the row's own OCC token.
 * Every await is an IndexedDB request on that transaction, so another tab cannot
 * slip an edit in between the checks and the write.
 *
 * There is no "server has no copy" case here: a row the server did not return
 * is left alone by the caller (see refetchRefusedRowsById).
 */
import type { IDBPDatabase } from 'idb';
import type { PendingMutation, ReplicatedRow } from '../types';
import { REPLICATION_STORES } from './DatabaseManager';
import { buildRemoteReplacementRow } from './ReplicatedTableConflict';
import { isOlderThanRow } from './ReplicatedTableRowState';

export interface RefusedRowReplacement<T> {
  id: string;
  /** `ReplicatedRow.version` read before the server fetch. */
  expectedRowVersion: number;
  remote: T;
  remoteServerVersion?: number | undefined;
}

// A FAILED mutation holds the row too: it is an edit the user has not given up
// yet (the discarded one is already gone from the failed store when this runs).
const QUEUE_STORES = [
  REPLICATION_STORES.PENDING_MUTATIONS,
  REPLICATION_STORES.OFFLINE_QUEUE,
  REPLICATION_STORES.FAILED_MUTATIONS,
];

/** @returns the ids that were replaced; the rest were skipped. */
export async function replaceRefusedRows<T extends { id: string }>(
  db: IDBPDatabase,
  tableName: string,
  entries: readonly RefusedRowReplacement<T>[]
): Promise<string[]> {
  if (entries.length === 0) return [];

  const tx = db.transaction([REPLICATION_STORES.REPLICATED_TABLES, ...QUEUE_STORES], 'readwrite');
  const held = new Set<string>();
  for (const store of QUEUE_STORES) {
    for (const entry of (await tx.objectStore(store).getAll()) as Array<Partial<PendingMutation>>) {
      if (entry.tableName === tableName && entry.rowId !== undefined) held.add(String(entry.rowId));
    }
  }
  const rows = tx.objectStore(REPLICATION_STORES.REPLICATED_TABLES);

  const replaced: string[] = [];
  for (const entry of entries) {
    const id = String(entry.id);
    const row = (await rows.get([tableName, id])) as ReplicatedRow<T> | undefined;
    if (
      !row ||
      row.version !== entry.expectedRowVersion ||
      held.has(id) ||
      isOlderThanRow(row, entry.remoteServerVersion)
    ) {
      continue;
    }
    await rows.put(
      buildRemoteReplacementRow({
        tableName,
        id,
        remoteData: entry.remote,
        existingRow: row,
        remoteServerVersion: entry.remoteServerVersion,
      })
    );
    replaced.push(id);
  }
  await tx.done;
  return replaced;
}
