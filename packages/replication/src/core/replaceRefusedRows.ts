/**
 * Re-pull a row whose queued write the server refused (MYK9-1071, D3), atomically.
 *
 * The caller read each row's local revision (`ReplicatedRow.version`) before
 * fetching the server copy. Here, in ONE readwrite transaction over the rows and
 * the queue stores, each row is replaced (or removed, when the server has no
 * copy) only when:
 *  - its local revision is unchanged: a new edit writes the row (bumping the
 *    revision) before it queues, so this also covers the write-then-queue gap;
 *  - no pending or offline-queue mutation names it (a failed one does not: that
 *    is the refused write itself, kept for the user's Retry or Discard);
 *  - the server copy is not older than the row's own OCC token.
 * Every await is an IndexedDB request on that transaction, so another tab cannot
 * slip an edit in between the checks and the write.
 */
import type { IDBPDatabase } from 'idb';
import type { PendingMutation, ReplicatedRow } from '../types';
import { REPLICATION_STORES } from './DatabaseManager';
import { buildRemoteReplacementRow } from './ReplicatedTableConflict';
import { isOlderThanRow } from './ReplicatedTableRowState';

export interface RefusedRowReplacement<T> {
  id: string;
  /** `ReplicatedRow.version` read before the server fetch; undefined = no local row. */
  expectedRowVersion: number | undefined;
  /** The server copy as a local row, or null when the server has none. */
  remote: T | null;
  remoteServerVersion?: number | undefined;
}

export interface ReplaceRefusedRowsResult {
  replaced: string[];
  removed: string[];
  skipped: string[];
}

const QUEUE_STORES = [REPLICATION_STORES.PENDING_MUTATIONS, REPLICATION_STORES.OFFLINE_QUEUE];

export async function replaceRefusedRows<T extends { id: string }>(
  db: IDBPDatabase,
  tableName: string,
  entries: readonly RefusedRowReplacement<T>[]
): Promise<ReplaceRefusedRowsResult> {
  const result: ReplaceRefusedRowsResult = { replaced: [], removed: [], skipped: [] };
  if (entries.length === 0) return result;

  const tx = db.transaction([REPLICATION_STORES.REPLICATED_TABLES, ...QUEUE_STORES], 'readwrite');
  const held = new Set<string>();
  for (const store of QUEUE_STORES) {
    for (const entry of (await tx.objectStore(store).getAll()) as Array<Partial<PendingMutation>>) {
      if (entry.tableName === tableName && entry.rowId !== undefined) held.add(String(entry.rowId));
    }
  }
  const rows = tx.objectStore(REPLICATION_STORES.REPLICATED_TABLES);

  for (const entry of entries) {
    const id = String(entry.id);
    const row = (await rows.get([tableName, id])) as ReplicatedRow<T> | undefined;
    if (
      !row ||
      row.version !== entry.expectedRowVersion ||
      held.has(id) ||
      isOlderThanRow(row, entry.remoteServerVersion)
    ) {
      result.skipped.push(id);
      continue;
    }
    if (entry.remote === null) {
      await rows.delete([tableName, id]);
      result.removed.push(id);
    } else {
      await rows.put(
        buildRemoteReplacementRow({
          tableName,
          id,
          remoteData: entry.remote,
          existingRow: row,
          remoteServerVersion: entry.remoteServerVersion,
        })
      );
      result.replaced.push(id);
    }
  }
  await tx.done;
  return result;
}
