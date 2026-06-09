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
import {
  QUERY_TIMEOUT_MS,
  SLOW_QUERY_THRESHOLD_MS,
  MAX_OPTIMISTIC_UPDATE_RETRIES,
  GET_ALL_TIMEOUT_MS,
} from '../constants';

import { databaseManager, REPLICATION_STORES, trackTransaction } from './DatabaseManager';
import { ReplicatedTableCacheManager } from './ReplicatedTableCache';
import { ReplicatedTableBatchManager } from './ReplicatedTableBatch';
import { isConflictSurfacingEnabled } from '../conflictConfig';

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

  /** Per-row mutex to prevent concurrent update livelocks */
  private rowLocks: Map<string, Promise<void>> = new Map();

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
      () => this.notifyListeners()
    );
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
   * Queue a mutation for upload to Supabase.
   * Subclasses call this after set() with the Supabase-format payload.
   */
  protected async queueMutation(
    operation: 'INSERT' | 'UPDATE' | 'DELETE',
    rowId: string,
    supabasePayload: Record<string, unknown>,
    dependsOn?: string[]
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
      serverVersion
    );
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

    // Update access tracking for LRU+LFU eviction
    row.lastAccessedAt = Date.now();
    row.accessCount = (row.accessCount || 0) + 1;
    await db.put(REPLICATION_STORES.REPLICATED_TABLES, row);

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

    const normalizedData = { ...data, id: normalizedId } as T;
    const shouldCaptureBase = isDirty && existingRow && !existingRow.isDirty;
    const baseData = isDirty
      ? existingRow?.isDirty
        ? existingRow.baseData
        : shouldCaptureBase
          ? existingRow.data
          : undefined
      : undefined;
    const baseVersion = isDirty
      ? existingRow?.isDirty
        ? existingRow.baseVersion
        : shouldCaptureBase
          ? existingRow.version
          : undefined
      : undefined;
    const shouldPreserveConflict = isDirty && existingRow?.syncStatus === 'conflict';
    const conflict = shouldPreserveConflict ? existingRow.conflict : undefined;
    // Dirty writes: preserve existing serverVersion (the precondition captured when
    // the mutation was queued). Clean writes from server: use the incoming server
    // version if provided, else fall back to whatever was already stored.
    const serverVersion = isDirty
      ? existingRow?.serverVersion
      : (incomingServerVersion ?? existingRow?.serverVersion);

    const row: ReplicatedRow<T> = {
      tableName: this.tableName,
      id: normalizedId,
      data: normalizedData,
      version: existingRow ? existingRow.version + 1 : 1,
      lastSyncedAt: Date.now(),
      lastAccessedAt: Date.now(),
      accessCount: existingRow?.accessCount || 0,
      lastModifiedAt: Date.now(),
      isDirty,
      syncStatus: isDirty ? (shouldPreserveConflict ? 'conflict' : 'pending') : 'synced',
      ...(baseData !== undefined && { baseData }),
      ...(baseVersion !== undefined && { baseVersion }),
      ...(serverVersion !== undefined && { serverVersion }),
      conflict,
    };

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

    if (!existingRow || existingRow.version !== conflict.localVersion) {
      await tx.done;
      return false;
    }

    await tx.store.put({
      ...existingRow,
      isDirty: true,
      syncStatus: 'conflict',
      conflict,
    });
    await tx.done;

    this.notifyListeners();
    return true;
  }

  /** Resolve a conflict by keeping the local edit.
   *  Clears the conflict snapshot and resets syncStatus to 'pending' so the
   *  local mutation uploads naturally on the next sync cycle.
   *
   *  @param newServerVersion - The remote row's server version from the conflict
   *    snapshot. Pass this so the next upload uses the correct OCC precondition
   *    (the server has moved to this version) rather than the stale snapshot that
   *    caused the original rejection. */
  async clearConflict(id: string, newServerVersion?: number): Promise<void> {
    const db = await this.init();
    const normalizedId = String(id);
    const tx = db.transaction(REPLICATION_STORES.REPLICATED_TABLES, 'readwrite');
    const existingRow = (await tx.store.get([this.tableName, normalizedId])) as
      | ReplicatedRow<T>
      | undefined;

    if (!existingRow || existingRow.syncStatus !== 'conflict') {
      await tx.done;
      return;
    }

    await tx.store.put({
      ...existingRow,
      syncStatus: 'pending',
      conflict: undefined,
      ...(newServerVersion !== undefined && { serverVersion: newServerVersion }),
    });
    await tx.done;
    this.notifyListeners();
  }

  async replaceFromRemote(id: string, remoteData: T, remoteServerVersion?: number): Promise<void> {
    const db = await this.init();
    const normalizedId = String(id);
    const tx = db.transaction(REPLICATION_STORES.REPLICATED_TABLES, 'readwrite');
    const existingRow = (await tx.store.get([this.tableName, normalizedId])) as
      | ReplicatedRow<T>
      | undefined;

    const row: ReplicatedRow<T> = {
      tableName: this.tableName,
      id: normalizedId,
      data: { ...remoteData, id: normalizedId } as T,
      version: existingRow ? existingRow.version + 1 : 1,
      lastSyncedAt: Date.now(),
      lastAccessedAt: Date.now(),
      accessCount: existingRow?.accessCount || 0,
      lastModifiedAt: Date.now(),
      isDirty: false,
      syncStatus: 'synced',
      baseData: undefined,
      baseVersion: undefined,
      serverVersion: remoteServerVersion ?? existingRow?.serverVersion,
      conflict: undefined,
    };

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

    await tx.store.put({
      ...existingRow,
      isDirty: false,
      syncStatus: 'synced',
      lastSyncedAt: Date.now(),
      baseData: undefined,
      baseVersion: undefined,
      conflict: undefined,
    });
    await tx.done;

    this.logger.log(
      `[${this.tableName}] Marked row ${normalizedId} as synced (was dirty)`
    );

    this.notifyListeners();
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
    const startTime = performance.now();
    const db = await this.init();
    const indexName = `tableName_data.${fieldName}`;

    try {
      let txAborted = false;
      let tx: { abort: () => void } | null = null;

      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          txAborted = true;
          if (tx) {
            try {
              tx.abort();
              this.logger.warn(
                `[${this.tableName}] Aborted transaction for query ${fieldName}=${value} due to timeout`
              );
            } catch {
              // Transaction may have already completed
            }
          }
          reject(new Error(`Query timeout: ${fieldName}=${value} exceeded ${QUERY_TIMEOUT_MS}ms`));
        }, QUERY_TIMEOUT_MS);
      });

      const queryPromise = (async () => {
        const transaction = db.transaction(REPLICATION_STORES.REPLICATED_TABLES, 'readonly');
        tx = transaction;
        const index = transaction.store.index(indexName);

        if (txAborted) {
          throw new Error('Transaction aborted due to timeout');
        }

        const rows = (await index.getAll([this.tableName, value])) as ReplicatedRow<T>[];

        if (txAborted) {
          throw new Error('Transaction aborted due to timeout');
        }

        const freshRows = rows.filter(row => !this.cacheManager.isExpired(row));
        return freshRows.map(row => row.data);
      })();

      const results = await Promise.race([queryPromise, timeoutPromise]);

      const duration = performance.now() - startTime;
      if (duration > SLOW_QUERY_THRESHOLD_MS) {
        this.logger.warn(
          `[${this.tableName}] SLOW query detected: ${fieldName}=${value} took ${duration.toFixed(2)}ms`
        );
      } else {
        this.logger.log(
          `[${this.tableName}] Indexed query ${fieldName}=${value}: ${results.length} rows in ${duration.toFixed(2)}ms`
        );
      }

      return results;
    } catch (error) {
      const duration = performance.now() - startTime;

      if (error instanceof Error && error.message.includes('Query timeout')) {
        this.logger.error(
          `[${this.tableName}] Query TIMEOUT: ${fieldName}=${value} exceeded ${QUERY_TIMEOUT_MS}ms`
        );
        throw error;
      }

      // Fallback to table scan if index doesn't exist
      this.logger.warn(
        `[${this.tableName}] Index ${indexName} not found, falling back to table scan (took ${duration.toFixed(2)}ms)`
      );
      const allRows = await this.getAll();
      return allRows.filter(row => (row as Record<string, unknown>)[fieldName] === value);
    }
  }

  /**
   * Query rows by index (alias for queryByField)
   */
  async queryIndex(indexName: keyof T, value: string | number): Promise<T[]> {
    const fieldName = indexName as string;
    if (['class_id', 'trial_id', 'show_id', 'armband_number'].includes(fieldName)) {
      return this.queryByField(
        fieldName as 'class_id' | 'trial_id' | 'show_id' | 'armband_number',
        String(value)
      );
    }

    const allRows = await this.getAll();
    return allRows.filter(row => row[indexName] === value);
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
    return rows
      .filter(row => row.syncStatus === 'conflict' && row.conflict !== undefined)
      .map(row => row.conflict!);
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
    resolution: ReplicationConflictResolution
  ): Promise<boolean> {
    const row = await this.getReplicatedRow(id);
    const snapshot = row?.conflict;
    if (!snapshot) return false;

    if (resolution === 'keep-local') {
      await this.clearConflict(id, snapshot.remoteServerVersion);
    } else {
      await this.replaceFromRemote(id, snapshot.remoteData as T, snapshot.remoteServerVersion);
    }
    return true;
  }

  /**
   * Get all rows for this table
   */
  async getAll(licenseKey?: string): Promise<T[]> {
    const getAllPromise = (async () => {
      const db = await this.init();
      const tx = db.transaction(REPLICATION_STORES.REPLICATED_TABLES, 'readonly');
      const index = tx.store.index('tableName');

      const rows = (await index.getAll(this.tableName)) as ReplicatedRow<T>[];
      const freshRows = rows.filter(row => !this.cacheManager.isExpired(row));

      if (licenseKey) {
        return freshRows
          .filter(row => (row.data as Record<string, unknown>).license_key === licenseKey)
          .map(row => row.data);
      }

      return freshRows.map(row => row.data);
    })();

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`[${this.tableName}] getAll() timed out after ${GET_ALL_TIMEOUT_MS}ms`));
      }, GET_ALL_TIMEOUT_MS);
    });

    try {
      const result = await Promise.race([getAllPromise, timeoutPromise]);
      databaseManager.resetFailures();
      return result;
    } catch (error) {
      this.logger.error(`[${this.tableName}] getAll() failed:`, error);
      databaseManager.recordFailure();
      return [];
    }
  }

  // ========================================
  // ROW LOCKING (Optimistic Update Support)
  // ========================================

  private async acquireRowLock(id: string): Promise<void> {
    while (this.rowLocks.has(id)) {
      await this.rowLocks.get(id);
    }

    let releaseLock: () => void;
    const lockPromise = new Promise<void>(resolve => {
      releaseLock = resolve;
    });

    this.rowLocks.set(id, lockPromise);
    (this.rowLocks.get(id) as unknown as Record<string, unknown>)._release = releaseLock!;
  }

  private releaseRowLock(id: string): void {
    const lock = this.rowLocks.get(id);
    if (lock && (lock as unknown as Record<string, unknown>)._release) {
      ((lock as unknown as Record<string, unknown>)._release as () => void)();
      this.rowLocks.delete(id);
    }
  }

  /**
   * Optimistic update with automatic retry on version conflicts
   */
  async optimisticUpdate(
    id: string,
    updateFn: (current: T) => T | Promise<T>,
    _maxRetries = MAX_OPTIMISTIC_UPDATE_RETRIES
  ): Promise<T> {
    await this.acquireRowLock(id);

    try {
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
    } finally {
      this.releaseRowLock(id);
    }
  }

  // ========================================
  // DELEGATED METHODS (to extracted managers)
  // ========================================

  // --- Batch Operations ---

  async batchSet(items: T[], serverVersions?: Map<string, number>): Promise<void> {
    return this.batchManager.batchSet(items, serverVersions);
  }

  async batchSetChunked(items: T[], chunkSize?: number, serverVersions?: Map<string, number>): Promise<void> {
    return this.batchManager.batchSetChunked(items, chunkSize, serverVersions);
  }

  async batchDelete(ids: string[]): Promise<void> {
    return this.batchManager.batchDelete(ids);
  }

  async clearCache(): Promise<void> {
    await this.batchManager.clearCache();

    // Also reset sync metadata so next sync does a full fetch
    await this.cacheManager.updateSyncMetadata({
      lastFullSyncAt: 0,
      lastIncrementalSyncAt: 0,
      totalRows: 0,
      syncStatus: 'idle',
      errorMessage: undefined,
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

  async getSyncMetadata(): Promise<SyncMetadata | null> {
    return this.cacheManager.getSyncMetadata();
  }

  async updateSyncMetadata(updates: Partial<SyncMetadata>): Promise<void> {
    return this.cacheManager.updateSyncMetadata(updates);
  }

  // ========================================
  // STALE ENTRY DETECTION
  // ========================================

  async getAllLocalIds(): Promise<Set<string>> {
    const db = await this.init();
    const tx = db.transaction(REPLICATION_STORES.REPLICATED_TABLES, 'readonly');
    const index = tx.store.index('tableName');
    const rows = (await index.getAll(this.tableName)) as ReplicatedRow<T>[];

    const ids = new Set<string>();
    for (const row of rows) {
      if (this.cacheManager.isExpired(row)) continue;
      ids.add(row.id);
    }

    return ids;
  }

  async removeStaleEntries(serverIds: Set<string>): Promise<number> {
    const db = await this.init();
    const tx = db.transaction(REPLICATION_STORES.REPLICATED_TABLES, 'readwrite');
    const index = tx.store.index('tableName');
    const rows = (await index.getAll(this.tableName)) as ReplicatedRow<T>[];

    let removedCount = 0;

    for (const row of rows) {
      if (row.isDirty) {
        this.logger.log(`[${this.tableName}] Preserving dirty row ${row.id}`);
        continue;
      }

      if (!serverIds.has(row.id)) {
        await tx.store.delete([row.tableName, row.id]);
        removedCount++;
        this.logger.log(`[${this.tableName}] Removed stale entry: ${row.id}`);
      }
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
