/**
 * ReplicatedTable - Generic Base Class for Table Replication
 *
 * Refactored as part of DEBT-003: Split from 1,253 lines into focused modules:
 * - DatabaseManager.ts: Shared DB singleton, init, retry, corruption recovery (~300 lines)
 * - ReplicatedTableCache.ts: TTL, eviction, stats, subscriptions (~300 lines)
 * - ReplicatedTableBatch.ts: Batch operations, chunked processing (~130 lines)
 * - ReplicatedTable.ts: Core CRUD operations (~400 lines)
 *
 * Provides CRUD operations with automatic caching, sync, and conflict resolution.
 * All table-specific implementations extend this class.
 */

import type { IDBPDatabase, IDBPObjectStore } from 'idb';
import type {
  ReplicatedRow,
  SyncMetadata,
  SyncResult,
} from './types';
import type { SyncOptions } from './SyncEngine';
import type { Logger, GetTableTTL, LogDiagnostics, ReplicatedTableDependencies, ReplicatedTableName } from './dependencies';
import {
  QUERY_TIMEOUT_MS,
  SLOW_QUERY_THRESHOLD_MS,
  MAX_OPTIMISTIC_UPDATE_RETRIES,
} from './replicationConstants';

// Extracted modules
import { databaseManager, REPLICATION_STORES, trackTransaction } from './DatabaseManager';
import { ReplicatedTableCacheManager } from './ReplicatedTableCache';
import { ReplicatedTableBatchManager } from './ReplicatedTableBatch';

// Production dependencies - imported from actual modules
import { logger as defaultLogger } from '@/utils/logger';
import { getTableTTL as defaultGetTableTTL } from '@/config/featureFlags';
import { logDiagnosticReport as defaultLogDiagnostics } from '@/utils/indexedDBDiagnostics';

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
  protected readonly logDiagnosticsFn: LogDiagnostics;

  /** Extracted cache manager */
  private cacheManager: ReplicatedTableCacheManager<T>;

  /** Extracted batch manager */
  private batchManager: ReplicatedTableBatchManager<T>;

  /** Issue #5 Fix: Per-row mutex to prevent concurrent update livelocks */
  private rowLocks: Map<string, Promise<void>> = new Map();

  constructor(
    protected tableName: string,
    customTTL?: number,
    dependencies: ReplicatedTableDependencies = {}
  ) {
    // Inject dependencies with defaults
    this.logger = dependencies.logger ?? defaultLogger;
    this.getTableTTLFn = dependencies.getTableTTL ?? defaultGetTableTTL;
    this.logDiagnosticsFn = dependencies.logDiagnostics ?? defaultLogDiagnostics;

    // Set TTL using injected function
    this.ttl = customTTL || this.getTableTTLFn(tableName as ReplicatedTableName);

    // Initialize extracted managers
    this.cacheManager = new ReplicatedTableCacheManager<T>(
      tableName,
      () => this.ttl,  // Getter for TTL to allow dynamic changes (used by tests)
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
  // PUBLIC ACCESSORS
  // ========================================

  /**
   * Get the table name (public accessor for protected property)
   */
  public getTableName(): string {
    return this.tableName;
  }

  // ========================================
  // DATABASE INITIALIZATION
  // ========================================

  /**
   * Initialize IndexedDB connection
   * SINGLETON PATTERN: All tables share the same DB instance to prevent upgrade deadlocks
   */
  protected async init(): Promise<IDBPDatabase> {
    this.db = await databaseManager.getDatabase(this.tableName);
    return this.db;
  }

  /**
   * PHASE 1 DAY 2 FIX: Transaction wrapper that tracks active transactions
   * This ensures that during initialization, tables wait for all transactions to complete
   * before starting their own, preventing transaction stampede and deadlocks.
   *
   * @param storeName - The object store name to access
   * @param mode - Transaction mode ('readonly' or 'readwrite')
   * @param callback - Function to execute within the transaction
   * @returns Promise resolving to the callback's return value
   */
  protected async runTransaction<R>(
    storeName: string,
    mode: IDBTransactionMode,
    callback: (store: IDBPObjectStore<unknown, [string], string, IDBTransactionMode>) => Promise<R>
  ): Promise<R> {
    const db = await this.init();

    // Create the transaction promise
    const txPromise = (async () => {
      const tx = db.transaction(storeName, mode);
      const result = await callback(tx.objectStore(storeName));
      await tx.done;
      return result;
    })();

    // Track this transaction in the global set
    const voidPromise = txPromise.then(() => {}, () => {}) as Promise<void>;
    trackTransaction(voidPromise);

    // Return the actual result
    return txPromise;
  }

  // ========================================
  // CORE CRUD OPERATIONS
  // ========================================

  /**
   * Get single row by ID
   * Returns cached version if fresh, otherwise fetches from server
   *
   * CRITICAL: Normalizes ID to string for consistent key lookup.
   */
  async get(id: string): Promise<T | null> {
    const db = await this.init();
    // Normalize ID to string for consistent key lookup
    const normalizedId = String(id);
    const key = [this.tableName, normalizedId];

    const row = await db.get(REPLICATION_STORES.REPLICATED_TABLES, key) as ReplicatedRow<T> | undefined;

    if (!row) {
      this.logger.log(`[${this.tableName}] Cache miss for ID: ${normalizedId}`);
      return null;
    }

    // Check if expired
    if (this.cacheManager.isExpired(row)) {
      this.logger.log(`[${this.tableName}] Cache expired for ID: ${normalizedId}`);
      await db.delete(REPLICATION_STORES.REPLICATED_TABLES, key);
      return null;
    }

    // Day 25-26 LOW Fix: Update access tracking for LRU+LFU eviction
    row.lastAccessedAt = Date.now();
    row.accessCount = (row.accessCount || 0) + 1;
    await db.put(REPLICATION_STORES.REPLICATED_TABLES, row);

    return row.data;
  }

  /**
   * Set (upsert) a row in local cache
   *
   * Day 25-26 MEDIUM Fix: Optimistic locking with version checking
   * @param expectedVersion - Optional version to check for optimistic locking
   * @throws Error if version mismatch (concurrent modification detected)
   *
   * CRITICAL: Normalizes ID to string to prevent duplicate records.
   * IndexedDB treats 2 and "2" as different keys.
   */
  async set(id: string, data: T, isDirty = false, expectedVersion?: number): Promise<void> {
    const db = await this.init();
    const tx = db.transaction(REPLICATION_STORES.REPLICATED_TABLES, 'readwrite');

    // CRITICAL: Normalize ID to string to prevent duplicates
    const normalizedId = String(id);

    // Read current row within transaction for atomicity
    const existingRow = await tx.store.get([this.tableName, normalizedId]) as ReplicatedRow<T> | undefined;

    // Day 25-26: Optimistic locking - verify version hasn't changed
    if (expectedVersion !== undefined && existingRow && existingRow.version !== expectedVersion) {
      await tx.done;
      throw new Error(
        `[${this.tableName}] Concurrent modification detected for row ${normalizedId}. ` +
        `Expected version ${expectedVersion}, found ${existingRow.version}. ` +
        `Please retry your operation.`
      );
    }

    // Create normalized data with string ID
    const normalizedData = { ...data, id: normalizedId } as T;

    const row: ReplicatedRow<T> = {
      tableName: this.tableName,
      id: normalizedId,
      data: normalizedData,
      version: existingRow ? existingRow.version + 1 : 1,
      lastSyncedAt: Date.now(),
      lastAccessedAt: Date.now(),
      // Day 25-26 LOW Fix: Preserve access count, track modification time
      accessCount: existingRow?.accessCount || 0,
      lastModifiedAt: Date.now(),
      isDirty,
      syncStatus: isDirty ? 'pending' : 'synced',
    };

    await tx.store.put(row);
    await tx.done;

    this.logger.log(`[${this.tableName}] Cached row: ${normalizedId} (version: ${row.version}, dirty: ${isDirty})`);

    // Notify listeners
    this.notifyListeners();
  }

  /**
   * Delete a row from local cache
   *
   * CRITICAL: Normalizes ID to string for consistent key format.
   */
  async delete(id: string): Promise<void> {
    const db = await this.init();
    // Normalize ID to string for consistent key format
    const normalizedId = String(id);
    await db.delete(REPLICATION_STORES.REPLICATED_TABLES, [this.tableName, normalizedId]);
    this.logger.log(`[${this.tableName}] Deleted row: ${normalizedId}`);

    // Notify listeners
    this.notifyListeners();
  }

  // ========================================
  // QUERY OPERATIONS
  // ========================================

  /**
   * Query rows by index (OPTIMIZED - uses IndexedDB indexes for O(log n) performance)
   * Example: queryByField('class_id', '123') returns all entries with class_id = 123
   *
   * Supported fields: class_id, trial_id, show_id, armband_number
   *
   * Day 25-26 MEDIUM Fix: Added timeout and performance logging
   */
  async queryByField(fieldName: 'class_id' | 'trial_id' | 'show_id' | 'armband_number', value: string): Promise<T[]> {
    const startTime = performance.now();
    const db = await this.init();
    const indexName = `tableName_data.${fieldName}`;

    try {
      // Day 25-26 MEDIUM Fix: Query timeout
      // Issue #11 Fix: Abort transaction on timeout to prevent resource leaks

      let txAborted = false;
      let tx: { abort: () => void } | null = null;

      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          // Issue #11 Fix: Signal transaction to abort
          txAborted = true;
          if (tx) {
            try {
              tx.abort();
              this.logger.warn(`[${this.tableName}] Aborted transaction for query ${fieldName}=${value} due to timeout`);
            } catch (_abortError) {
              // Transaction may have already completed, ignore
            }
          }
          reject(new Error(`Query timeout: ${fieldName}=${value} exceeded ${QUERY_TIMEOUT_MS}ms`));
        }, QUERY_TIMEOUT_MS);
      });

      // Execute query with timeout
      const queryPromise = (async () => {
        const transaction = db.transaction(REPLICATION_STORES.REPLICATED_TABLES, 'readonly');
        tx = transaction; // Store for abort capability
        const index = transaction.store.index(indexName);

        // Issue #11 Fix: Check if aborted before proceeding
        if (txAborted) {
          throw new Error('Transaction aborted due to timeout');
        }

        // Query using compound index [tableName, data.field]
        const rows = await index.getAll([this.tableName, value]) as ReplicatedRow<T>[];

        // Issue #11 Fix: Check again after async operation
        if (txAborted) {
          throw new Error('Transaction aborted due to timeout');
        }

        // Filter expired rows
        const freshRows = rows.filter((row) => !this.cacheManager.isExpired(row));

        return freshRows.map((row) => row.data);
      })();

      const results = await Promise.race([queryPromise, timeoutPromise]);

      // Day 25-26 MEDIUM Fix: Performance logging
      const duration = performance.now() - startTime;
      if (duration > SLOW_QUERY_THRESHOLD_MS) {
        this.logger.warn(
          `[${this.tableName}] SLOW query detected: ${fieldName}=${value} took ${duration.toFixed(2)}ms ` +
          `(${results.length} results). Consider optimizing or reducing dataset.`
        );
      } else {
        this.logger.log(`[${this.tableName}] Indexed query ${fieldName}=${value}: ${results.length} rows in ${duration.toFixed(2)}ms`);
      }

      return results;
    } catch (error) {
      const duration = performance.now() - startTime;

      // Day 25-26 MEDIUM Fix: Handle timeout errors
      if (error instanceof Error && error.message.includes('Query timeout')) {
        this.logger.error(
          `[${this.tableName}] Query TIMEOUT: ${fieldName}=${value} exceeded ${QUERY_TIMEOUT_MS}ms. ` +
          `This indicates a performance issue. Dataset may be too large or index not working properly.`
        );
        throw error;
      }

      // Fallback to table scan if index doesn't exist (backward compatibility)
      this.logger.warn(`[${this.tableName}] Index ${indexName} not found, falling back to table scan (took ${duration.toFixed(2)}ms)`);
      const allRows = await this.getAll();
      return allRows.filter((row) => (row as Record<string, unknown>)[fieldName] === value);
    }
  }

  /**
   * Query rows by index (DEPRECATED - use queryByField for better performance)
   * Example: queryIndex('class_id', '123') returns all entries with class_id = 123
   */
  async queryIndex(indexName: keyof T, value: string | number): Promise<T[]> {
    // Try optimized query first for known fields
    const fieldName = indexName as string;
    if (['class_id', 'trial_id', 'show_id', 'armband_number'].includes(fieldName)) {
      return this.queryByField(
        fieldName as 'class_id' | 'trial_id' | 'show_id' | 'armband_number',
        String(value)
      );
    }

    // Fall back to table scan for other fields
    const allRows = await this.getAll();
    return allRows.filter((row) => row[indexName] === value);
  }

  /**
   * Get all rows for this table
   * TIMEOUT PROTECTION: Prevents indefinite blocking when multiple tables sync simultaneously
   */
  async getAll(licenseKey?: string): Promise<T[]> {
    const GET_ALL_TIMEOUT_MS = 20000; // 20 second timeout for reading all rows

    const getAllPromise = (async () => {
      const db = await this.init();
      const tx = db.transaction(REPLICATION_STORES.REPLICATED_TABLES, 'readonly');
      const index = tx.store.index('tableName');

      const rows = await index.getAll(this.tableName) as ReplicatedRow<T>[];

      // Filter expired rows
      const freshRows = rows.filter((row) => !this.cacheManager.isExpired(row));

      // Filter by license_key if provided (for multi-tenant isolation)
      if (licenseKey) {
        return freshRows
          .filter((row) => (row.data as Record<string, unknown>).license_key === licenseKey)
          .map((row) => row.data);
      }

      return freshRows.map((row) => row.data);
    })();

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`[${this.tableName}] getAll() timed out after ${GET_ALL_TIMEOUT_MS}ms - possible transaction deadlock`));
      }, GET_ALL_TIMEOUT_MS);
    });

    try {
      const result = await Promise.race([getAllPromise, timeoutPromise]);
      return result;
    } catch (error) {
      this.logger.error(`[${this.tableName}] getAll() failed:`, error);
      // Return empty array on timeout to allow sync to continue
      return [];
    }
  }

  // ========================================
  // ROW LOCKING (Optimistic Update Support)
  // ========================================

  /**
   * Acquire an exclusive lock for a specific row
   * Issue #5 Fix: Prevents concurrent updates to the same row from livelocking
   */
  private async acquireRowLock(id: string): Promise<void> {
    // Wait for existing lock if present
    while (this.rowLocks.has(id)) {
      await this.rowLocks.get(id);
      // Re-check in case another lock was created immediately
    }

    // Create our lock promise
    let releaseLock: () => void;
    const lockPromise = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });

    // Store lock with release function attached
    this.rowLocks.set(id, lockPromise);
    (this.rowLocks.get(id) as unknown as Record<string, unknown>)._release = releaseLock!;
  }

  /**
   * Release the exclusive lock for a specific row
   * Issue #5 Fix: Must be called in finally block to ensure lock is always released
   */
  private releaseRowLock(id: string): void {
    const lock = this.rowLocks.get(id);
    if (lock && (lock as unknown as Record<string, unknown>)._release) {
      ((lock as unknown as Record<string, unknown>)._release as () => void)();
      this.rowLocks.delete(id);
    }
  }

  /**
   * Optimistic update with automatic retry on version conflicts
   * Day 25-26 MEDIUM Fix: Helper for race condition handling
   * Issue #5 Fix: Now uses per-row mutex to prevent concurrent update livelocks
   *
   * @param id - Row ID to update
   * @param updateFn - Function to apply update (receives current data, returns new data)
   * @param maxRetries - Maximum retry attempts (default: 3)
   * @throws Error if max retries exceeded
   */
  async optimisticUpdate(
    id: string,
    updateFn: (current: T) => T | Promise<T>,
    _maxRetries = MAX_OPTIMISTIC_UPDATE_RETRIES
  ): Promise<T> {
    // Issue #5 Fix: Acquire row lock to prevent concurrent update livelocks
    // With the lock, we have exclusive access to this row, so no retry is needed
    await this.acquireRowLock(id);

    try {
      // Read current row with version
      const db = await this.init();
      const existingRow = await db.get(REPLICATION_STORES.REPLICATED_TABLES, [this.tableName, id]) as ReplicatedRow<T> | undefined;

      if (!existingRow) {
        throw new Error(`[${this.tableName}] Row ${id} not found for optimistic update`);
      }

      const currentVersion = existingRow.version;
      const currentData = existingRow.data;

      // Apply user's update function
      const updatedData = await updateFn(currentData);

      // Perform write with version check (should never conflict since we have the lock)
      await this.set(id, updatedData, true, currentVersion);

      this.logger.log(`[${this.tableName}] Optimistic update succeeded for ${id} (with row lock)`);
      return updatedData;
    } finally {
      // Issue #5 Fix: Always release lock, even on error
      this.releaseRowLock(id);
    }
  }

  // ========================================
  // DELEGATED METHODS (to extracted managers)
  // ========================================

  // --- Batch Operations (delegated to ReplicatedTableBatchManager) ---

  /** Batch set (for initial sync) */
  async batchSet(items: T[]): Promise<void> {
    return this.batchManager.batchSet(items);
  }

  /** Batch set with chunking (for large syncs > 500 rows) */
  async batchSetChunked(items: T[], chunkSize?: number): Promise<void> {
    return this.batchManager.batchSetChunked(items, chunkSize);
  }

  /** Batch delete */
  async batchDelete(ids: string[]): Promise<void> {
    return this.batchManager.batchDelete(ids);
  }

  /** Clear all cached rows for this table AND reset sync metadata */
  async clearCache(): Promise<void> {
    await this.batchManager.clearCache();

    // CRITICAL: Also reset sync metadata so next sync does a full fetch
    // Without this, incremental sync may skip rows updated before lastIncrementalSyncAt
    await this.cacheManager.updateSyncMetadata({
      lastFullSyncAt: 0,
      lastIncrementalSyncAt: 0,
      totalRows: 0,
      syncStatus: 'idle',
      errorMessage: undefined,
    });
    this.logger.log(`[${this.tableName}] Sync metadata reset`);
  }

  // --- Cache Management (delegated to ReplicatedTableCacheManager) ---

  /** Subscribe to changes */
  subscribe(callback: (data: T[]) => void): () => void {
    return this.cacheManager.subscribe(callback);
  }

  /** Notify all listeners of data changes */
  protected async notifyListeners(): Promise<void> {
    return this.cacheManager.notifyListeners();
  }

  /** Check if row is expired based on TTL */
  protected isExpired(row: ReplicatedRow<T>): boolean {
    return this.cacheManager.isExpired(row);
  }

  /** Refresh timestamps on all cached rows */
  async refreshTimestamps(): Promise<void> {
    return this.cacheManager.refreshTimestamps();
  }

  /** Clean expired rows (for maintenance) */
  async cleanExpired(): Promise<number> {
    return this.cacheManager.cleanExpired();
  }

  /** Estimate total size of all rows in bytes */
  async estimateTotalSize(): Promise<number> {
    return this.cacheManager.estimateTotalSize();
  }

  /** Get cache statistics for this table */
  async getCacheStats(): Promise<{
    rowCount: number;
    sizeBytes: number;
    sizeMB: number;
    oldestAccess: number;
    newestAccess: number;
    dirtyCount: number;
  }> {
    return this.cacheManager.getCacheStats();
  }

  /** Evict least recently used rows to reduce memory footprint */
  async evictLRU(targetSizeBytes: number): Promise<number> {
    return this.cacheManager.evictLRU(targetSizeBytes);
  }

  /** Get sync metadata for this table */
  async getSyncMetadata(): Promise<SyncMetadata | null> {
    return this.cacheManager.getSyncMetadata();
  }

  /** Update sync metadata (public for SyncOrchestrator to persist full sync timestamps) */
  async updateSyncMetadata(updates: Partial<SyncMetadata>): Promise<void> {
    return this.cacheManager.updateSyncMetadata(updates);
  }

  // ========================================
  // STALE ENTRY DETECTION (Deleted Row Cleanup)
  // ========================================

  /**
   * Get all local IDs for this table (used for stale entry detection)
   * Returns IDs of non-expired, non-dirty rows only
   */
  async getAllLocalIds(): Promise<Set<string>> {
    const db = await this.init();
    const tx = db.transaction(REPLICATION_STORES.REPLICATED_TABLES, 'readonly');
    const index = tx.store.index('tableName');
    const rows = await index.getAll(this.tableName) as ReplicatedRow<T>[];

    const ids = new Set<string>();
    for (const row of rows) {
      // Skip expired rows (they'll be cleaned up anyway)
      if (this.cacheManager.isExpired(row)) continue;
      ids.add(row.id);
    }

    return ids;
  }

  /**
   * Remove stale entries that no longer exist on the server
   * Only removes non-dirty rows (rows with pending local changes are preserved)
   *
   * @param serverIds - Set of IDs that exist on the server
   * @returns Number of stale entries removed
   */
  async removeStaleEntries(serverIds: Set<string>): Promise<number> {
    const db = await this.init();
    const tx = db.transaction(REPLICATION_STORES.REPLICATED_TABLES, 'readwrite');
    const index = tx.store.index('tableName');
    const rows = await index.getAll(this.tableName) as ReplicatedRow<T>[];

    let removedCount = 0;

    for (const row of rows) {
      // CRITICAL: Never remove dirty rows (have pending mutations)
      if (row.isDirty) {
        this.logger.log(`[${this.tableName}] Preserving dirty row ${row.id} (has pending changes)`);
        continue;
      }

      // If ID doesn't exist on server, remove from local cache
      if (!serverIds.has(row.id)) {
        await tx.store.delete([row.tableName, row.id]);
        removedCount++;
        this.logger.log(`[${this.tableName}] Removed stale entry: ${row.id} (deleted from server)`);
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
