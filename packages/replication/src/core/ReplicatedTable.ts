/**
 * ReplicatedTable - Generic Base Class for Table Replication
 *
 * Provides CRUD operations with automatic caching, sync, and conflict resolution.
 * All table-specific implementations extend this class.
 *
 * Features:
 * - Offline-first data access
 * - Automatic cache management with TTL
 * - Optimistic updates with version tracking
 * - Subscription-based reactive updates
 * - LRU/LFU cache eviction
 */

import type { IDBPDatabase, IDBPObjectStore } from 'idb';
import type {
  ReplicatedRow,
  ReplicationConflictResolution,
  ReplicationConflictSnapshot,
  SyncMetadata,
  SyncResult,
  SyncOptions,
  CacheStats,
} from '../types';
import type { Logger, GetTableTTL, ReplicatedTableDependencies } from '../dependencies';
import { noopLogger, defaultGetTableTTL } from '../dependencies';
import type { MutationManager } from '../MutationManager';
import { MAX_OPTIMISTIC_UPDATE_RETRIES } from '../constants';

import { databaseManager, REPLICATION_STORES, trackTransaction } from './DatabaseManager';
import { ReplicatedTableCacheManager } from './ReplicatedTableCache';
import { ReplicatedTableBatchManager } from './ReplicatedTableBatch';
import { ReplicatedTableQueryManager } from './ReplicatedTableQuery';
import { RowLockRegistry } from './RowLockRegistry';
import {
  applyConflictSnapshot,
  buildRemoteReplacementRow,
  clearConflictSnapshot,
  getConflictSnapshots,
} from './ReplicatedTableConflict';
import {
  buildReconciledDirtyRow,
  buildReplicatedRowForSet,
  buildSyncedReplicatedRow,
  selectStaleCleanRows,
} from './ReplicatedTableRowState';
import { mergeNonConflictingServerFields } from '../conflict/detectDirtyRowConflict';
import { isConflictSurfacingEnabled } from '../conflictConfig';
import { withQuotaEviction } from '../quota-eviction';

/**
 * Fraction of a table's current footprint to retain when relieving storage
 * quota pressure — evict roughly the remaining 30% (oldest/least-used first).
 */
const QUOTA_EVICTION_RETAIN_FRACTION = 0.7;

// Re-export REPLICATION_STORES for backward compatibility
export { REPLICATION_STORES } from './DatabaseManager';

/**
 * Generic replicated table base class
 *
 * @template T - Type of the table row (must have an 'id' field)
 */
export abstract class ReplicatedTable<T extends { id: string }> {
  protected db: IDBPDatabase | null = null;
  protected ttl: number;

  /** Injected dependencies */
  protected readonly logger: Logger;
  private readonly getTableTTLFn: GetTableTTL;

  /** Extracted cache manager */
  private cacheManager: ReplicatedTableCacheManager<T>;

  /** Extracted batch manager */
  private batchManager: ReplicatedTableBatchManager<T>;

  /** Extracted row lock registry */
  private rowLocks: RowLockRegistry;

  /** Extracted query manager */
  private queryManager: ReplicatedTableQueryManager<T>;

  constructor(
    protected tableName: string,
    customTTL?: number,
    dependencies: ReplicatedTableDependencies = {}
  ) {
    // Inject dependencies with defaults
    this.logger = dependencies.logger ?? noopLogger;
    this.getTableTTLFn = dependencies.getTableTTL ?? defaultGetTableTTL;

    // Set TTL using injected function
    this.ttl = customTTL || this.getTableTTLFn(tableName);

    // Initialize extracted managers
    this.cacheManager = new ReplicatedTableCacheManager<T>(
      tableName,
      () => this.ttl,
      this.logger,
      () => this.init(),
      () => this.getAll()
    );

    this.batchManager = new ReplicatedTableBatchManager<T>(
      tableName,
      this.logger,
      () => this.init(),
      () => this.notifyListeners(),
      () => this.relieveQuota()
    );

    this.queryManager = new ReplicatedTableQueryManager<T>(
      tableName,
      this.logger,
      () => this.init(),
      row => this.isExpired(row),
      licenseKey => this.getAll(licenseKey)
    );

    this.rowLocks = new RowLockRegistry();
  }

  // ========================================
  // MUTATION MANAGER
  // ========================================

  /** MutationManager reference (set by app at startup) */
  private mutationManager: MutationManager | null = null;

  /**
   * Connect this table to a MutationManager for mutation upload.
   * Must be called once at app startup before any writes.
   */
  setMutationManager(manager: MutationManager): void {
    this.mutationManager = manager;
  }

  /**
   * Get the number of pending mutations in the queue.
   * Useful for subclasses to guard cleanup operations.
   */
  protected async getMutationPendingCount(): Promise<number> {
    if (!this.mutationManager) return 0;
    return this.mutationManager.getPendingCount();
  }

  /**
   * Return pending mutation ids for a row in this table.
   * Used by dependency-aware local creates without exposing queue storage.
   */
  public async getPendingMutationIdsForRow(rowId: string): Promise<string[]> {
    if (!this.mutationManager) return [];
    const mutations = await this.mutationManager.getPendingMutationsForRow(this.tableName, rowId);
    return mutations.map(mutation => mutation.id);
  }

  /**
   * Rebuild a full Supabase UPDATE payload from a local row after conflict
   * resolution. Subclasses with direct full-row UPDATE mutations should override
   * this with their table mapper; RPC/delta-only tables can keep the default.
   */
  protected rebuildUpdatePayload(_row: T): Record<string, unknown> | undefined {
    return undefined;
  }

  /**
   * Queue a mutation for upload to Supabase.
   * Subclasses call this after set() with the Supabase-format payload.
   */
  protected async queueMutation(
    operation: 'INSERT' | 'UPDATE' | 'DELETE',
    rowId: string,
    supabasePayload: Record<string, unknown>,
    dependsOn?: string[],
    /** Optional: apply via a SECURITY DEFINER RPC (see PendingMutation.rpc). */
    rpc?: {
      name: string;
      fields?: Record<string, unknown>;
      args?: Record<string, unknown>;
      expectRowId?: boolean;
    },
    /**
     * When true, persist the mutation but DON'T schedule the upload yet — the
     * caller will mark the cache row dirty and then call {@link requestUpload}.
     * Prevents an online flush from deleting the mutation before the dirty row
     * exists (which would strand the row as pending).
     */
    deferUpload = false
  ): Promise<string | null> {
    if (!this.mutationManager) {
      this.logger.warn(`[${this.tableName}] No MutationManager set — mutation not queued`);
      return null;
    }

    // Capture the server-side version for OCC precondition on UPDATE — but only
    // when conflict surfacing is enabled. When the flag is off, no precondition is
    // attached and last-write-wins behavior is preserved end-to-end (the kill-switch
    // contract documented in syncReplicatedTable.ts).
    let serverVersion: number | undefined;
    if (operation === 'UPDATE' && isConflictSurfacingEnabled()) {
      const db = await databaseManager.getDatabase(this.tableName);
      const row = (await db.get(REPLICATION_STORES.REPLICATED_TABLES, [
        this.tableName,
        String(rowId),
      ])) as ReplicatedRow<unknown> | undefined;
      serverVersion = row?.serverVersion;
    }

    return this.mutationManager.queueMutation(
      this.tableName,
      operation,
      rowId,
      supabasePayload,
      dependsOn,
      serverVersion,
      rpc,
      !deferUpload
    );
  }

  /**
   * Trigger a debounced upload after a deferred queueMutation (deferUpload) and
   * its dependent cache write have completed. No-op if no MutationManager.
   */
  protected requestUpload(): void {
    this.mutationManager?.requestUpload();
  }

  // ========================================
  // PUBLIC ACCESSORS
  // ========================================

  /**
   * Get the table name
   */
  public getTableName(): string {
    return this.tableName;
  }

  // ========================================
  // DATABASE INITIALIZATION
  // ========================================

  /**
   * Initialize IndexedDB connection
   * SINGLETON PATTERN: All tables share the same DB instance
   */
  protected async init(): Promise<IDBPDatabase> {
    this.db = await databaseManager.getDatabase(this.tableName);
    return this.db;
  }

  /**
   * Transaction wrapper that tracks active transactions
   */
  protected async runTransaction<R>(
    storeName: string,
    mode: IDBTransactionMode,
    callback: (store: IDBPObjectStore<unknown, [string], string, IDBTransactionMode>) => Promise<R>
  ): Promise<R> {
    const db = await this.init();

    const txPromise = (async () => {
      const tx = db.transaction(storeName, mode);
      const result = await callback(tx.objectStore(storeName));
      await tx.done;
      return result;
    })();

    const voidPromise = txPromise.then(
      () => {},
      () => {}
    ) as Promise<void>;
    trackTransaction(voidPromise);

    return txPromise;
  }

  // ========================================
  // CORE CRUD OPERATIONS
  // ========================================

  /**
   * Get single row by ID
   */
  async get(id: string): Promise<T | null> {
    const row = await this.getReplicatedRow(id);
    if (!row) return null;
    return row.data;
  }

  /**
   * Get the replicated row wrapper for an ID.
   * Used by package-level sync workflows that need cache metadata such as
   * dirty state without relying on app-specific fields.
   */
  async getReplicatedRow(id: string): Promise<ReplicatedRow<T> | null> {
    const db = await this.init();
    const normalizedId = String(id);
    const key = [this.tableName, normalizedId];

    const row = (await db.get(REPLICATION_STORES.REPLICATED_TABLES, key)) as
      | ReplicatedRow<T>
      | undefined;

    if (!row) {
      this.logger.log(`[${this.tableName}] Cache miss for ID: ${normalizedId}`);
      return null;
    }

    if (this.cacheManager.isExpired(row)) {
      this.logger.log(`[${this.tableName}] Cache expired for ID: ${normalizedId}`);
      await db.delete(REPLICATION_STORES.REPLICATED_TABLES, key);
      return null;
    }

    // Update access tracking for LRU+LFU eviction. This is best-effort
    // metadata: a read must never fail (or emit an unhandled rejection)
    // because the access-stats write hit a full storage quota. Swallow any
    // write error and return the row we already read.
    //
    // CRITICAL: read AND write must share a single readwrite transaction and
    // re-read the CURRENT row inside it, then bump ONLY the access-stat fields.
    // The original split-tx version read the row here, then put() the whole
    // stale copy back in a separate auto-commit tx — so a concurrent
    // set(..., isDirty=true) (a score save) committing in between was silently
    // clobbered: dirty flag and new value reverted, and the next pull replaced
    // it with server data. This is the same race PR #351 fixed in
    // markAsSynced/reconcileDirtyRow; getReplicatedRow (the hottest read path,
    // also called at the top of the sync loop) was missed. See the July 2026
    // replication audit finding C3.
    try {
      const tx = db.transaction(REPLICATION_STORES.REPLICATED_TABLES, 'readwrite');
      const current = (await tx.store.get(key)) as ReplicatedRow<T> | undefined;
      if (current) {
        current.lastAccessedAt = Date.now();
        current.accessCount = (current.accessCount || 0) + 1;
        await tx.store.put(current);
      }
      await tx.done;
    } catch (error) {
      this.logger.warn(
        `[${this.tableName}] Access-tracking write failed for ${normalizedId} (non-fatal):`,
        error
      );
    }

    return row;
  }

  /**
   * Set (upsert) a row in local cache
   *
   * @param incomingServerVersion - The server's `version` column value from the
   *   downloaded row. Only pass for clean (isDirty=false) server writes; dirty
   *   writes preserve the existing serverVersion from the IDB row.
   */
  async set(
    id: string,
    data: T,
    isDirty = false,
    expectedVersion?: number,
    incomingServerVersion?: number
  ): Promise<void> {
    // Wrap the write so a storage-quota abort triggers eviction + one retry
    // rather than escaping as an unhandled "AbortError: QuotaExceededError".
    await withQuotaEviction(
      () => this.setOnce(id, data, isDirty, expectedVersion, incomingServerVersion),
      () => this.relieveQuota(),
      this.logger
    );
  }

  /** Single attempt of {@link set}; opens its own transaction so it is safe to retry. */
  private async setOnce(
    id: string,
    data: T,
    isDirty: boolean,
    expectedVersion?: number,
    incomingServerVersion?: number
  ): Promise<void> {
    const db = await this.init();
    const tx = db.transaction(REPLICATION_STORES.REPLICATED_TABLES, 'readwrite');

    const normalizedId = String(id);
    const existingRow = (await tx.store.get([this.tableName, normalizedId])) as
      | ReplicatedRow<T>
      | undefined;

    // Optimistic locking - verify version hasn't changed
    if (expectedVersion !== undefined && existingRow && existingRow.version !== expectedVersion) {
      await tx.done;
      throw new Error(
        `[${this.tableName}] Concurrent modification detected for row ${normalizedId}. ` +
          `Expected version ${expectedVersion}, found ${existingRow.version}.`
      );
    }

    // Guard: never overwrite a locally-dirty row with a clean server value.
    // A dirty row has a pending mutation that hasn't been flushed to Supabase yet.
    // Allowing a real-time push (isDirty=false) to clobber it would cause data loss
    // — this is the scoring-sync-bug root cause.
    if (!isDirty && existingRow?.isDirty) {
      await tx.done;
      this.logger.log(
        `[${this.tableName}] Skipped server push for row ${normalizedId} — local mutation pending`
      );
      return;
    }

    const row = buildReplicatedRowForSet({
      tableName: this.tableName,
      id: normalizedId,
      data,
      isDirty,
      existingRow,
      incomingServerVersion,
      now: Date.now(),
    });

    await tx.store.put(row);
    await tx.done;

    this.logger.log(
      `[${this.tableName}] Cached row: ${normalizedId} (version: ${row.version}, dirty: ${isDirty})`
    );

    this.notifyListeners();
  }

  /** Returns true when the conflict was written; false if the version changed
   *  under us (row edited concurrently — stale snapshot, safe to ignore). */
  async markConflict(id: string, conflict: ReplicationConflictSnapshot<T>): Promise<boolean> {
    const db = await this.init();
    const normalizedId = String(id);
    const tx = db.transaction(REPLICATION_STORES.REPLICATED_TABLES, 'readwrite');
    const existingRow = (await tx.store.get([this.tableName, normalizedId])) as
      | ReplicatedRow<T>
      | undefined;

    const conflictedRow = applyConflictSnapshot(existingRow, conflict);
    if (!conflictedRow) {
      await tx.done;
      return false;
    }

    await tx.store.put(conflictedRow);
    await tx.done;

    this.notifyListeners();
    return true;
  }

  /** Resolve a conflict by keeping the local edit.
   *  Clears the conflict snapshot, resets syncStatus to 'pending', and refreshes
   *  queued mutation OCC state so the local mutation uploads naturally on the
   *  next sync cycle.
   *
   *  @param newServerVersion - The remote row's server version from the conflict
   *    snapshot. Pass this so the next upload uses the correct OCC precondition
   *    (the server has moved to this version) rather than the stale snapshot that
   *    caused the original rejection. */
  async clearConflict(
    id: string,
    newServerVersion?: number,
    options?: {
      mergedData?: T;
      newBaseData?: T;
      rebuildUpdatePayload?: (local: T) => Record<string, unknown>;
    }
  ): Promise<void> {
    const db = await this.init();
    const normalizedId = String(id);
    const tx = db.transaction(REPLICATION_STORES.REPLICATED_TABLES, 'readwrite');
    const existingRow = (await tx.store.get([this.tableName, normalizedId])) as
      | ReplicatedRow<T>
      | undefined;

    const clearedRow = clearConflictSnapshot(existingRow, newServerVersion);
    if (!clearedRow) {
      await tx.done;
      return;
    }

    const nextData = options?.mergedData
      ? ({ ...options.mergedData, id: normalizedId } as T)
      : clearedRow.data;
    const nextRow: ReplicatedRow<T> = {
      ...clearedRow,
      data: nextData,
      ...(options?.newBaseData ? { baseData: options.newBaseData } : {}),
    };

    await tx.store.put(nextRow);
    await tx.done;

    if (newServerVersion !== undefined && this.mutationManager) {
      const rebuiltData =
        options?.rebuildUpdatePayload?.(nextRow.data) ?? this.rebuildUpdatePayload(nextRow.data);
      await this.mutationManager.reconcilePendingMutationsForRow(
        this.tableName,
        normalizedId,
        newServerVersion,
        rebuiltData
      );
    }

    this.notifyListeners();
  }

  async replaceFromRemote(id: string, remoteData: T, remoteServerVersion?: number): Promise<void> {
    const db = await this.init();
    const normalizedId = String(id);
    const tx = db.transaction(REPLICATION_STORES.REPLICATED_TABLES, 'readwrite');
    const existingRow = (await tx.store.get([this.tableName, normalizedId])) as
      | ReplicatedRow<T>
      | undefined;

    const row = buildRemoteReplacementRow({
      tableName: this.tableName,
      id: normalizedId,
      remoteData,
      existingRow,
      remoteServerVersion,
    });

    await tx.store.put(row);
    await tx.done;
    this.notifyListeners();
  }

  /**
   * Mark a previously-dirty row as synced after the server has confirmed
   * receipt of a locally-applied mutation through a side channel (e.g., a
   * direct submitScore() call that doesn't go through MutationManager).
   *
   * The natural `set(id, data, false)` path would be blocked by the dirty-row
   * guard at line 253 above — that guard exists to stop real-time pushes from
   * clobbering pending local mutations. Here we KNOW the server has the row's
   * current state, so the guard would be wrong; this method bypasses it via
   * a direct IDB put that preserves the existing data and version.
   *
   * No-ops if the row doesn't exist or is already clean (idempotent).
   *
   * @see project_scoring_sync_bug.md — added 2026-05-25 to close the
   *   "online happy-path leaves _syncStatus:'pending' forever" follow-up
   *   from PR #341. Without this, every subsequent replication pull takes
   *   the wasteful mergeDirtyRow branch instead of normal resolveConflict.
   */
  async markAsSynced(id: string): Promise<void> {
    const db = await this.init();
    const normalizedId = String(id);

    // CRITICAL: read AND write must share a single readwrite transaction so a
    // concurrent set(..., true) can't slip a fresh dirty mutation in between
    // our get() and put() and get silently clobbered. The original split-tx
    // version had this race; see PR #351 review finding #1.
    const tx = db.transaction(REPLICATION_STORES.REPLICATED_TABLES, 'readwrite');
    const existingRow = (await tx.store.get([this.tableName, normalizedId])) as
      | ReplicatedRow<T>
      | undefined;

    if (!existingRow || !existingRow.isDirty) {
      // No-op: row absent, or already synced. End the transaction cleanly.
      await tx.done;
      return;
    }

    await tx.store.put(buildSyncedReplicatedRow(existingRow, Date.now()));
    await tx.done;

    this.logger.log(`[${this.tableName}] Marked row ${normalizedId} as synced (was dirty)`);

    this.notifyListeners();
  }

  /**
   * Reconcile a locally-dirty row against a freshly-synced server snapshot WITHOUT
   * discarding the pending local edit. Used by syncReplicatedTable's dirty branch
   * when there is NO same-field conflict, to fix the root cause of the ringside OCC
   * conflict storm: a dirty row's `serverVersion` token never advanced on sync-down,
   * so every subsequent write carried a stale OCC precondition and 40001'd forever.
   *
   * Two things happen atomically:
   *  1. Server-changed fields the client never touched are merged into the row's
   *     data (3-way merge against `base`), so the next FULL-row write doesn't
   *     regress them to their stale optimistic values (silent data loss). A caller
   *     with a custom merge can pass `mergedData` to override the generic merge.
   *  2. The OCC `serverVersion` token advances forward-only to `remoteServerVersion`,
   *     and the merge base advances to the server snapshot.
   *
   * No-op (returns false, no write) when: the row vanished or went clean under us,
   * the row is in `conflict` state (left for the user to resolve), or nothing would
   * change — neither a field merged nor the token advanced (the Performance guard
   * against per-sync write churn).
   *
   * @returns true if the row was written, false on any no-op path above.
   */
  async reconcileDirtyRow(
    id: string,
    params: {
      base: T;
      remote: T;
      remoteServerVersion: number | undefined;
      /** Pre-merged data from an adapter's mergeDirtyRow; omit for a generic 3-way merge. */
      mergedData?: T;
      /** Rebuild a full Supabase UPDATE payload from the reconciled row, so a queued
       *  full-row UPDATE can be refreshed (not just the IDB row) and won't clobber. */
      rebuildPayload?: (local: T) => Record<string, unknown>;
    }
  ): Promise<boolean> {
    const db = await this.init();
    const normalizedId = String(id);

    // Single readwrite tx: a concurrent set(..., true) must not slip a fresh dirty
    // mutation between our read and write (same race markAsSynced guards against).
    const tx = db.transaction(REPLICATION_STORES.REPLICATED_TABLES, 'readwrite');
    const existingRow = (await tx.store.get([this.tableName, normalizedId])) as
      | ReplicatedRow<T>
      | undefined;

    // Only reconcile a still-dirty, non-conflicted row.
    if (!existingRow || !existingRow.isDirty || existingRow.syncStatus === 'conflict') {
      await tx.done;
      return false;
    }

    const mergedData =
      params.mergedData ??
      mergeNonConflictingServerFields({
        base: params.base,
        local: existingRow.data,
        remote: params.remote,
      }).merged;
    const normalizedMerged = { ...mergedData, id: normalizedId } as T;

    // Forward-only token advance: never pull the token back on a late/backdated row.
    const advanceToken =
      params.remoteServerVersion !== undefined &&
      params.remoteServerVersion > (existingRow.serverVersion ?? -Infinity);
    const nextServerVersion = advanceToken ? params.remoteServerVersion : existingRow.serverVersion;

    // Churn guard: skip the IDB write when neither the data nor the token changed.
    const dataChanged = JSON.stringify(normalizedMerged) !== JSON.stringify(existingRow.data);
    if (!advanceToken && !dataChanged) {
      await tx.done;
      return false;
    }

    const row = buildReconciledDirtyRow({
      existingRow,
      mergedData: normalizedMerged,
      newBaseData: params.remote,
      serverVersion: nextServerVersion,
      now: Date.now(),
    });

    await tx.store.put(row);
    await tx.done;

    // The upload reads serverVersion/data from the QUEUED mutation, not this row —
    // so reconcile the queue too, or the stuck mutation keeps uploading the stale
    // token forever (storm) and, for full-row UPDATEs, the stale payload (clobber).
    if (advanceToken && this.mutationManager && params.remoteServerVersion !== undefined) {
      const rebuiltData = params.rebuildPayload?.(normalizedMerged);
      await this.mutationManager.reconcilePendingMutationsForRow(
        this.tableName,
        normalizedId,
        params.remoteServerVersion,
        rebuiltData
      );
    }

    this.logger.log(
      `[${this.tableName}] Reconciled dirty row ${normalizedId} ` +
        `(serverVersion: ${nextServerVersion}, merged: ${dataChanged})`
    );

    this.notifyListeners();
    return true;
  }

  /**
   * Delete a row from local cache
   */
  async delete(id: string): Promise<void> {
    const db = await this.init();
    const normalizedId = String(id);
    await db.delete(REPLICATION_STORES.REPLICATED_TABLES, [this.tableName, normalizedId]);
    this.logger.log(`[${this.tableName}] Deleted row: ${normalizedId}`);

    this.notifyListeners();
  }

  // ========================================
  // QUERY OPERATIONS
  // ========================================

  /**
   * Query rows by index (uses IndexedDB indexes for O(log n) performance)
   */
  async queryByField(
    fieldName: 'class_id' | 'trial_id' | 'show_id' | 'armband_number',
    value: string
  ): Promise<T[]> {
    return this.queryManager.queryByField(fieldName, value);
  }

  /**
   * Query rows by index (alias for queryByField)
   */
  async queryIndex(indexName: keyof T, value: string | number): Promise<T[]> {
    return this.queryManager.queryIndex(indexName, value);
  }

  /**
   * Return the persisted conflict snapshots for every row in this table that is
   * currently in `syncStatus: 'conflict'`.  Used by the app shell on provider
   * mount to re-surface conflicts the user navigated away from before resolving,
   * so the Sonner resolution toast reappears on next visit rather than silently
   * disappearing.
   */
  async getConflictedRows(): Promise<ReplicationConflictSnapshot<T>[]> {
    const db = await this.init();
    const tx = db.transaction(REPLICATION_STORES.REPLICATED_TABLES, 'readonly');
    const index = tx.store.index('tableName');
    const rows = (await index.getAll(this.tableName)) as ReplicatedRow<T>[];
    return getConflictSnapshots(rows);
  }

  /**
   * Resolve a persisted conflict in one call, reading all required params from
   * the stored conflict snapshot so callers only need the rowId + choice.
   *
   * - 'keep-local': clears the conflict, resets syncStatus → 'pending'.  The
   *   existing local mutation re-uploads with an updated OCC precondition.
   * - 'take-remote': replaces local data with the remote version, marks the row
   *   synced.  Callers should also call
   *   `mutationManager.discardPendingMutationsForRow` to drop any queued upload.
   *
   * Returns false and is a no-op when the row has no persisted conflict snapshot
   * (e.g. already resolved or row doesn't exist).
   */
  async resolveReplicationConflict(
    id: string,
    resolution: ReplicationConflictResolution,
    options?: { rebuildUpdatePayload?: (local: T) => Record<string, unknown> }
  ): Promise<boolean> {
    const row = await this.getReplicatedRow(id);
    const snapshot = row?.conflict;
    if (!snapshot) return false;

    if (resolution === 'keep-local') {
      const merged = mergeNonConflictingServerFields({
        base: snapshot.baseData,
        local: row.data,
        remote: snapshot.remoteData,
      }).merged;
      await this.clearConflict(id, snapshot.remoteServerVersion, {
        mergedData: merged,
        newBaseData: snapshot.remoteData,
        rebuildUpdatePayload: options?.rebuildUpdatePayload,
      });
    } else {
      await this.replaceFromRemote(id, snapshot.remoteData, snapshot.remoteServerVersion);
    }
    return true;
  }

  /**
   * Get all rows for this table
   */
  async getAll(licenseKey?: string): Promise<T[]> {
    return this.queryManager.getAll(licenseKey);
  }

  /**
   * Optimistic update with automatic retry on version conflicts
   */
  async optimisticUpdate(
    id: string,
    updateFn: (current: T) => T | Promise<T>,
    _maxRetries = MAX_OPTIMISTIC_UPDATE_RETRIES
  ): Promise<T> {
    return this.rowLocks.withRowLock(id, async () => {
      const db = await this.init();
      const existingRow = (await db.get(REPLICATION_STORES.REPLICATED_TABLES, [
        this.tableName,
        id,
      ])) as ReplicatedRow<T> | undefined;

      if (!existingRow) {
        throw new Error(`[${this.tableName}] Row ${id} not found for optimistic update`);
      }

      const currentVersion = existingRow.version;
      const currentData = existingRow.data;

      const updatedData = await updateFn(currentData);
      await this.set(id, updatedData, true, currentVersion);

      this.logger.log(`[${this.tableName}] Optimistic update succeeded for ${id}`);
      return updatedData;
    });
  }

  // ========================================
  // DELEGATED METHODS (to extracted managers)
  // ========================================

  // --- Batch Operations ---

  async batchSet(items: T[], serverVersions?: Map<string, number>): Promise<void> {
    return this.batchManager.batchSet(items, serverVersions);
  }

  async batchSetChunked(
    items: T[],
    chunkSize?: number,
    serverVersions?: Map<string, number>
  ): Promise<void> {
    return this.batchManager.batchSetChunked(items, chunkSize, serverVersions);
  }

  async batchDelete(ids: string[]): Promise<void> {
    return this.batchManager.batchDelete(ids);
  }

  async clearCache(): Promise<void> {
    await this.batchManager.clearCache();

    // Also reset sync metadata so next sync does a full fetch. `scopes: {}` clears
    // every per-scope watermark too, so a scoped sync after clearCache re-fetches
    // from epoch rather than reading a stale scoped watermark.
    await this.cacheManager.updateSyncMetadata({
      lastFullSyncAt: 0,
      lastIncrementalSyncAt: 0,
      totalRows: 0,
      syncStatus: 'idle',
      errorMessage: undefined,
      scopes: {},
    });
    this.logger.log(`[${this.tableName}] Sync metadata reset`);
  }

  // --- Cache Management ---

  subscribe(callback: (data: T[]) => void): () => void {
    return this.cacheManager.subscribe(callback);
  }

  protected async notifyListeners(): Promise<void> {
    return this.cacheManager.notifyListeners();
  }

  protected isExpired(row: ReplicatedRow<T>): boolean {
    return this.cacheManager.isExpired(row);
  }

  async refreshTimestamps(): Promise<void> {
    return this.cacheManager.refreshTimestamps();
  }

  async cleanExpired(): Promise<number> {
    return this.cacheManager.cleanExpired();
  }

  async estimateTotalSize(): Promise<number> {
    return this.cacheManager.estimateTotalSize();
  }

  async getCacheStats(): Promise<CacheStats> {
    return this.cacheManager.getCacheStats();
  }

  async evictLRU(targetSizeBytes: number): Promise<number> {
    return this.cacheManager.evictLRU(targetSizeBytes);
  }

  /**
   * Free local cache space in response to storage-quota pressure by evicting
   * the oldest/least-used ~30% of this table's footprint. Dirty/unsynced and
   * recently-touched rows are always protected (see {@link evictLRU}), so this
   * never drops pending offline mutations. Returns the number of rows evicted.
   *
   * SCOPE: per-table. All replicated tables share one IndexedDB object store
   * and the browser quota is global, so this reclaims space within the table
   * whose write overflowed — the common case, since bulk sync overflows on the
   * large table that grew. A genuine cross-table overflow (this table has no
   * evictable rows while another holds gigabytes of garbage) won't recover
   * here; that would need a store-wide evictor — tracked as a follow-up.
   */
  async relieveQuota(): Promise<number> {
    return this.cacheManager.evictRetainingFraction(QUOTA_EVICTION_RETAIN_FRACTION);
  }

  async getSyncMetadata(scopeValue?: string): Promise<SyncMetadata | null> {
    return this.cacheManager.getSyncMetadata(scopeValue);
  }

  async updateSyncMetadata(
    updates: Partial<SyncMetadata>,
    options?: { scopeValue?: string; advanceWatermarkMonotonically?: boolean }
  ): Promise<void> {
    return this.cacheManager.updateSyncMetadata(updates, options);
  }

  // ========================================
  // STALE ENTRY DETECTION
  // ========================================

  async getAllLocalIds(): Promise<Set<string>> {
    return this.queryManager.getAllLocalIds();
  }

  async removeStaleEntries(serverIds: Set<string>): Promise<number> {
    const db = await this.init();
    const tx = db.transaction(REPLICATION_STORES.REPLICATED_TABLES, 'readwrite');
    const index = tx.store.index('tableName');
    const rows = (await index.getAll(this.tableName)) as ReplicatedRow<T>[];

    let removedCount = 0;

    for (const row of rows.filter(row => row.isDirty)) {
      this.logger.log(`[${this.tableName}] Preserving dirty row ${row.id}`);
    }

    for (const row of selectStaleCleanRows(rows, serverIds)) {
      await tx.store.delete([row.tableName, row.id]);
      removedCount++;
      this.logger.log(`[${this.tableName}] Removed stale entry: ${row.id}`);
    }

    await tx.done;

    if (removedCount > 0) {
      this.logger.log(`[${this.tableName}] Removed ${removedCount} stale entries`);
      this.notifyListeners();
    }

    return removedCount;
  }

  // ========================================
  // ABSTRACT METHODS (to be implemented by subclasses)
  // ========================================

  /**
   * Sync with server (to be implemented by subclasses)
   */
  abstract sync(licenseKey: string, options?: Partial<SyncOptions>): Promise<SyncResult>;

  /**
   * Resolve conflicts (to be implemented by subclasses)
   */
  protected abstract resolveConflict(local: T, remote: T): T;
}
