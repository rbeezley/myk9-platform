import type { ReplicatedTable } from './core/ReplicatedTable';
import type { ReplicationConflictSnapshot, SyncOptions, SyncResult } from './types';
import { detectDirtyRowConflict } from './conflict/detectDirtyRowConflict';

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
  filterLocalRows?: (rows: TLocal[], scope: SyncScope) => TLocal[];
  resolveConflict?: (local: TLocal, remote: TLocal) => TLocal;

  /**
   * Opt into merging server-authoritative fields into a dirty row. Omit this to
   * preserve dirty local rows exactly until their pending mutation succeeds.
   */
  mergeDirtyRow?: (local: TLocal, remote: TLocal) => TLocal;

  shouldSkipRemoteRow?: (remote: TRemote, context: { local: TLocal | null }) => boolean;
  shouldCleanupStaleRows?: boolean;
  afterSuccessfulSync?: (context: {
    scope: SyncScope;
    serverIds: Set<string>;
    localRows: TLocal[];
  }) => Promise<void> | void;
}

export interface SyncReplicatedTableOptions extends Partial<SyncOptions> {
  uploadPendingMutations?: () => Promise<unknown>;
  incrementalBufferMs?: number;
  /** Phase 4 kill switch (docs/plan-show-presence.md §12). When false (default),
   *  same-field collisions are silently resolved last-write-wins, matching the
   *  pre-Phase-4 behavior exactly. Flip to true to surface conflicts as
   *  `replication:conflict` events instead.
   *
   *  Per-call override takes precedence over `configureConflictSurfacing()`. */
  conflictSurfacingEnabled?: boolean;
}

/**
 * Module-level Phase 4 kill switch — set once at app startup via
 * `configureConflictSurfacing(true)`. Individual `syncReplicatedTable` call-sites
 * can still override with the per-call `conflictSurfacingEnabled` option.
 *
 * @see configureConflictSurfacing
 */
let _conflictSurfacingEnabled = false;

/**
 * Configure whether same-field collisions are surfaced globally.
 * Call this once during app boot (e.g. in ReplicationSyncProvider) after reading
 * the app-level feature flag. Prefer the per-call option in tests.
 */
export function configureConflictSurfacing(enabled: boolean): void {
  _conflictSurfacingEnabled = enabled;
}

/** Reset to default (false). For test cleanup only. */
export function _resetConflictSurfacingForTests(): void {
  _conflictSurfacingEnabled = false;
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

  const getLocalRowsForScope = async (): Promise<TLocal[]> => {
    const rows = await table.getAll(adapter.filterLocalRows ? undefined : scope.value);
    return adapter.filterLocalRows ? adapter.filterLocalRows(rows, scope) : rows;
  };

  try {
    await table.updateSyncMetadata({ syncStatus: 'syncing', errorMessage: undefined });

    if (!options.skipMutationUpload && options.uploadPendingMutations) {
      await options.uploadPendingMutations();
    }

    const metadata = await table.getSyncMetadata();
    const localRows = await getLocalRowsForScope();
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
        // Phase 4: detect same-field collisions when the flag is on and we have a
        // clean base snapshot to diff against. If fields overlap → surface the
        // conflict; the row is held dirty and the user must reconcile. Non-overlapping
        // fields fall through to mergeDirtyRow as before.
        const surfaceConflicts = options.conflictSurfacingEnabled ?? _conflictSurfacingEnabled;
        if (surfaceConflicts && existing.baseData !== undefined) {
          const detection = detectDirtyRowConflict({
            base: existing.baseData,
            local: existing.data,
            remote: remoteLocal,
          });
          if (detection.hasConflict) {
            const snapshot: ReplicationConflictSnapshot<TLocal> = {
              tableName: table.getTableName(),
              rowId: id,
              fields: detection.fields,
              localData: existing.data,
              remoteData: remoteLocal,
              baseData: existing.baseData,
              baseVersion: existing.baseVersion ?? 0,
              localVersion: existing.version,
              detectedAt: Date.now(),
            };
            await table.markConflict(id, snapshot);
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('replication:conflict', { detail: snapshot }));
            }
            rowsAffected++;
            continue;
          }
        }

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

    await adapter.afterSuccessfulSync?.({ scope, serverIds, localRows });

    await table.updateSyncMetadata({
      lastIncrementalSyncAt: Date.now(),
      syncStatus: 'idle',
      errorMessage: undefined,
      conflictCount: conflictsResolved,
      totalRows: (await getLocalRowsForScope()).length,
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
