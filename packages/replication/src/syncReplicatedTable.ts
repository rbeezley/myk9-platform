import type { ReplicatedTable } from './core/ReplicatedTable';
import type { SyncOptions, SyncResult } from './types';

export interface SyncScope {
  /**
   * Domain-specific scope for this sync, such as a myK9Q license key or a
   * myK9Show Show ID. The adapter decides how to apply it.
   */
  value?: string;
}

export interface RemoteFetchContext<TLocal extends { id: string }> {
  scope: SyncScope;
  since: number;
  localRows: TLocal[];
  forceFullSync: boolean;
}

export interface SyncReplicatedTableAdapter<TRemote, TLocal extends { id: string }> {
  fetchRemoteRows(context: RemoteFetchContext<TLocal>): Promise<TRemote[]>;
  getRemoteId(remote: TRemote): string;
  toLocalRow(remote: TRemote): TLocal;
  resolveConflict?: (local: TLocal, remote: TLocal) => TLocal;

  /**
   * Opt into merging server-authoritative fields into a dirty row. Omit this to
   * preserve dirty local rows exactly until their pending mutation succeeds.
   */
  mergeDirtyRow?: (local: TLocal, remote: TLocal) => TLocal;

  shouldSkipRemoteRow?: (remote: TRemote, context: { local: TLocal | null }) => boolean;
  shouldCleanupStaleRows?: boolean;
}

export interface SyncReplicatedTableOptions extends Partial<SyncOptions> {
  uploadPendingMutations?: () => Promise<unknown>;
  incrementalBufferMs?: number;
}

export async function syncReplicatedTable<TRemote, TLocal extends { id: string }>(
  table: ReplicatedTable<TLocal>,
  adapter: SyncReplicatedTableAdapter<TRemote, TLocal>,
  scope: SyncScope = {},
  options: SyncReplicatedTableOptions = {}
): Promise<SyncResult> {
  const startedAt = Date.now();
  let rowsAffected = 0;
  let conflictsResolved = 0;

  try {
    await table.updateSyncMetadata({ syncStatus: 'syncing', errorMessage: undefined });

    if (!options.skipMutationUpload && options.uploadPendingMutations) {
      await options.uploadPendingMutations();
    }

    const metadata = await table.getSyncMetadata();
    const localRows = await table.getAll(scope.value);
    const forceFullSync = options.forceFullSync === true || localRows.length === 0;
    const rawSince = forceFullSync ? 0 : metadata?.lastIncrementalSyncAt || 0;
    const since =
      rawSince > (options.incrementalBufferMs ?? 0)
        ? rawSince - (options.incrementalBufferMs ?? 0)
        : 0;

    const remoteRows = await adapter.fetchRemoteRows({
      scope,
      since,
      localRows,
      forceFullSync,
    });

    const serverIds = new Set<string>();
    const cleanRowsToCache: TLocal[] = [];

    for (const remote of remoteRows) {
      const id = String(adapter.getRemoteId(remote));
      serverIds.add(id);

      const existing = await table.getReplicatedRow(id);
      const remoteLocal = { ...adapter.toLocalRow(remote), id } as TLocal;
      const local = existing?.data ?? null;

      if (adapter.shouldSkipRemoteRow?.(remote, { local })) {
        continue;
      }

      if (existing?.isDirty) {
        if (adapter.mergeDirtyRow) {
          const merged = adapter.mergeDirtyRow(existing.data, remoteLocal);
          await table.set(id, { ...merged, id } as TLocal, true);
          rowsAffected++;
          conflictsResolved++;
        }
        continue;
      }

      const nextRow = local
        ? adapter.resolveConflict?.(local, remoteLocal) ?? remoteLocal
        : remoteLocal;

      if (local) {
        conflictsResolved++;
      }

      cleanRowsToCache.push({ ...nextRow, id } as TLocal);
      rowsAffected++;
    }

    if (cleanRowsToCache.length > 0) {
      await table.batchSet(cleanRowsToCache);
    }

    if (adapter.shouldCleanupStaleRows) {
      rowsAffected += await table.removeStaleEntries(serverIds);
    }

    await table.updateSyncMetadata({
      lastIncrementalSyncAt: Date.now(),
      syncStatus: 'idle',
      errorMessage: undefined,
      conflictCount: conflictsResolved,
      totalRows: (await table.getAll(scope.value)).length,
    });

    return {
      tableName: table.getTableName(),
      success: true,
      operation: forceFullSync ? 'full-sync' : 'incremental-sync',
      rowsAffected,
      conflictsResolved,
      duration: Date.now() - startedAt,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await table.updateSyncMetadata({
      syncStatus: 'error',
      errorMessage: message,
    });

    return {
      tableName: table.getTableName(),
      success: false,
      operation: options.forceFullSync ? 'full-sync' : 'incremental-sync',
      rowsAffected,
      conflictsResolved,
      duration: Date.now() - startedAt,
      error: message,
    };
  }
}
