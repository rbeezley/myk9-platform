/**
 * Rewrite every row that holds no unsynced local work, in ONE transaction that
 * also reads the mutation queue (MYK9-2255). The same "clean" test and the same
 * atomicity as `deleteRowsIfClean`: a create or edit queued a moment earlier,
 * from this tab or another, is left whole, because it is unsent work and the
 * only copy of it. Rows of every account are considered; the caller's `redact`
 * decides what a clean row keeps.
 */
import type { IDBPDatabase } from 'idb';
import type { PendingMutation, ReplicatedRow } from '../types';
import { REPLICATION_STORES } from './DatabaseManager';

export interface RedactCleanRowsResult {
  /** Ids rewritten (their data changed). */
  redacted: string[];
  /** Ids left whole because they were dirty, local-only, or had a pending/failed mutation. */
  kept: string[];
}

export async function redactCleanRows<T>(
  db: IDBPDatabase,
  tableName: string,
  redact: (data: T) => T
): Promise<RedactCleanRowsResult> {
  const result: RedactCleanRowsResult = { redacted: [], kept: [] };
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

  const failedRowIds = new Set(
    ((await failed.getAll(tableName)) as PendingMutation[]).map(m => String(m.rowId))
  );
  const stored = (await rows.index('tableName').getAll(tableName)) as ReplicatedRow<T>[];

  for (const row of stored) {
    const id = String(row.id);
    const data = row.data as { _localOnly?: unknown } | null;
    const holdsWork =
      row.isDirty ||
      data?._localOnly === true ||
      failedRowIds.has(id) ||
      (await pending.count([tableName, id])) > 0;
    if (holdsWork) {
      result.kept.push(id);
      continue;
    }
    const next = redact(row.data);
    if (JSON.stringify(next) === JSON.stringify(row.data)) continue;
    await rows.put({ ...row, data: next });
    result.redacted.push(id);
  }

  await tx.done;
  return result;
}
