import { unwrap, type IDBPDatabase } from 'idb';
import type { Logger } from './dependencies';
import { REPLICATION_STORES } from './core/DatabaseManager';
import { withAcknowledgedSyncFlag } from './core/ReplicatedTableRowState';
import { supersedeOlderQueuedWrites } from './mutation-supersede';
import { writtenColumnsOf, type WrittenFieldOverlay } from './mutation-written-overlay';
import type { PendingMutation, ReplicatedRow } from './types';

/**
 * Applies an upload's acknowledgement to the stored row and returns the OCC token the row
 * holds afterwards.
 *
 * MYK9-1721: the row and its queued mutations are read, and the row written, in ONE readwrite
 * transaction. Split across transactions, a local write landing between the read and the
 * write (the next switch toggled while this upload's ack was applied) was overwritten with
 * the pre-toggle copy and marked clean: the server ended right, this device wrong, at the
 * same version, so no download ever corrected it. Raw IndexedDB, with the put issued from the
 * second read's own success callback, as putStampingCurrentServerVersion does: that is the one
 * place the transaction is guaranteed active (resuming after an awaited promise is not, and
 * under fake timers the transaction had already committed).
 */
export async function markReplicatedRowSynced(
  db: IDBPDatabase,
  mutation: PendingMutation,
  newServerVersion?: number,
  overlayWritten?: WrittenFieldOverlay
): Promise<number | undefined> {
  if (mutation.operation === 'DELETE') return newServerVersion;

  const tx = (unwrap(db) as IDBDatabase).transaction(
    [REPLICATION_STORES.REPLICATED_TABLES, REPLICATION_STORES.PENDING_MUTATIONS],
    'readwrite'
  );
  let token = newServerVersion;
  // A throw inside the success callback aborts the transaction with a null error; keep the
  // original so the log names the real cause.
  let thrown: unknown;
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () =>
      reject(thrown ?? tx.error ?? new Error('Acknowledgement transaction aborted'));
    const rows = tx.objectStore(REPLICATION_STORES.REPLICATED_TABLES);
    const rowRead = rows.get([mutation.tableName, String(mutation.rowId)]);
    const queueRead = tx
      .objectStore(REPLICATION_STORES.PENDING_MUTATIONS)
      .index('tableName_rowId')
      .getAll([mutation.tableName, String(mutation.rowId)]);
    // Requests in one transaction complete in the order they were issued, so the row read has
    // succeeded by the time the queue read does.
    queueRead.onsuccess = () => {
      const existingRow = rowRead.result as ReplicatedRow<unknown> | undefined;
      try {
        // In the same transaction, so the restamp that follows the ack
        // (updateMutationServerVersions) never sees a write this one replaced.
        const queue = tx.objectStore(REPLICATION_STORES.PENDING_MUTATIONS);
        const superseded = supersedeOlderQueuedWrites(
          mutation,
          queueRead.result as PendingMutation[]
        );
        for (const id of superseded.removed) queue.delete(id);
        for (const rewritten of superseded.rewritten) queue.put(rewritten);
        if (!existingRow) return;
        const acknowledged = acknowledgedRow(
          existingRow,
          superseded.remaining,
          mutation,
          newServerVersion,
          overlayWritten
        );
        token = acknowledged.token;
        rows.put(acknowledged.row);
      } catch (error) {
        thrown = error;
        tx.abort();
      }
    };
  });
  return token;
}

/** The row an acknowledgement leaves, and the OCC token it holds. Pure. */
function acknowledgedRow(
  existingRow: ReplicatedRow<unknown>,
  pendingMutations: PendingMutation[],
  mutation: PendingMutation,
  newServerVersion: number | undefined,
  overlayWritten: WrittenFieldOverlay | undefined
): { row: ReplicatedRow<unknown>; token: number | undefined } {
  const hasAnotherPendingMutation = pendingMutations.some(
    pending => pending.id !== mutation.id && pending.authUserId === mutation.authUserId
  );
  // An uploaded INSERT is on the server now. Its `_localOnly` flag used to
  // stay until a later fetch returned the row, so counts of server-backed rows
  // skipped it and a create deleted elsewhere before that fetch was never
  // noticed; ReplicatedClassesTable.repairUnsynced would even re-insert it
  // (MYK9-775).
  const data = existingRow.data as Record<string, unknown> | null;
  const clearLocalOnly =
    mutation.operation === 'INSERT' &&
    data !== null &&
    typeof data === 'object' &&
    '_localOnly' in data;
  let nextData = existingRow.data;
  if (clearLocalOnly) {
    const uploaded = { ...(data as Record<string, unknown>) };
    delete uploaded._localOnly;
    nextData = uploaded;
  }
  const stillDirty = existingRow.isDirty && hasAnotherPendingMutation;
  // MYK9-1220: the row stays dirty for a later queued write, so its merge base
  // must now include what THIS write put on the server. Any case that cannot be
  // mapped (INSERT, baked-args RPC, no mapper, a mapper that throws) keeps the
  // base as it was.
  //
  // An acknowledgement that is not newer than the row's current base is late: a
  // sync already reconciled a newer server row (it moved the base and token
  // forward), and rebasing now would roll both back.
  let rebasedBase: unknown;
  const isLateAck =
    newServerVersion !== undefined &&
    existingRow.baseServerVersion !== undefined &&
    newServerVersion <= existingRow.baseServerVersion;
  const tokenWouldRollBack =
    newServerVersion !== undefined &&
    existingRow.serverVersion !== undefined &&
    newServerVersion < existingRow.serverVersion;
  if (
    stillDirty &&
    !isLateAck &&
    existingRow.baseData !== undefined &&
    newServerVersion !== undefined
  ) {
    const written = writtenColumnsOf(mutation);
    if (written) rebasedBase = overlayWritten?.(existingRow.baseData, written);
  }
  const row: ReplicatedRow<unknown> = {
    ...existingRow,
    data: stillDirty ? nextData : withAcknowledgedSyncFlag(nextData),
    isDirty: stillDirty,
    syncStatus: existingRow.isDirty && hasAnotherPendingMutation ? 'pending' : 'synced',
    lastSyncedAt: Date.now(),
    // A late ack never moves the token back below a version a sync already holds.
    ...(newServerVersion !== undefined &&
      !tokenWouldRollBack && { serverVersion: newServerVersion }),
    ...(rebasedBase !== undefined && {
      baseData: rebasedBase,
      baseServerVersion: newServerVersion,
    }),
    // Record the step only when this upload carried a precondition: then the
    // server held exactly `from` before it and exactly this write after it.
    ...(newServerVersion !== undefined &&
      mutation.serverVersion !== undefined && {
        lastOwnUpload: { from: mutation.serverVersion, to: newServerVersion },
      }),
  };

  // The OCC token the row holds now: the acknowledged version, or the newer one
  // a sync already reconciled when this acknowledgement is late (MYK9-1221).
  return { row, token: tokenWouldRollBack ? existingRow.serverVersion : newServerVersion };
}

/**
 * A discarded failed INSERT for a row that exists only on this device leaves
 * that `_localOnly` row behind: nothing will ever upload or remove it, and every
 * "is anything unsaved" check would count it forever. Drop the row with the
 * mutation, unless another mutation (pending or failed) still points at it.
 */
export async function removeOrphanedLocalOnlyRow(
  db: IDBPDatabase,
  discarded: PendingMutation
): Promise<boolean> {
  if (discarded.operation !== 'INSERT') return false;
  const rowId = String(discarded.rowId);
  const key = [discarded.tableName, rowId];

  // The row and both queues are read, and the row deleted, in ONE readwrite
  // transaction (the deleteRowsIfClean pattern, MYK9-922): another tab that queues
  // work for this row either commits before it (the row is kept) or after it (and
  // recreates the row itself). Every await here is an IndexedDB request: awaiting
  // anything else would let the transaction auto-commit early.
  const tx = db.transaction(
    [
      REPLICATION_STORES.REPLICATED_TABLES,
      REPLICATION_STORES.PENDING_MUTATIONS,
      REPLICATION_STORES.FAILED_MUTATIONS,
    ],
    'readwrite'
  );
  const rows = tx.objectStore(REPLICATION_STORES.REPLICATED_TABLES);
  const failed = (await tx
    .objectStore(REPLICATION_STORES.FAILED_MUTATIONS)
    .index('tableName')
    .getAll(discarded.tableName)) as PendingMutation[];
  const row = (await rows.get(key)) as ReplicatedRow<unknown> | undefined;
  const pending = await tx
    .objectStore(REPLICATION_STORES.PENDING_MUTATIONS)
    .index('tableName_rowId')
    .count(key);
  const data = row?.data as { _localOnly?: unknown } | null | undefined;
  let removed = false;
  if (row && data !== null && typeof data === 'object' && data._localOnly === true) {
    const failedForRow = failed.some(m => String(m.rowId) === rowId);
    if (pending === 0 && !failedForRow) {
      await rows.delete(key);
      removed = true;
    }
  }
  await tx.done;
  return removed;
}

export function remapDogIdReferences<T extends Record<string, unknown>>(
  data: T,
  oldDogId: string,
  newDogId: string,
  options: { replacePrimaryId?: boolean } = {}
): { data: T; changed: boolean } {
  let changed = false;
  const next: Record<string, unknown> = { ...data };

  if (options.replacePrimaryId && next.id === oldDogId) {
    next.id = newDogId;
    changed = true;
  }

  for (const field of ['dog_id', 'dogId']) {
    if (next[field] === oldDogId) {
      next[field] = newDogId;
      changed = true;
    }
  }

  return { data: next as T, changed };
}

export async function remapUploadedRpcInsertRowId(
  db: IDBPDatabase,
  logger: Logger,
  mutation: PendingMutation,
  serverRowId: string
): Promise<PendingMutation> {
  const oldRowId = String(mutation.rowId);
  const newRowId = String(serverRowId);
  if (oldRowId === newRowId) return mutation;

  if (mutation.tableName !== 'dogs') {
    throw new Error(
      `${mutation.rpc?.name ?? 'RPC'} returned row ${newRowId} for ${mutation.tableName}/${oldRowId}`
    );
  }

  const replicatedRows = (await db.getAll(REPLICATION_STORES.REPLICATED_TABLES)) as ReplicatedRow<
    Record<string, unknown>
  >[];
  const existingCanonicalDog = (await db.get(REPLICATION_STORES.REPLICATED_TABLES, [
    'dogs',
    newRowId,
  ])) as ReplicatedRow<Record<string, unknown>> | undefined;

  for (const row of replicatedRows) {
    if (row.tableName === 'dogs' && row.id === oldRowId) {
      if (!existingCanonicalDog) {
        const remapped = remapDogIdReferences(row.data, oldRowId, newRowId, {
          replacePrimaryId: true,
        });
        await db.put(REPLICATION_STORES.REPLICATED_TABLES, {
          ...row,
          id: newRowId,
          data: remapped.data,
        });
      }
      await db.delete(REPLICATION_STORES.REPLICATED_TABLES, [row.tableName, oldRowId]);
      continue;
    }

    const remapped = remapDogIdReferences(row.data, oldRowId, newRowId);
    if (remapped.changed) {
      await db.put(REPLICATION_STORES.REPLICATED_TABLES, {
        ...row,
        data: remapped.data,
      });
    }
  }

  const pendingMutations = (await db.getAll(
    REPLICATION_STORES.PENDING_MUTATIONS
  )) as PendingMutation[];
  for (const pendingMutation of pendingMutations) {
    if (pendingMutation.id === mutation.id) continue;
    if (pendingMutation.authUserId !== mutation.authUserId) continue;
    const remapped = remapDogIdReferences(pendingMutation.data, oldRowId, newRowId, {
      replacePrimaryId:
        pendingMutation.tableName === 'dogs' && String(pendingMutation.rowId) === oldRowId,
    });
    const rowIdChanged =
      pendingMutation.tableName === 'dogs' && String(pendingMutation.rowId) === oldRowId;
    if (remapped.changed || rowIdChanged) {
      await db.put(REPLICATION_STORES.PENDING_MUTATIONS, {
        ...pendingMutation,
        ...(rowIdChanged && { rowId: newRowId }),
        data: remapped.data,
      });
    }
  }

  logger.log(
    `[MutationManager] Remapped offline dog ${oldRowId} to existing server dog ${newRowId}`
  );

  const remappedMutationData = remapDogIdReferences(mutation.data, oldRowId, newRowId, {
    replacePrimaryId: true,
  });
  return {
    ...mutation,
    rowId: newRowId,
    data: remappedMutationData.data,
  };
}

/**
 * Advance a replicated row's OCC token to the authoritative server version
 * after a conflict, WITHOUT clearing its dirty/conflict state. New mutations
 * stamp `serverVersion` from this row (see ReplicatedTable.queueMutation), so
 * advancing it stops the app from regenerating writes that carry the stale
 * version — the engine behind the ringside conflict storm. The unsynced
 * optimistic edit is preserved for the user to reconcile.
 */
export async function advanceReplicatedRowServerVersion(
  db: IDBPDatabase,
  tableName: string,
  rowId: string,
  serverVersion: number
): Promise<void> {
  const key = [tableName, String(rowId)];
  const existingRow = (await db.get(REPLICATION_STORES.REPLICATED_TABLES, key)) as
    ReplicatedRow<unknown> | undefined;
  if (!existingRow) return;
  if (existingRow.serverVersion === serverVersion) return;

  await db.put(REPLICATION_STORES.REPLICATED_TABLES, {
    ...existingRow,
    serverVersion,
  });
}
