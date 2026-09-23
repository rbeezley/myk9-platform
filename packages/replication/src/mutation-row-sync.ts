import type { IDBPDatabase } from 'idb';
import type { Logger } from './dependencies';
import { REPLICATION_STORES } from './core/DatabaseManager';
import type { PendingMutation, ReplicatedRow } from './types';

export async function markReplicatedRowSynced(
  db: IDBPDatabase,
  mutation: PendingMutation,
  newServerVersion?: number
): Promise<void> {
  if (mutation.operation === 'DELETE') return;

  const key = [mutation.tableName, String(mutation.rowId)];
  const [existingRow, pendingMutations] = (await Promise.all([
    db.get(REPLICATION_STORES.REPLICATED_TABLES, key),
    db.getAllFromIndex(REPLICATION_STORES.PENDING_MUTATIONS, 'tableName_rowId', [
      mutation.tableName,
      String(mutation.rowId),
    ]),
  ])) as [ReplicatedRow<unknown> | undefined, PendingMutation[]];

  if (!existingRow) return;

  const hasAnotherPendingMutation = pendingMutations.some(
    pending => pending.id !== mutation.id && pending.authUserId === mutation.authUserId
  );
  await db.put(REPLICATION_STORES.REPLICATED_TABLES, {
    ...existingRow,
    isDirty: existingRow.isDirty && hasAnotherPendingMutation,
    syncStatus: existingRow.isDirty && hasAnotherPendingMutation ? 'pending' : 'synced',
    lastSyncedAt: Date.now(),
    ...(newServerVersion !== undefined && { serverVersion: newServerVersion }),
  });
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
