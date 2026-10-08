/**
 * One-time repair for rows stuck at `data._syncStatus === 'pending'` (MYK9-1055).
 *
 * Before MYK9-1050 an upload ack cleared the row wrapper (`isDirty` false) but
 * left the data flag at `'pending'`, and a table's `resolveConflict` that reads
 * the flag kept the stale local row over every later server row. Devices that
 * ran the old build still hold such rows, and the incremental pull never
 * refetches them because the server rows are older than the sync cursor.
 *
 * The repair touches only those rows, never the sync cursors:
 *  1. Find stuck rows: not dirty, flag `'pending'`, and no pending, failed or
 *     offline-queue mutation naming them. None found means no network call.
 *  2. Fetch just those ids through the adapter's `fetchRowsById` (the same
 *     view and columns the download reads). A failed fetch rejects before
 *     anything is written, so the next start repeats the repair.
 *  3. Write each row in ONE readwrite transaction that re-checks, per row, that
 *     it still holds no unsent work (the `deleteRowsIfClean` pattern: every
 *     await is an IndexedDB request, so another tab cannot queue an edit
 *     between the check and the write). A row that became ineligible is skipped.
 *     The row is clean and unqueued, so the server copy simply replaces it.
 *  4. A stuck row the server did not return (deleted, not visible), or whose
 *     server copy is older than the row's own token (an ack landed mid-fetch),
 *     only has its flag normalized; nothing is deleted here.
 */
import type { IDBPDatabase } from 'idb';
import type { PendingMutation, ReplicatedRow } from '../types';
import type { SyncReplicatedTableAdapter } from '../syncReplicatedTable.types';
import type { ReplicatedTable } from './ReplicatedTable';
import { REPLICATION_STORES } from './DatabaseManager';
import {
  buildReplicatedRowForSet,
  isOlderThanRow,
  withAcknowledgedSyncFlag,
} from './ReplicatedTableRowState';

export type StuckRepairAdapter<TRemote, TLocal extends { id: string }> = Pick<
  SyncReplicatedTableAdapter<TRemote, TLocal>,
  'getRemoteId' | 'toLocalRow'
> &
  Required<Pick<SyncReplicatedTableAdapter<TRemote, TLocal>, 'fetchRowsById'>>;

export interface RepairStuckPendingFlagsResult {
  /** Ids replaced with the server copy. */
  refreshed: string[];
  /** Ids whose flag was normalized without a server copy to apply. */
  normalized: string[];
  /** Ids that gained unsent work between the scan and the write. */
  skipped: string[];
}

const FETCH_CHUNK_SIZE = 100;
const STORES = [
  REPLICATION_STORES.REPLICATED_TABLES,
  REPLICATION_STORES.PENDING_MUTATIONS,
  REPLICATION_STORES.FAILED_MUTATIONS,
  REPLICATION_STORES.OFFLINE_QUEUE,
];

function hasStuckFlag(data: unknown): boolean {
  return (
    data !== null &&
    typeof data === 'object' &&
    (data as { _syncStatus?: unknown })._syncStatus === 'pending'
  );
}

/** Row ids any user's queued, failed or offline mutation names (the safe error is to keep). */
async function readHeldRowIds(
  tx: {
    objectStore(name: string): { getAll(): Promise<unknown[]> };
  },
  tableName: string
): Promise<Set<string>> {
  const held = new Set<string>();
  for (const store of STORES.slice(1)) {
    for (const entry of (await tx.objectStore(store).getAll()) as Array<Partial<PendingMutation>>) {
      if (entry.tableName === tableName && entry.rowId !== undefined) {
        held.add(String(entry.rowId));
      }
    }
  }
  return held;
}

export async function repairStuckPendingFlags<TRemote, TLocal extends { id: string }>(
  db: IDBPDatabase,
  tableName: string,
  adapter: StuckRepairAdapter<TRemote, TLocal>
): Promise<RepairStuckPendingFlagsResult> {
  const result: RepairStuckPendingFlagsResult = { refreshed: [], normalized: [], skipped: [] };

  const scan = db.transaction(STORES, 'readonly');
  const held = await readHeldRowIds(scan, tableName);
  const stuckIds = (
    (await scan
      .objectStore(REPLICATION_STORES.REPLICATED_TABLES)
      .index('tableName')
      .getAll(tableName)) as ReplicatedRow<unknown>[]
  )
    .filter(row => !row.isDirty && hasStuckFlag(row.data) && !held.has(String(row.id)))
    .map(row => String(row.id));
  await scan.done;
  if (stuckIds.length === 0) return result;

  const remotes: TRemote[] = [];
  for (let i = 0; i < stuckIds.length; i += FETCH_CHUNK_SIZE) {
    remotes.push(...(await adapter.fetchRowsById(stuckIds.slice(i, i + FETCH_CHUNK_SIZE))));
  }
  const remoteById = new Map(remotes.map(remote => [String(adapter.getRemoteId(remote)), remote]));

  const tx = db.transaction(STORES, 'readwrite');
  const rows = tx.objectStore(REPLICATION_STORES.REPLICATED_TABLES);
  const heldNow = await readHeldRowIds(tx, tableName);
  const now = Date.now();
  for (const id of stuckIds) {
    const row = (await rows.get([tableName, id])) as ReplicatedRow<TLocal> | undefined;
    if (!row) continue;
    if (row.isDirty || heldNow.has(id)) {
      result.skipped.push(id);
      continue;
    }
    const remote = remoteById.get(id);
    const remoteVersion = (remote as { version?: unknown } | undefined)?.version;
    const serverVersion = typeof remoteVersion === 'number' ? remoteVersion : undefined;
    if (remote === undefined || isOlderThanRow(row, serverVersion)) {
      await rows.put({ ...row, data: withAcknowledgedSyncFlag(row.data) });
      result.normalized.push(id);
      continue;
    }
    const incoming = { ...adapter.toLocalRow(remote), id } as TLocal;
    await rows.put(
      buildReplicatedRowForSet({
        tableName,
        id,
        data: withAcknowledgedSyncFlag(incoming),
        isDirty: false,
        existingRow: row,
        incomingServerVersion: serverVersion,
        now,
      })
    );
    result.refreshed.push(id);
  }
  await tx.done;
  return result;
}

/** Tables whose repair completed in this page session. */
const repairedTables = new WeakSet<object>();

/**
 * Run the repair on a table's first sync pass. Best effort: a failure must not
 * wedge sync, and leaves the table unmarked so the next pass retries.
 */
export async function repairStuckPendingFlagsOnce<TRemote, TLocal extends { id: string }>(
  table: ReplicatedTable<TLocal>,
  adapter: SyncReplicatedTableAdapter<TRemote, TLocal>
): Promise<void> {
  if (repairedTables.has(table) || !adapter.fetchRowsById) return;
  try {
    await table.repairStuckPendingFlags<TRemote>({
      ...adapter,
      fetchRowsById: adapter.fetchRowsById,
    });
    repairedTables.add(table);
  } catch {
    /* retried on the next pass */
  }
}
