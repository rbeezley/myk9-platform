/**
 * One-time repair for rows stuck at `data._syncStatus === 'pending'` (MYK9-1055).
 *
 * Before MYK9-1050 an upload ack cleared the row wrapper (`isDirty` false) but
 * left the data flag at `'pending'`, and a table's `resolveConflict` that reads
 * the flag kept the stale local row over every later server row. Devices that
 * ran the old build still hold such rows, and the incremental pull never
 * refetches them because the server rows are older than the sync cursor.
 *
 * The repair does two things in ONE IndexedDB readwrite transaction (the
 * `deleteRowsIfClean` pattern: every await is an IndexedDB request, so another
 * tab cannot queue an edit between the check and the write):
 *  1. A clean row (not dirty, no pending/failed/offline mutation naming it)
 *     whose data flag is `'pending'` gets the flag set to `'synced'`.
 *  2. If any row was repaired, the table's incremental cursors are reset to 0
 *     (the table-global one and every scope's), so the next sync pass for each
 *     scope fetches from the epoch and the server changes the stale row hid
 *     arrive. A scope value is table-specific (show, trial, club, owner), so it
 *     cannot be derived from a row; resetting every scope is the safe superset.
 *
 * Idempotent: once flags are `'synced'` a second run finds nothing and leaves
 * the cursors alone.
 */
import type { IDBPDatabase } from 'idb';
import type { PendingMutation, ReplicatedRow, SyncMetadata } from '../types';
import { REPLICATION_STORES } from './DatabaseManager';
import { withAcknowledgedSyncFlag } from './ReplicatedTableRowState';

export interface RepairStuckPendingFlagsResult {
  /** Ids whose data flag was normalized to `'synced'`. */
  repaired: string[];
  /** Stuck-looking ids left alone because a mutation or dirty flag says work is unsent. */
  kept: string[];
  /**
   * Every row id of the table named by a pending/failed/offline mutation, set
   * only when the repair reset the cursors. The full download that follows
   * must not overwrite these rows' unsent local values.
   */
  held: string[];
}

function hasStuckFlag(data: unknown): boolean {
  return (
    data !== null &&
    typeof data === 'object' &&
    (data as { _syncStatus?: unknown })._syncStatus === 'pending'
  );
}

export async function repairStuckPendingFlags(
  db: IDBPDatabase,
  tableName: string
): Promise<RepairStuckPendingFlagsResult> {
  const result: RepairStuckPendingFlagsResult = { repaired: [], kept: [], held: [] };

  const tx = db.transaction(
    [
      REPLICATION_STORES.REPLICATED_TABLES,
      REPLICATION_STORES.PENDING_MUTATIONS,
      REPLICATION_STORES.FAILED_MUTATIONS,
      REPLICATION_STORES.OFFLINE_QUEUE,
      REPLICATION_STORES.SYNC_METADATA,
    ],
    'readwrite'
  );
  const rows = tx.objectStore(REPLICATION_STORES.REPLICATED_TABLES);
  const candidates = (
    (await rows.index('tableName').getAll(tableName)) as ReplicatedRow<unknown>[]
  ).filter(row => hasStuckFlag(row.data));

  if (candidates.length > 0) {
    // Any user's mutations count: keeping a row is the safe error.
    const heldRowIds = new Set<string>();
    const queues = [
      tx.objectStore(REPLICATION_STORES.PENDING_MUTATIONS),
      tx.objectStore(REPLICATION_STORES.FAILED_MUTATIONS),
      tx.objectStore(REPLICATION_STORES.OFFLINE_QUEUE),
    ];
    for (const store of queues) {
      for (const entry of (await store.getAll()) as Array<Partial<PendingMutation>>) {
        if (entry.tableName === tableName && entry.rowId !== undefined) {
          heldRowIds.add(String(entry.rowId));
        }
      }
    }

    for (const row of candidates) {
      if (row.isDirty || heldRowIds.has(String(row.id))) {
        result.kept.push(row.id);
        continue;
      }
      await rows.put({ ...row, data: withAcknowledgedSyncFlag(row.data) });
      result.repaired.push(row.id);
    }

    if (result.repaired.length > 0) {
      result.held = [...heldRowIds];
      const metadata = tx.objectStore(REPLICATION_STORES.SYNC_METADATA);
      const existing = (await metadata.get(tableName)) as SyncMetadata | undefined;
      if (existing) {
        const scopes = existing.scopes
          ? Object.fromEntries(
              Object.entries(existing.scopes).map(([key, state]) => [
                key,
                { ...state, lastIncrementalSyncAt: 0 },
              ])
            )
          : undefined;
        await metadata.put({
          ...existing,
          lastIncrementalSyncAt: 0,
          ...(scopes !== undefined && { scopes }),
        });
      }
    }
  }

  await tx.done;
  return result;
}
