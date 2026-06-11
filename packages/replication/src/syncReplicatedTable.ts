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

  /**
   * Server-side `updated_at` for a fetched remote row, as epoch milliseconds
   * (or null/undefined when the row carries no usable timestamp). When provided,
   * the engine advances the incremental watermark to the maximum value actually
   * observed from the server — never the client's wall clock — which eliminates
   * the clock-skew and round-trip-race classes of silently dropped rows. Omit to
   * keep the legacy client-clock (`Date.now()`) watermark behavior.
   *
   * Returning a non-finite number / null for a row means "do not advance the
   * watermark past this row"; the row is still cached as data, only excluded
   * from the watermark max so a bad timestamp can't poison it.
   */
  getRemoteUpdatedAt?(remote: TRemote): number | null | undefined;

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

/** Default self-heal interval: force a full re-sync if the last full sync is
 *  older than this. Catches any residual watermark drift within a day even if an
 *  unforeseen path slips past the server-authoritative watermark. */
const DEFAULT_FULL_SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000;

export interface SyncReplicatedTableOptions extends Partial<SyncOptions> {
  uploadPendingMutations?: () => Promise<unknown>;
  incrementalBufferMs?: number;
  /** Force a full re-sync when the last full sync is older than this many ms.
   *  Self-heals a partially-stale replica that incremental sync would otherwise
   *  never re-fetch (forceFullSync alone only fires on a fully empty replica).
   *  Default {@link DEFAULT_FULL_SYNC_INTERVAL_MS} (24h). */
  fullSyncIntervalMs?: number;
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
    // Snapshot metadata BEFORE the 'syncing' write below. A partial
    // updateSyncMetadata does not preserve `totalRows`, so reading after the
    // status write would lose the previous row count needed to detect an
    // unexpected empty-replica recovery. `lastIncrementalSyncAt` / `lastFullSyncAt`
    // are preserved either way, so this snapshot is equivalent for them.
    const metadata = await table.getSyncMetadata();

    await table.updateSyncMetadata({ syncStatus: 'syncing', errorMessage: undefined });

    if (!options.skipMutationUpload && options.uploadPendingMutations) {
      await options.uploadPendingMutations();
    }

    const localRows = await getLocalRowsForScope();

    // Periodic self-heal. The server-authoritative watermark below removes the
    // systemic drop, but a *partially* stale replica (most rows present, a few
    // missing) would never re-run a full sync on its own — `forceFullSync` would
    // otherwise only fire on a fully empty replica. Force a full sync when the
    // last full sync is older than the staleness window. Guarded on `> 0` so a
    // never-full-synced table (lastFullSyncAt = 0) does NOT force-full every tick.
    const fullSyncIntervalMs = options.fullSyncIntervalMs ?? DEFAULT_FULL_SYNC_INTERVAL_MS;
    const lastFullSyncAt = metadata?.lastFullSyncAt || 0;
    const fullSyncStale = lastFullSyncAt > 0 && Date.now() - lastFullSyncAt > fullSyncIntervalMs;

    const forceFullSync =
      options.forceFullSync === true || localRows.length === 0 || fullSyncStale;

    // Observability: a full sync triggered by an empty local replica that metadata
    // says previously held rows is an unexpected eviction/heal — the silent failure
    // mode this engine guards against. Surfaced on the result so callers can log it
    // (the engine itself stays logger-free).
    const recoveredFromEmptyReplica =
      localRows.length === 0 && (metadata?.totalRows ?? 0) > 0;

    // Finite-guard the persisted watermark: a corrupt IDB value (NaN/Infinity)
    // would otherwise reach `new Date(since).toISOString()` in the adapter and
    // throw a RangeError, wedging that table's sync. NaN is already falsy (→ 0);
    // this also catches Infinity. A bad watermark degrades to a full-ish fetch,
    // never a thrown sync.
    const persistedWatermark = metadata?.lastIncrementalSyncAt;
    const safeWatermark = Number.isFinite(persistedWatermark) ? (persistedWatermark as number) : 0;
    const rawSince = forceFullSync ? 0 : safeWatermark;
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

    // Track the max server `updated_at` actually observed this fetch. This — not
    // the client clock — becomes the next incremental watermark.
    let maxRemoteUpdatedAt = 0;
    let sawRemoteTimestamp = false;

    for (const remote of remoteRows) {
      const id = String(adapter.getRemoteId(remote));
      serverIds.add(id);

      if (adapter.getRemoteUpdatedAt) {
        const ts = adapter.getRemoteUpdatedAt(remote);
        // NaN/null guard: a row with no usable server timestamp is still cached as
        // data below, but must never enter the watermark max — Math.max(NaN, …) is
        // NaN, and new Date(NaN).toISOString() throws on the next fetch, breaking
        // every subsequent sync.
        if (typeof ts === 'number' && Number.isFinite(ts)) {
          if (ts > maxRemoteUpdatedAt) maxRemoteUpdatedAt = ts;
          sawRemoteTimestamp = true;
        }
      }

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

    // Server-authoritative, monotonic watermark. Advance only to a timestamp the
    // client has actually received from the server, and never backward (a backdated
    // row or out-of-order delivery must not widen the window). Fall back to the
    // legacy client clock ONLY when the adapter provides no timestamp hook.
    // When the adapter supplies server timestamps and we observed at least one,
    // advance the persisted watermark monotonically INSIDE the cache transaction
    // (max against the LIVE value, not this sync's stale pre-fetch snapshot) so a
    // concurrent sync of the same table cannot regress it. With no hook, keep the
    // legacy client-clock last-write-wins behavior. With a hook but nothing
    // observed (empty fetch), leave the watermark untouched.
    const advanceWatermark = Boolean(adapter.getRemoteUpdatedAt) && sawRemoteTimestamp;
    const watermarkUpdate: Partial<{ lastIncrementalSyncAt: number }> = advanceWatermark
      ? { lastIncrementalSyncAt: maxRemoteUpdatedAt }
      : adapter.getRemoteUpdatedAt
        ? {}
        : { lastIncrementalSyncAt: Date.now() };

    await table.updateSyncMetadata(
      {
        ...watermarkUpdate,
        // Record full-sync completions so the 24h self-heal (above) has a baseline.
        ...(forceFullSync ? { lastFullSyncAt: Date.now() } : {}),
        syncStatus: 'idle',
        errorMessage: undefined,
        conflictCount: conflictsResolved,
        totalRows: (await getLocalRowsForScope()).length,
      },
      { advanceWatermarkMonotonically: advanceWatermark }
    );

    return {
      tableName: table.getTableName(),
      success: true,
      operation: forceFullSync ? 'full-sync' : 'incremental-sync',
      rowsAffected,
      conflictsResolved,
      duration: Date.now() - startedAt,
      since,
      recoveredFromEmptyReplica,
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
