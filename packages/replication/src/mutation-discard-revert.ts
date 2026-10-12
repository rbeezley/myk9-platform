import type { IDBPDatabase } from 'idb';
import { REPLICATION_STORES } from './core/DatabaseManager';
import { buildRemoteReplacementRow } from './core/ReplicatedTableConflict';
import { buildSyncedReplicatedRow } from './core/ReplicatedTableRowState';
import type { Logger } from './dependencies';
import type { PendingMutation, ReplicatedRow } from './types';

/**
 * Discard of a refused UPDATE or DELETE puts the row back to the server's state
 * (MYK9-1076). Without this the row stays dirty with the refused value, and
 * nothing replaces it: a clean server row never overwrites a dirty one, and a
 * server row that has not changed is never downloaded again.
 *
 * Two steps, both guarded so a newer local edit is never undone:
 * 1. Offline-capable local revert, to the conflict's remote copy or the dirty
 *    base, but only when that copy IS the server's state at the row's current
 *    token (`baseServerVersion === serverVersion`). An own upload acknowledged
 *    while the row stayed dirty moves the token past the base, and restoring
 *    the base would undo that accepted edit.
 * 2. Online re-fetch of the row, replacing it when nothing newer is local.
 *
 * Each step reads the row and both queues, and writes, in ONE readwrite
 * transaction (the removeOrphanedLocalOnlyRow pattern): a write another tab
 * queues for this row lands either before (and blocks the step) or after.
 * Every await inside is an IndexedDB request, so the transaction stays open.
 */

/** A row the server returned for a re-fetch, in local shape. */
export interface DiscardedRowRemote {
  data: unknown;
  serverVersion: number | undefined;
}

export interface DiscardRevertHooks {
  /** Tell the table's listeners a row changed. */
  onChanged: () => void;
  /** Fetch one row from the server; undefined when it is gone or unreadable. */
  fetchRow?: (rowId: string) => Promise<DiscardedRowRemote | undefined>;
}

/**
 * Open the transaction and decide whether anything else still names the row:
 * a newer local write (`version` moved past the discarded write's revision,
 * queued or not), or another pending or failed mutation.
 */
async function openGuarded(db: IDBPDatabase, discarded: PendingMutation) {
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
  const pending = await tx
    .objectStore(REPLICATION_STORES.PENDING_MUTATIONS)
    .index('tableName_rowId')
    .count(key);
  const failed = (await tx
    .objectStore(REPLICATION_STORES.FAILED_MUTATIONS)
    .index('tableName')
    .getAll(discarded.tableName)) as PendingMutation[];
  const otherFailed = failed.some(m => String(m.rowId) === rowId && m.id !== discarded.id);
  const newerLocalWrite = row?.isDirty === true && row.version !== discarded.rowRevision;
  return { tx, rows, row, blocked: pending > 0 || otherFailed || newerLocalWrite };
}

/** Step 1. @returns true when the row was reverted. */
export async function revertDiscardedRowWrite(
  db: IDBPDatabase,
  discarded: PendingMutation
): Promise<boolean> {
  if (discarded.operation === 'INSERT' || discarded.rowRevision === undefined) return false;
  const { tx, rows, row, blocked } = await openGuarded(db, discarded);

  const conflict = row?.conflict;
  // The copy to restore, only when it is the server's state at the row's token.
  const restored = conflict
    ? conflict.remoteServerVersion >= (row?.serverVersion ?? -Infinity)
      ? conflict.remoteData
      : undefined
    : row?.baseServerVersion !== undefined && row.baseServerVersion === row.serverVersion
      ? row.baseData
      : undefined;
  if (!row || !row.isDirty || blocked || restored === undefined) {
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
 * Step 2: replace the row with the server's copy when it is still the
 * discarded write's row (or already clean), nothing else names it, and the
 * copy is not older than the token the row holds.
 * @returns true when the row was replaced.
 */
export async function replaceDiscardedRow(
  db: IDBPDatabase,
  discarded: PendingMutation,
  remote: DiscardedRowRemote
): Promise<boolean> {
  if (discarded.rowRevision === undefined) return false;
  const { tx, rows, row, blocked } = await openGuarded(db, discarded);
  const older =
    remote.serverVersion !== undefined &&
    row?.serverVersion !== undefined &&
    remote.serverVersion < row.serverVersion;
  if (!row || blocked || older) {
    await tx.done;
    return false;
  }
  await rows.put(
    buildRemoteReplacementRow({
      tableName: discarded.tableName,
      id: String(discarded.rowId),
      remoteData: remote.data as { id: string },
      existingRow: row as ReplicatedRow<{ id: string }>,
      remoteServerVersion: remote.serverVersion,
    })
  );
  await tx.done;
  return true;
}

/** Tells the app a row changed outside a write it made, so it can refresh caches. */
function announceRowReplaced(tableName: string, rowId: string): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent('replication:discard-row-replaced', { detail: { tableName, rowId } })
  );
}

/** Tables that opted in to the Discard revert, keyed by table name. */
export class DiscardRevertRegistry {
  private readonly hooks = new Map<string, DiscardRevertHooks>();

  constructor(private readonly logger?: Logger) {}

  /** @returns an unregister function that removes only this registration. */
  register(tableName: string, hooks: DiscardRevertHooks): () => void {
    this.hooks.set(tableName, hooks);
    return () => {
      if (this.hooks.get(tableName) === hooks) this.hooks.delete(tableName);
    };
  }

  /**
   * Run both steps for a discarded mutation. The local revert is awaited; the
   * re-fetch is not (it fails quietly offline and the next sync carries on).
   */
  async afterDiscard(db: IDBPDatabase, discarded: PendingMutation): Promise<void> {
    const hooks = this.hooks.get(discarded.tableName);
    if (!hooks || discarded.operation === 'INSERT') return;
    const rowId = String(discarded.rowId);
    const changed = () => {
      hooks.onChanged();
      announceRowReplaced(discarded.tableName, rowId);
    };
    if (await revertDiscardedRowWrite(db, discarded)) changed();
    if (!hooks.fetchRow) return;
    void hooks
      .fetchRow(rowId)
      .then(async remote => {
        if (remote && (await replaceDiscardedRow(db, discarded, remote))) changed();
      })
      .catch((error: unknown) => {
        this.logger?.warn(
          `[MutationManager] Re-fetch of ${discarded.tableName}/${rowId} after Discard failed; ` +
            `the next sync brings the server's copy.`,
          error
        );
      });
  }
}
