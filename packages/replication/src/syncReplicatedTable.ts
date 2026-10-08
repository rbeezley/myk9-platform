import type { ReplicatedTable } from './core/ReplicatedTable';
import type { SyncOptions, SyncResult } from './types';
import { reconcileDirtyRemoteRow } from './reconcileDirtyRemoteRow';
import { countCoveredRows, staleCleanupKeepIds, getCoveredRemoteIds } from './replicaCoverage';
import {
  configureConflictSurfacing as _configureConflictSurfacing,
  isConflictSurfacingEnabled,
  _resetConflictSurfacingForTests as _resetForTests,
} from './conflictConfig';

import type { SyncScope, SyncReplicatedTableAdapter } from './syncReplicatedTable.types';
export type {
  SyncScope,
  RemoteFetchContext,
  RemoteRowCountContext,
  SyncReplicatedTableAdapter,
} from './syncReplicatedTable.types';

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
  let uploadError: string | undefined;

  const getLocalRowsForScope = async (): Promise<TLocal[]> => {
    // MYK9-774: getAllOrThrow, not getAll. These rows decide full vs
    // incremental, which rows stale cleanup keeps, and the totalRows recorded
    // for the scope; a failed device read answered as [] would record an empty
    // scope as synced. A throw fails this sync instead.
    const rows = await table.getAllOrThrow(adapter.filterLocalRows ? undefined : scope.value);
    return adapter.filterLocalRows ? adapter.filterLocalRows(rows, scope) : rows;
  };

  try {
    // Snapshot metadata BEFORE the 'syncing' write below, scoped to this sync's
    // scope.value so `since` is derived from the correct per-scope watermark. A
    // partial updateSyncMetadata does not preserve scope coverage metadata, so
    // reading after the status write would lose the prior counts needed to
    // detect an unexpected replica recovery.
    const metadata = await table.getSyncMetadata(scope.value);

    await table.updateSyncMetadata({ syncStatus: 'syncing', errorMessage: undefined });

    if (!options.skipMutationUpload && options.uploadPendingMutations) {
      // A crashed upload pass now rejects instead of masquerading as an empty
      // queue. Don't let that abort the download phase — dirty local rows are
      // protected from clobber by reconcileDirtyRow, and a fresh download is
      // exactly what a wedged client needs. But DON'T discard the failure: a
      // download-only success would otherwise read as fully healthy while
      // pending writes stay unsynced (Codex review, P2). Retain it on the
      // result via `uploadError` so callers can distinguish the two. The pass
      // already logged the error (this engine stays logger-free).
      try {
        await options.uploadPendingMutations();
      } catch (error) {
        uploadError = error instanceof Error ? error.message : String(error);
      }
    }

    const localRows = await getLocalRowsForScope();

    const rawExpectedRemoteRows = await adapter.getRemoteRowCount?.({ scope });
    const expectedRemoteRows =
      typeof rawExpectedRemoteRows === 'number' &&
      Number.isFinite(rawExpectedRemoteRows) &&
      rawExpectedRemoteRows >= 0
        ? Math.floor(rawExpectedRemoteRows)
        : undefined;
    // After the count: a DELETE that lands in between then reads short, never over.
    const pendingDeleteIds = await adapter.getPendingDeleteIds?.({ scope }).catch(() => undefined);

    // Periodic self-heal. The server-authoritative watermark below removes the
    // systemic drop, but a *partially* stale replica (most rows present, a few
    // missing) would never re-run a full sync on its own — `forceFullSync` would
    // otherwise only fire on a fully empty replica. Force a full sync when the
    // last full sync is older than the staleness window. Guarded on `> 0` so a
    // never-full-synced table (lastFullSyncAt = 0) does NOT force-full every tick.
    const fullSyncIntervalMs = options.fullSyncIntervalMs ?? DEFAULT_FULL_SYNC_INTERVAL_MS;
    const lastFullSyncAt = metadata?.lastFullSyncAt || 0;
    const fullSyncStale = lastFullSyncAt > 0 && Date.now() - lastFullSyncAt > fullSyncIntervalMs;

    // Compare the server count with the rows this device accounts for: never a
    // pending local create (MYK9-752), always a pending delete (MYK9-762).
    const partialReplica =
      expectedRemoteRows !== undefined &&
      countCoveredRows(localRows, pendingDeleteIds) < expectedRemoteRows;
    // More server-backed rows here than on the server: something was deleted
    // there. Only acted on when a full sync can clean it up (MYK9-775).
    const overReplica =
      adapter.cleanupStaleRowsOnFullSync === true &&
      expectedRemoteRows !== undefined &&
      countServerBackedRows(localRows) > expectedRemoteRows;
    const forceFullSync =
      options.forceFullSync === true ||
      localRows.length === 0 ||
      partialReplica ||
      overReplica ||
      fullSyncStale;

    // Observability: a full sync triggered by an empty local replica that metadata
    // says previously held rows is an unexpected eviction/heal — the silent failure
    // mode this engine guards against. Prefer server coverage when available; the
    // local count is retained as a legacy fallback for older metadata.
    const recoveredFromEmptyReplica =
      localRows.length === 0 && (metadata?.expectedRemoteRows ?? metadata?.totalRows ?? 0) > 0;

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

    const fetchStartedAt = Date.now();
    const remoteRows = await adapter.fetchRemoteRows({
      scope,
      since,
      localRows,
      forceFullSync,
    });

    const serverIds = new Set<string>();
    const coveredServerIds = getCoveredRemoteIds(remoteRows, adapter);
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
      const remoteServerVersion = (remote as Record<string, unknown>).version as number | undefined;

      if (adapter.shouldSkipRemoteRow?.(remote, { local })) {
        continue;
      }

      if (existing?.isDirty) {
        // Phase 4: detect same-field collisions when the flag is on and we have a
        // clean base snapshot to diff against. If fields overlap → surface the
        // conflict; the row is held dirty and the user must reconcile. Non-overlapping
        // fields are reconciled below (merge untouched server fields + advance token).
        const surfaceConflicts = options.conflictSurfacingEnabled ?? isConflictSurfacingEnabled();
        if (surfaceConflicts && existing.baseData !== undefined) {
          // Same-field collision → marked for the user; otherwise untouched server
          // fields merge in and the OCC token (row and queue) advances.
          const outcome = await reconcileDirtyRemoteRow(table, adapter, {
            id,
            existing: { ...existing, baseData: existing.baseData },
            remoteLocal,
            remoteServerVersion,
          });
          if (outcome.conflict || outcome.changed) rowsAffected++;
          if (outcome.changed) conflictsResolved++;
          continue;
        }

        // Flag off OR no base snapshot to diff against: legacy behavior. Let an
        // adapter merge server-authoritative fields (last-write-wins); otherwise the
        // dirty row is preserved untouched until its pending mutation uploads. No OCC
        // token exists in this path (it is only captured when surfacing is on), so
        // there is nothing to advance.
        if (adapter.mergeDirtyRow) {
          const merged = adapter.mergeDirtyRow(existing.data, remoteLocal);
          await table.set(id, { ...merged, id } as TLocal, true);
          rowsAffected++;
          conflictsResolved++;
        }
        continue;
      }

      const nextRow = local
        ? (adapter.resolveConflict?.(local, remoteLocal) ?? remoteLocal)
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
    }

    if (cleanRowsToCache.length > 0) {
      // Only rows whose content differs count: the overlap window re-delivers
      // rows already held, and those are not a change (MYK9-1054).
      rowsAffected += await table.batchSet(
        cleanRowsToCache,
        serverVersionMap.size > 0 ? serverVersionMap : undefined
      );
    }

    // MYK9-880: a zero-row fetch is not proof of an empty scope. The count and
    // the fetch share one RLS, so an RLS gap returns 0 and 0 -- "complete".
    // Over a warm replica that needs independent proof; otherwise skip cleanup.
    const scopeEmptyIsProven = async (): Promise<boolean> => {
      if (serverIds.size > 0 || countServerBackedRows(localRows) === 0) return true;
      try {
        return (await adapter.verifyScopeEmpty?.({ scope })) === true;
      } catch {
        return false;
      }
    };

    let staleCleanupCompleted = false;
    if (adapter.shouldCleanupStaleRows) {
      rowsAffected += await table.removeStaleEntries(serverIds);
      staleCleanupCompleted = true;
    } else if (
      adapter.cleanupStaleRowsOnFullSync &&
      forceFullSync &&
      // Only a fetch known to be COMPLETE proves a row is gone: a capped or
      // paged response (PostgREST max_rows) returns the oldest rows only, and
      // cleaning up after it would delete the newest (MYK9-775 review P2). No
      // server count, no cleanup.
      expectedRemoteRows !== undefined &&
      coveredServerIds.size >= expectedRemoteRows &&
      (await scopeEmptyIsProven())
    ) {
      const keep = await staleCleanupKeepIds(table, serverIds, await getLocalRowsForScope());
      if (keep) {
        rowsAffected += await table.removeStaleEntries(keep, { syncedBefore: fetchStartedAt });
        staleCleanupCompleted = true;
      }
    }

    await adapter.afterSuccessfulSync?.({ scope, serverIds, localRows, staleCleanupCompleted });

    // Server-authoritative, monotonic watermark, routed to the correct scope slot.
    // Advance only to a timestamp the client actually observed from the server, and
    // never backward (monotonic inside the cache transaction so a concurrent slow
    // sync can't regress a faster one). Fall back to the legacy client clock ONLY
    // when the adapter provides no timestamp hook. With a hook but nothing observed
    // (empty fetch), leave the watermark untouched.
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
        ...(expectedRemoteRows !== undefined ? { expectedRemoteRows } : {}),
      },
      { scopeValue: scope.value, advanceWatermarkMonotonically: advanceWatermark }
    );

    // An incremental fetch can hide a deletion behind an equal count (one row
    // deleted and one added since the last sync): the pre-fetch check saw the
    // counts agree. After merging the new row the device holds MORE than the
    // server counts, so run the full fetch and cleanup now, in this sync, rather
    // than leave the deleted row until the next one (MYK9-775, Codex P2).
    // Bounded: the re-run is already a full sync, so it cannot recurse.
    if (
      adapter.cleanupStaleRowsOnFullSync &&
      !forceFullSync &&
      expectedRemoteRows !== undefined &&
      countServerBackedRows(await getLocalRowsForScope()) > expectedRemoteRows
    ) {
      const full = await syncReplicatedTable(table, adapter, scope, {
        ...options,
        forceFullSync: true,
        skipMutationUpload: true,
      });
      // One sync to the caller: keep this pass's work and any upload failure
      // (the re-run skips the upload, so it cannot report one itself).
      return {
        ...full,
        rowsAffected: rowsAffected + full.rowsAffected,
        conflictsResolved: conflictsResolved + (full.conflictsResolved ?? 0),
        duration: Date.now() - startedAt,
        ...(uploadError ? { uploadError } : {}),
      };
    }

    return {
      tableName: table.getTableName(),
      success: true,
      operation: forceFullSync ? 'full-sync' : 'incremental-sync',
      rowsAffected,
      conflictsResolved,
      duration: Date.now() - startedAt,
      since,
      recoveredFromEmptyReplica,
      ...(uploadError ? { uploadError } : {}),
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
      // A download-phase failure must not erase a prior upload-phase failure —
      // both are real and independently actionable (Codex review, P2 follow-up).
      ...(uploadError ? { uploadError } : {}),
    };
  }
}

/** Rows the server already holds: everything but pending local creates. */
export function countServerBackedRows(rows: readonly object[]): number {
  return rows.filter(row => (row as { _localOnly?: unknown })._localOnly !== true).length;
}
