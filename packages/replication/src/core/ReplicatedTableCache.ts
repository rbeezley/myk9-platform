/**
 * ReplicatedTableCache - Cache Management for Replicated Tables
 *
 * Responsibilities:
 * - TTL (Time-To-Live) expiration logic
 * - LRU/LFU cache eviction
 * - Cache statistics and monitoring
 * - Subscription/listener management with debouncing
 */

import type { IDBPDatabase } from 'idb';
import type { ReplicatedRow, SyncMetadata, CacheStats } from '../types';
import type { Logger } from '../dependencies';
import { REPLICATION_STORES } from './DatabaseManager';
import { NOTIFY_DEBOUNCE_MS } from '../constants';

/**
 * Cache manager for a replicated table
 * Handles TTL, eviction, stats, and subscriptions
 */
export class ReplicatedTableCacheManager<T extends { id: string }> {
  private listeners: Set<(data: T[]) => void> = new Set();
  private notifyDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private hasNotifiedLeadingEdge: boolean = false;

  /** Track last successful sync time (updated by refreshTimestamps) */
  private lastSuccessfulSyncAt: number = 0;

  constructor(
    private tableName: string,
    private getTtl: () => number,
    private logger: Logger,
    private getDb: () => Promise<IDBPDatabase>,
    private getAllData: () => Promise<T[]>
  ) {}

  // ========================================
  // TTL / EXPIRATION
  // ========================================

  /**
   * Update the last successful sync timestamp
   */
  setLastSuccessfulSync(timestamp: number): void {
    this.lastSuccessfulSyncAt = timestamp;
  }

  /**
   * Check if row is expired based on TTL
   *
   * IMPORTANT: Never expire dirty rows (rows with unsaved local changes)
   */
  isExpired(row: ReplicatedRow<T>): boolean {
    // Never expire dirty rows (have pending mutations)
    if (row.isDirty) {
      return false;
    }

    // Don't expire if offline (user may need stale data)
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return false;
    }

    // Don't expire if we haven't synced successfully in a while
    const ttl = this.getTtl();
    const timeSinceLastSync = Date.now() - this.lastSuccessfulSyncAt;

    // If we haven't synced successfully within 2x TTL, don't expire anything
    if (timeSinceLastSync > ttl * 2) {
      return false;
    }

    return Date.now() - row.lastSyncedAt > ttl;
  }

  /**
   * Refresh timestamps on all cached rows
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
   */
  estimateRowSize(row: ReplicatedRow<T>): number {
    try {
      const jsonStr = JSON.stringify(row);
      return new Blob([jsonStr]).size;
    } catch (error) {
      this.logger.warn(`[${this.tableName}] Failed to estimate row size, using fallback:`, error);
      return JSON.stringify(row).length * 2;
    }
  }

  /**
   * Estimate total size of all rows in bytes
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
   */
  async evictLRU(targetSizeBytes: number): Promise<number> {
    const db = await this.getDb();
    const tx = db.transaction(REPLICATION_STORES.REPLICATED_TABLES, 'readwrite');
    const index = tx.store.index('tableName');

    const rows = await index.getAll(this.tableName) as ReplicatedRow<T>[];

    let currentSize = rows.reduce((sum, row) => sum + this.estimateRowSize(row), 0);

    if (currentSize <= targetSizeBytes) {
      this.logger.log(`[${this.tableName}] Cache size ${(currentSize / 1024 / 1024).toFixed(2)} MB already under target`);
      return 0;
    }

    this.logger.log(
      `[${this.tableName}] LRU eviction: Current ${(currentSize / 1024 / 1024).toFixed(2)} MB, Target ${(targetSizeBytes / 1024 / 1024).toFixed(2)} MB`
    );

    const RECENT_EDIT_PROTECTION_MS = 5 * 60 * 1000;
    const EVICTION_GRACE_PERIOD_MS = 30 * 1000;
    const now = Date.now();

    // Filter evictable rows
    const evictableRows = rows
      .filter(row => {
        if (row.isDirty) return false;
        if (row.lastModifiedAt && (now - row.lastModifiedAt) < RECENT_EDIT_PROTECTION_MS) return false;
        if ((now - row.lastAccessedAt) < EVICTION_GRACE_PERIOD_MS) return false;
        return true;
      })
      .sort((a, b) => {
        // Hybrid LFU+LRU scoring
        const accessCountA = a.accessCount || 1;
        const accessCountB = b.accessCount || 1;
        const recencyA = a.lastAccessedAt / 1000;
        const recencyB = b.lastAccessedAt / 1000;
        const scoreA = accessCountA * 0.7 + recencyA * 0.3;
        const scoreB = accessCountB * 0.7 + recencyB * 0.3;
        return scoreA - scoreB;
      });

    let evictedCount = 0;

    for (const row of evictableRows) {
      if (currentSize <= targetSizeBytes) break;

      const rowSize = this.estimateRowSize(row);
      await tx.store.delete([row.tableName, row.id]);
      currentSize -= rowSize;
      evictedCount++;
    }

    await tx.done;

    this.logger.log(
      `[${this.tableName}] LRU eviction complete: ${evictedCount} rows evicted, new size ${(currentSize / 1024 / 1024).toFixed(2)} MB`
    );

    void this.notifyListeners().catch(error => {
      this.logger.error(`[${this.tableName}] Failed to notify listeners after eviction:`, error);
    });

    return evictedCount;
  }

  // ========================================
  // SUBSCRIPTION / LISTENER MANAGEMENT
  // ========================================

  /**
   * Subscribe to changes
   */
  subscribe(callback: (data: T[]) => void): () => void {
    let isActive = true;
    this.listeners.add(callback);
    this.getAllData()
      .then(data => {
        if (isActive) {
          callback(data);
        }
      })
      .catch(this.logger.error);
    return () => {
      isActive = false;
      this.listeners.delete(callback);
    };
  }

  /**
   * Notify all listeners of data changes (leading-edge debounce)
   */
  async notifyListeners(): Promise<void> {
    if (!this.hasNotifiedLeadingEdge) {
      this.hasNotifiedLeadingEdge = true;
      await this.actuallyNotifyListeners();
    }

    if (this.notifyDebounceTimer) {
      clearTimeout(this.notifyDebounceTimer);
    }

    this.notifyDebounceTimer = setTimeout(() => {
      void this.actuallyNotifyListeners()
        .catch(error => {
          this.logger.error(`[${this.tableName}] Failed to notify listeners:`, error);
        })
        .finally(() => {
          this.notifyDebounceTimer = null;
          this.hasNotifiedLeadingEdge = false;
        });
    }, NOTIFY_DEBOUNCE_MS);
  }

  private async actuallyNotifyListeners(): Promise<void> {
    const data = await this.getAllData();
    this.listeners.forEach((callback) => {
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
   */
  async getSyncMetadata(): Promise<SyncMetadata | null> {
    const METADATA_TIMEOUT_MS = 5000;

    const readPromise = (async () => {
      const db = await this.getDb();
      return await db.get(REPLICATION_STORES.SYNC_METADATA, this.tableName) as SyncMetadata | null;
    })();

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`[${this.tableName}] Metadata read timed out`));
      }, METADATA_TIMEOUT_MS);
    });

    try {
      return await Promise.race([readPromise, timeoutPromise]);
    } catch (error) {
      this.logger.error(`[${this.tableName}] Metadata read failed:`, error);
      return null;
    }
  }

  /**
   * Update sync metadata (with atomic increment for numeric fields).
   *
   * @param options.advanceWatermarkMonotonically When set, `lastIncrementalSyncAt`
   *   is advanced to `max(existing, update)` INSIDE this read-modify-write
   *   transaction rather than overwritten — so a slow concurrent sync that
   *   snapshotted an older watermark cannot regress a newer one. Leave unset for a
   *   literal write (e.g. cache reset to 0).
   */
  async updateSyncMetadata(
    updates: Partial<SyncMetadata>,
    options?: { advanceWatermarkMonotonically?: boolean }
  ): Promise<void> {
    const METADATA_TIMEOUT_MS = 5000;

    const updatePromise = (async () => {
      const db = await this.getDb();
      const tx = db.transaction(REPLICATION_STORES.SYNC_METADATA, 'readwrite');

      const existing = await tx.store.get(this.tableName);
      const atomicUpdates = { ...updates };

      // Atomic increment for numeric fields
      if (updates.conflictCount !== undefined && existing) {
        atomicUpdates.conflictCount = (existing.conflictCount || 0) + updates.conflictCount;
      }
      if (updates.pendingMutations !== undefined && existing) {
        atomicUpdates.pendingMutations = (existing.pendingMutations || 0) + updates.pendingMutations;
      }

      // Monotonic watermark advance against the LIVE persisted value (see jsdoc).
      if (options?.advanceWatermarkMonotonically && updates.lastIncrementalSyncAt !== undefined) {
        const existingWatermark = Number.isFinite(existing?.lastIncrementalSyncAt)
          ? (existing!.lastIncrementalSyncAt as number)
          : 0;
        atomicUpdates.lastIncrementalSyncAt = Math.max(
          existingWatermark,
          updates.lastIncrementalSyncAt
        );
      }

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
        reject(new Error(`[${this.tableName}] Metadata update timed out`));
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
