/**
 * ReplicatedTableCache - Cache Management for Replicated Tables
 *
 * Extracted from ReplicatedTable.ts (DEBT-003) to improve maintainability.
 *
 * Responsibilities:
 * - TTL (Time-To-Live) expiration logic
 * - LRU/LFU cache eviction
 * - Cache statistics and monitoring
 * - Subscription/listener management with debouncing
 */

import type { IDBPDatabase } from 'idb';
import type { ReplicatedRow, SyncMetadata } from './types';
import type { Logger } from './dependencies';
import { REPLICATION_STORES } from './DatabaseManager';
import {
  NOTIFY_DEBOUNCE_MS,
} from './replicationConstants';

/**
 * Cache statistics for monitoring
 */
export interface CacheStats {
  rowCount: number;
  sizeBytes: number;
  sizeMB: number;
  oldestAccess: number;
  newestAccess: number;
  dirtyCount: number;
}

/**
 * Cache manager for a replicated table
 * Handles TTL, eviction, stats, and subscriptions
 */
export class ReplicatedTableCacheManager<T extends { id: string }> {
  private listeners: Set<(data: T[]) => void> = new Set();
  private notifyDebounceTimer: NodeJS.Timeout | null = null;
  private hasNotifiedLeadingEdge: boolean = false;

  constructor(
    private tableName: string,
    private getTtl: () => number,  // Getter for TTL to allow dynamic changes
    private logger: Logger,
    private getDb: () => Promise<IDBPDatabase>,
    private getAllData: () => Promise<T[]>
  ) {}

  // ========================================
  // TTL / EXPIRATION
  // ========================================

  /** Track last successful sync time (updated by refreshTimestamps) */
  private lastSuccessfulSyncAt: number = 0;

  /**
   * Update the last successful sync timestamp
   * Called after a sync completes successfully
   */
  setLastSuccessfulSync(timestamp: number): void {
    this.lastSuccessfulSyncAt = timestamp;
  }

  /**
   * Check if row is expired based on TTL
   *
   * IMPORTANT: Never expire dirty rows (rows with unsaved local changes)
   * This ensures offline scores are never lost, even if TTL expires
   *
   * Day 25-26 MEDIUM Fix: Don't expire if offline (offline mode exception)
   *
   * RELIABILITY FIX: Don't expire if we haven't synced successfully recently
   * This prevents data loss when sync fails silently
   */
  isExpired(row: ReplicatedRow<T>): boolean {
    // Never expire dirty rows (have pending mutations)
    if (row.isDirty) {
      return false;
    }

    // Day 25-26: Don't expire if offline (user may need stale data)
    if (!navigator.onLine) {
      return false;
    }

    // RELIABILITY FIX: Don't expire if we haven't synced successfully in a while
    // This prevents silent data loss when sync fails
    const ttl = this.getTtl();
    const timeSinceLastSync = Date.now() - this.lastSuccessfulSyncAt;

    // If we haven't synced successfully within 2x TTL, don't expire anything
    // This gives the sync system time to recover from failures
    if (timeSinceLastSync > ttl * 2) {
      return false;
    }

    return Date.now() - row.lastSyncedAt > ttl;
  }

  /**
   * Refresh timestamps on all cached rows
   * Called after incremental sync with 0 changes to prevent expiration
   * Also marks this as a successful sync for TTL protection
   */
  async refreshTimestamps(): Promise<void> {
    const db = await this.getDb();
    const tx = db.transaction(REPLICATION_STORES.REPLICATED_TABLES, 'readwrite');
    const index = tx.store.index('tableName');

    const rows = await index.getAll(this.tableName) as ReplicatedRow<T>[];
    const now = Date.now();

    for (const row of rows) {
      row.lastSyncedAt = now;
      row.lastAccessedAt = now;
      await tx.store.put(row);
    }

    await tx.done;

    // Mark this as a successful sync for TTL protection
    this.setLastSuccessfulSync(now);

    this.logger.log(`[${this.tableName}] Refreshed timestamps for ${rows.length} cached rows`);
  }

  /**
   * Clean expired rows (for maintenance)
   */
  async cleanExpired(): Promise<number> {
    const db = await this.getDb();
    const tx = db.transaction(REPLICATION_STORES.REPLICATED_TABLES, 'readwrite');
    const index = tx.store.index('tableName');

    const rows = await index.getAll(this.tableName) as ReplicatedRow<T>[];
    let deletedCount = 0;

    for (const row of rows) {
      if (this.isExpired(row)) {
        await tx.store.delete([row.tableName, row.id]);
        deletedCount++;
      }
    }

    await tx.done;

    if (deletedCount > 0) {
      this.logger.log(`[${this.tableName}] Cleaned ${deletedCount} expired rows`);
    }

    return deletedCount;
  }

  // ========================================
  // CACHE STATISTICS
  // ========================================

  /**
   * Estimate size of a single row in bytes
   * Day 23-24: Used for LRU eviction to prevent quota errors
   */
  estimateRowSize(row: ReplicatedRow<T>): number {
    try {
      // JSON.stringify + Blob gives accurate byte count
      const jsonStr = JSON.stringify(row);
      return new Blob([jsonStr]).size;
    } catch (error) {
      // Fallback: rough estimate (2 bytes per char for UTF-16)
      this.logger.warn(`[${this.tableName}] Failed to estimate row size, using fallback:`, error);
      return JSON.stringify(row).length * 2;
    }
  }

  /**
   * Estimate total size of all rows in bytes
   * Day 23-24: Used for LRU eviction to prevent quota errors
   */
  async estimateTotalSize(): Promise<number> {
    const db = await this.getDb();
    const tx = db.transaction(REPLICATION_STORES.REPLICATED_TABLES, 'readonly');
    const index = tx.store.index('tableName');

    const rows = await index.getAll(this.tableName) as ReplicatedRow<T>[];

    return rows.reduce((sum, row) => sum + this.estimateRowSize(row), 0);
  }

  /**
   * Get cache statistics for this table
   * Day 23-24: Monitoring for LRU eviction decisions
   */
  async getCacheStats(): Promise<CacheStats> {
    const db = await this.getDb();
    const tx = db.transaction(REPLICATION_STORES.REPLICATED_TABLES, 'readonly');
    const index = tx.store.index('tableName');

    const rows = await index.getAll(this.tableName) as ReplicatedRow<T>[];

    const sizeBytes = rows.reduce((sum, row) => sum + this.estimateRowSize(row), 0);
    const dirtyCount = rows.filter(row => row.isDirty).length;
    const accessTimes = rows.map(row => row.lastAccessedAt);

    return {
      rowCount: rows.length,
      sizeBytes,
      sizeMB: sizeBytes / 1024 / 1024,
      oldestAccess: accessTimes.length > 0 ? Math.min(...accessTimes) : 0,
      newestAccess: accessTimes.length > 0 ? Math.max(...accessTimes) : 0,
      dirtyCount,
    };
  }

  // ========================================
  // LRU/LFU EVICTION
  // ========================================

  /**
   * Evict least recently used rows to reduce memory footprint
   * Day 23-24: Prevents IndexedDB quota errors on large datasets
   *
   * @param targetSizeBytes - Target size in bytes (evict until under this threshold)
   * @returns Number of rows evicted
   */
  async evictLRU(targetSizeBytes: number): Promise<number> {
    const db = await this.getDb();
    const tx = db.transaction(REPLICATION_STORES.REPLICATED_TABLES, 'readwrite');
    const index = tx.store.index('tableName');

    const rows = await index.getAll(this.tableName) as ReplicatedRow<T>[];

    // Calculate current size
    let currentSize = rows.reduce((sum, row) => sum + this.estimateRowSize(row), 0);

    // If already under target, nothing to do
    if (currentSize <= targetSizeBytes) {
      this.logger.log(`[${this.tableName}] Cache size ${(currentSize / 1024 / 1024).toFixed(2)} MB already under target ${(targetSizeBytes / 1024 / 1024).toFixed(2)} MB`);
      return 0;
    }

    this.logger.log(
      `[${this.tableName}] LRU eviction: Current ${(currentSize / 1024 / 1024).toFixed(2)} MB, Target ${(targetSizeBytes / 1024 / 1024).toFixed(2)} MB`
    );

    // Day 25-26 LOW Fix: Hybrid LFU+LRU eviction with recent edit protection
    const RECENT_EDIT_PROTECTION_MS = 5 * 60 * 1000; // 5 minutes
    const EVICTION_GRACE_PERIOD_MS = 30 * 1000; // Issue #9 Fix: 30 seconds for active reads
    const now = Date.now();

    // Filter evictable rows (exclude dirty + recently edited + recently accessed)
    const evictableRows = rows
      .filter(row => {
        // NEVER evict dirty rows (have pending mutations)
        if (row.isDirty) return false;

        // Protect recently edited data (last 5 minutes)
        if (row.lastModifiedAt && (now - row.lastModifiedAt) < RECENT_EDIT_PROTECTION_MS) {
          return false;
        }

        // Issue #9 Fix: Don't evict recently accessed rows (last 30 seconds)
        // Prevents eviction during active reads
        if ((now - row.lastAccessedAt) < EVICTION_GRACE_PERIOD_MS) {
          return false;
        }

        return true;
      })
      .sort((a, b) => {
        // Hybrid LFU+LRU scoring (lower score = evict first)
        // 70% weight on frequency (LFU), 30% weight on recency (LRU)
        const accessCountA = a.accessCount || 1;
        const accessCountB = b.accessCount || 1;

        // Normalize timestamps to seconds to avoid overflow
        const recencyA = a.lastAccessedAt / 1000;
        const recencyB = b.lastAccessedAt / 1000;

        const scoreA = accessCountA * 0.7 + recencyA * 0.3;
        const scoreB = accessCountB * 0.7 + recencyB * 0.3;

        return scoreA - scoreB; // Lower score = less valuable = evict first
      });

    let evictedCount = 0;
    let i = 0;

    while (currentSize > targetSizeBytes && i < evictableRows.length) {
      const row = evictableRows[i];
      const rowSize = this.estimateRowSize(row);

      // Delete row from IndexedDB
      await tx.store.delete([row.tableName, row.id]);

      currentSize -= rowSize;
      evictedCount++;
      i++;
    }

    await tx.done;

    this.logger.log(
      `[${this.tableName}] LRU eviction complete: ${evictedCount} rows evicted, new size ${(currentSize / 1024 / 1024).toFixed(2)} MB`
    );

    // Notify listeners (cache changed)
    this.notifyListeners();

    return evictedCount;
  }

  // ========================================
  // SUBSCRIPTION / LISTENER MANAGEMENT
  // ========================================

  /**
   * Subscribe to changes
   * Returns unsubscribe function
   */
  subscribe(callback: (data: T[]) => void): () => void {
    this.listeners.add(callback);

    // Immediately call with current data
    this.getAllData().then(callback).catch(this.logger.error);

    // Return unsubscribe function
    return () => {
      this.listeners.delete(callback);
    };
  }

  /**
   * Notify all listeners of data changes
   *
   * Issue #6 Fix: Leading-edge debounce
   * - First call fires immediately (no delay)
   * - Subsequent rapid calls are debounced (100ms delay)
   * - Prevents notification starvation during continuous batch operations
   */
  async notifyListeners(): Promise<void> {
    // Leading-edge debounce: Fire immediately if this is the first call
    if (!this.hasNotifiedLeadingEdge) {
      this.hasNotifiedLeadingEdge = true;
      await this.actuallyNotifyListeners();
    }

    // Clear existing timer
    if (this.notifyDebounceTimer) {
      clearTimeout(this.notifyDebounceTimer);
    }

    // Set trailing-edge timer for subsequent updates
    this.notifyDebounceTimer = setTimeout(async () => {
      await this.actuallyNotifyListeners();
      this.notifyDebounceTimer = null;
      this.hasNotifiedLeadingEdge = false; // Reset flag
    }, NOTIFY_DEBOUNCE_MS);
  }

  /**
   * Issue #6 Fix: Extracted actual notification logic
   * Issue #10 Fix: Execute callbacks asynchronously to prevent blocking
   * - Separated from debouncing logic for clarity
   * - Used by both leading-edge and trailing-edge notifications
   * - Callbacks run async so one slow listener doesn't block others
   */
  private async actuallyNotifyListeners(): Promise<void> {
    const data = await this.getAllData();
    this.listeners.forEach((callback) => {
      // Execute asynchronously so one slow listener doesn't block others
      Promise.resolve()
        .then(() => callback(data))
        .catch(error => {
          this.logger.error(`[${this.tableName}] Listener error:`, error);
        });
    });
  }

  /**
   * Get listener count (for diagnostics)
   */
  getListenerCount(): number {
    return this.listeners.size;
  }

  // ========================================
  // SYNC METADATA
  // ========================================

  /**
   * Get sync metadata for this table
   * TIMEOUT PROTECTION: Prevents indefinite blocking when multiple tables sync simultaneously
   */
  async getSyncMetadata(): Promise<SyncMetadata | null> {
    const METADATA_TIMEOUT_MS = 5000; // 5 second timeout for metadata operations

    const readPromise = (async () => {
      const db = await this.getDb();
      return await db.get(REPLICATION_STORES.SYNC_METADATA, this.tableName) as SyncMetadata | null;
    })();

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`[${this.tableName}] Metadata read timed out after ${METADATA_TIMEOUT_MS}ms - possible transaction deadlock`));
      }, METADATA_TIMEOUT_MS);
    });

    try {
      const result = await Promise.race([readPromise, timeoutPromise]);
      return result;
    } catch (error) {
      this.logger.error(`[${this.tableName}] Metadata read failed:`, error);
      // Return null on timeout to allow sync to continue with default metadata
      return null;
    }
  }

  /**
   * Issue #7 Fix: Atomic increment for metadata updates
   * - For numeric fields (conflictCount, pendingMutations), use atomic increment
   * - Prevents race condition where concurrent updates lose increments
   * - Uses single transaction to ensure atomicity
   */
  async updateSyncMetadata(updates: Partial<SyncMetadata>): Promise<void> {
    const METADATA_TIMEOUT_MS = 5000; // 5 second timeout for metadata operations

    const updatePromise = (async () => {
      const db = await this.getDb();
      const tx = db.transaction(REPLICATION_STORES.SYNC_METADATA, 'readwrite');

      // Read existing metadata
      const existing = await tx.store.get(this.tableName);

      // CRITICAL FIX: Atomic increment for numeric fields
      // If updates contain numeric deltas, apply them atomically
      const atomicUpdates = { ...updates };

      if (updates.conflictCount !== undefined && existing) {
        // Treat as delta, not absolute value
        atomicUpdates.conflictCount = (existing.conflictCount || 0) + updates.conflictCount;
      }

      if (updates.pendingMutations !== undefined && existing) {
        // Treat as delta, not absolute value
        atomicUpdates.pendingMutations = (existing.pendingMutations || 0) + updates.pendingMutations;
      }

      // Merge with existing metadata
      const metadata: SyncMetadata = {
        tableName: this.tableName,
        lastFullSyncAt: existing?.lastFullSyncAt || 0,
        lastIncrementalSyncAt: existing?.lastIncrementalSyncAt || 0,
        syncStatus: existing?.syncStatus || 'idle',
        conflictCount: existing?.conflictCount || 0,
        pendingMutations: existing?.pendingMutations || 0,
        ...atomicUpdates,
      };

      await tx.store.put(metadata);
      await tx.done;
    })();

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`[${this.tableName}] Metadata update timed out after ${METADATA_TIMEOUT_MS}ms - possible transaction deadlock`));
      }, METADATA_TIMEOUT_MS);
    });

    try {
      await Promise.race([updatePromise, timeoutPromise]);
      this.logger.log(`[${this.tableName}] Metadata updated successfully`);
    } catch (error) {
      this.logger.error(`[${this.tableName}] Metadata update failed:`, error);
      throw error;
    }
  }
}
