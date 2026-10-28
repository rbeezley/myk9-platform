import type { IDBPDatabase } from 'idb';
import type { Logger } from './dependencies';
import { REPLICATION_STORES } from './core/DatabaseManager';
import { withAcknowledgedSyncFlag } from './core/ReplicatedTableRowState';
import { writtenColumnsOf, type WrittenFieldOverlay } from './mutation-written-overlay';
import type { PendingMutation, ReplicatedRow } from './types';

export async function markReplicatedRowSynced(
  db: IDBPDatabase,
  mutation: PendingMutation,
  newServerVersion?: number,
  overlayWritten?: WrittenFieldOverlay,
  parkedKeepsDirty = false
): Promise<number | undefined> {
  if (mutation.operation === 'DELETE') return newServerVersion;

  const key = [mutation.tableName, String(mutation.rowId)];
  const [existingRow, pendingMutations, failedForTable] = (await Promise.all([
    db.get(REPLICATION_STORES.REPLICATED_TABLES, key),
    db.getAllFromIndex(REPLICATION_STORES.PENDING_MUTATIONS, 'tableName_rowId', [
      mutation.tableName,
      String(mutation.rowId),
    ]),
    // The failed store only indexes tableName, so filter the row in memory.
    parkedKeepsDirty
      ? db.getAllFromIndex(REPLICATION_STORES.FAILED_MUTATIONS, 'tableName', mutation.tableName)
      : [],
  ])) as [ReplicatedRow<unknown> | undefined, PendingMutation[], PendingMutation[]];

  if (!existingRow) return newServerVersion;

  // On a table whose Discard puts the server's copy back (`parkedKeepsDirty`),
  // a parked (failed) mutation is still recoverable through Retry or Discard, so
  // it keeps the row dirty exactly like a queued one: otherwise an unrelated
  // write acking would mark the row clean and a pull would overwrite the parked
  // edit (MYK9-1327). Any other table has no Discard that could clean the row
  // again, so there the ack cleans it and the next pull restores the server's
  // copy, as before.
  const hasAnotherPendingMutation =
    pendingMutations.some(
      pending => pending.id !== mutation.id && pending.authUserId === mutation.authUserId
    ) ||
    failedForTable.some(
      failed =>
        failed.id !== mutation.id &&
        String(failed.rowId) === String(mutation.rowId) &&
        failed.authUserId === mutation.authUserId
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
  await db.put(REPLICATION_STORES.REPLICATED_TABLES, {
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
    // A row kept dirty only by a parked sibling now holds a local revision the
    // server has: Discard of that sibling must not read it as unsaved work.
    ...(stillDirty &&
      mutation.rowRevision !== undefined && { acknowledgedRevision: mutation.rowRevision }),
    // Record the step only when this upload carried a precondition: then the
    // server held exactly `from` before it and exactly this write after it.
    ...(newServerVersion !== undefined &&
      mutation.serverVersion !== undefined && {
        lastOwnUpload: { from: mutation.serverVersion, to: newServerVersion },
      }),
  });
  // The OCC token the row holds now: the acknowledged version, or the newer one
  // a sync already reconciled when this acknowledgement is late (MYK9-1221).
  return tokenWouldRollBack ? existingRow.serverVersion : newServerVersion;
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
