import type { ReplicatedTable } from './core/ReplicatedTable';
import type { ReplicationConflictSnapshot, SyncOptions, SyncResult } from './types';
import { detectDirtyRowConflict } from './conflict/detectDirtyRowConflict';
import {
  configureConflictSurfacing as _configureConflictSurfacing,
  isConflictSurfacingEnabled,
  _resetConflictSurfacingForTests as _resetForTests,
} from './conflictConfig';

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
 * Configure whether same-field collisions are surfaced globally.
 * Call this once during app boot (e.g. in ReplicationSyncProvider) after reading
 * the app-level feature flag. Prefer the per-call option in tests.
 *
 * Also gates the OCC upload precondition — when false, UPDATE mutations carry no
 * version WHERE clause, preserving last-write-wins behavior end-to-end.
 */
export function configureConflictSurfacing(enabled: boolean): void {
  _configureConflictSurfacing(enabled);
}

/** Reset to default (false). For test cleanup only. */
export function _resetConflictSurfacingForTests(): void {
  _resetForTests();
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

    // Read the watermark for THIS scope. A table synced under multiple scopes
    // (e.g. entries: global '' from the provider AND per-show from show-day pages)
    // keeps an independent watermark per scope, so one scope's advance can't push
    // another's `since` past unsynced rows. See ScopeSyncState in types.ts.
    const metadata = await table.getSyncMetadata(scope.value);
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
    // Collect clean rows for a single bulk IDB transaction (batchSet perf path).
    const cleanRowsToCache: TLocal[] = [];
    const serverVersionMap = new Map<string, number>();

    for (const remote of remoteRows) {
      const id = String(adapter.getRemoteId(remote));
      serverIds.add(id);

      const existing = await table.getReplicatedRow(id);
      const remoteLocal = { ...adapter.toLocalRow(remote), id } as TLocal;
      const local = existing?.data ?? null;
      // Extract the server-side `version` column before toLocalRow() strips it.
      // Stored as serverVersion on the IDB row so the next offline UPDATE can
      // carry an OCC precondition (WHERE version = remoteServerVersion).
      const remoteServerVersion = (remote as Record<string, unknown>).version as
        | number
        | undefined;

      if (adapter.shouldSkipRemoteRow?.(remote, { local })) {
        continue;
      }

      if (existing?.isDirty) {
        // Phase 4: detect same-field collisions when the flag is on and we have a
        // clean base snapshot to diff against. If fields overlap → surface the
        // conflict; the row is held dirty and the user must reconcile. Non-overlapping
        // fields fall through to mergeDirtyRow as before.
        const surfaceConflicts = options.conflictSurfacingEnabled ?? isConflictSurfacingEnabled();
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
              remoteServerVersion: remoteServerVersion ?? 0,
              detectedAt: Date.now(),
            };
            const marked = await table.markConflict(id, snapshot);
            if (marked) {
              if (typeof window !== 'undefined') {
                window.dispatchEvent(
                  new CustomEvent('replication:conflict', { detail: snapshot })
                );
              }
              conflictsResolved++;
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

      // Collect for bulk IDB write; remoteServerVersion is stored on the row so
      // the next offline UPDATE can carry the OCC precondition.
      cleanRowsToCache.push({ ...nextRow, id } as TLocal);
      if (remoteServerVersion !== undefined) {
        serverVersionMap.set(id, remoteServerVersion);
      }
      rowsAffected++;
    }

    if (cleanRowsToCache.length > 0) {
      await table.batchSet(
        cleanRowsToCache,
        serverVersionMap.size > 0 ? serverVersionMap : undefined
      );
    }

    if (adapter.shouldCleanupStaleRows) {
      rowsAffected += await table.removeStaleEntries(serverIds);
    }

    await adapter.afterSuccessfulSync?.({ scope, serverIds, localRows });

    // Persist the advanced watermark + row count under THIS scope; syncStatus,
    // errorMessage and conflictCount remain table-global.
    await table.updateSyncMetadata(
      {
        lastIncrementalSyncAt: Date.now(),
        syncStatus: 'idle',
        errorMessage: undefined,
        conflictCount: conflictsResolved,
        totalRows: (await getLocalRowsForScope()).length,
      },
      scope.value
    );

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
