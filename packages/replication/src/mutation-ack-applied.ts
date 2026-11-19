import type { IDBPDatabase } from 'idb';
import { REPLICATION_STORES } from './core/DatabaseManager';
import type { PendingMutation } from './types';

/**
 * MYK9-2111: remove one row's queued RPC deltas whose every field the server row
 * already holds (`isApplied`): the write landed and only its acknowledgement was
 * lost. A delta with any field still different is left queued untouched, never
 * dropped; a delta with no fields cannot be compared and stays too.
 *
 * @returns the number of mutations removed.
 */
export async function acknowledgeAppliedRpcWrites(
  db: IDBPDatabase,
  row: { tableName: string; rowId: string; authUserId: string },
  isApplied: (field: string, value: unknown) => boolean
): Promise<number> {
  const all = (await db.getAll(REPLICATION_STORES.PENDING_MUTATIONS)) as PendingMutation[];
  const applied = all.filter(
    m =>
      m.tableName === row.tableName &&
      String(m.rowId) === row.rowId &&
      m.operation === 'UPDATE' &&
      m.authUserId === row.authUserId &&
      m.rpc?.fields !== undefined &&
      Object.keys(m.rpc.fields).length > 0 &&
      Object.entries(m.rpc.fields).every(([field, value]) => isApplied(field, value))
  );
  for (const mutation of applied) {
    await db.delete(REPLICATION_STORES.PENDING_MUTATIONS, mutation.id);
  }
  return applied.length;
}
