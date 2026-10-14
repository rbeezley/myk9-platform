/**
 * ReplicatedTableCache - Cache Management for Replicated Tables
 *
 * Responsibilities:
 * - LRU/LFU cache eviction
 * - Cache statistics and monitoring
 * - Subscription/listener management with debouncing
 */

import type { IDBPDatabase } from 'idb';
import type {
  ReplicatedReadResult,
  ReplicatedRow,
  SyncMetadata,
  ScopeSyncState,
  CacheStats,
} from '../types';
import type { Logger } from '../dependencies';
import { REPLICATION_STORES } from './DatabaseManager';
import { NOTIFY_DEBOUNCE_MS } from '../constants';
import { resolveScopeStamp, type ScopeStampDirective } from './scopeStamp';

export interface ReplicatedTableSubscriptionOptions {
  /**
   * Emit the current IndexedDB snapshot after subscribing.
   * Defaults to true for backward compatibility.
   */
  emitCurrent?: boolean;

  /**
   * Receive snapshot read failures without changing the legacy row callback.
   */
  onError?: (error: unknown) => void;
}

/**
 * Cache manager for a replicated table
 * Handles capacity eviction, stats, and subscriptions; rows never expire by age
 */
export class ReplicatedTableCacheManager<T extends { id: string }> {
  private listeners: Set<(data: T[]) => void> = new Set();
  private listenerErrorCallbacks = new Map<(data: T[]) => void, (error: unknown) => void>();
  private notifyDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private hasNotifiedLeadingEdge: boolean = false;

  constructor(
    private tableName: string,
    private logger: Logger,
    private getDb: () => Promise<IDBPDatabase>,
    private getAllData: () => Promise<ReplicatedReadResult<T>>
  ) {}

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

    const rows = (await index.getAll(this.tableName)) as ReplicatedRow<T>[];

    return rows.reduce((sum, row) => sum + this.estimateRowSize(row), 0);
  }

  /**
   * Get cache statistics for this table
   */
  async getCacheStats(): Promise<CacheStats> {
    const db = await this.getDb();
    const tx = db.transaction(REPLICATION_STORES.REPLICATED_TABLES, 'readonly');
    const index = tx.store.index('tableName');

    const rows = (await index.getAll(this.tableName)) as ReplicatedRow<T>[];

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
   * Evict least recently used rows down to an absolute byte target.
   */
  async evictLRU(targetSizeBytes: number): Promise<number> {
    return this.evictToTarget(() => targetSizeBytes);
  }

  /**
   * Evict the oldest/least-used rows until only `retainFraction` of this
   * table's current footprint remains (e.g. 0.7 sheds the oldest ~30%).
   *
   * Single table scan — unlike `estimateTotalSize()` followed by
   * `evictLRU(size * fraction)`, which scans the table twice. This matters
   * because eviction runs precisely when storage is under quota pressure.
   *
   * SCOPE: this table only. All replicated tables share one object store and
   * the browser quota is global, so this frees space within the overflowing
   * table but does not reclaim another table's evictable rows.
   */
  async evictRetainingFraction(retainFraction: number): Promise<number> {
    return this.evictToTarget(currentSize => Math.floor(currentSize * retainFraction));
  }

  /**
   * Shared eviction core: load the table once, derive the byte target from the
   * measured current size, then evict LRU/LFU-ranked rows until at/under target.
   * Dirty and recently-touched rows are always protected.
   */
  private async evictToTarget(deriveTarget: (currentSize: number) => number): Promise<number> {
    const db = await this.getDb();
    const tx = db.transaction(REPLICATION_STORES.REPLICATED_TABLES, 'readwrite');
    const index = tx.store.index('tableName');

    const rows = (await index.getAll(this.tableName)) as ReplicatedRow<T>[];

    let currentSize = rows.reduce((sum, row) => sum + this.estimateRowSize(row), 0);
    const targetSizeBytes = deriveTarget(currentSize);

    if (currentSize <= targetSizeBytes) {
      this.logger.log(
        `[${this.tableName}] Cache size ${(currentSize / 1024 / 1024).toFixed(2)} MB already under target`
      );
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
        if (row.lastModifiedAt && now - row.lastModifiedAt < RECENT_EDIT_PROTECTION_MS)
          return false;
        if (now - row.lastAccessedAt < EVICTION_GRACE_PERIOD_MS) return false;
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
  subscribe(
    callback: (data: T[]) => void,
    options: ReplicatedTableSubscriptionOptions = {}
  ): () => void {
    let isActive = true;
    this.listeners.add(callback);
    if (options.onError) {
      this.listenerErrorCallbacks.set(callback, options.onError);
    }
    if (options.emitCurrent !== false) {
      this.getAllData()
        .then(result => {
          if (!isActive) return;

          if (result.ok) {
            callback(result.rows);
          } else {
            options.onError?.(result.error);
          }
        })
        .catch(error => {
          this.logger.error(error);
          if (isActive) options.onError?.(error);
        });
    }
    return () => {
      isActive = false;
      this.listeners.delete(callback);
      this.listenerErrorCallbacks.delete(callback);
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
    const result = await this.getAllData();
    if (!result.ok) {
      this.listenerErrorCallbacks.forEach(onError => {
        Promise.resolve()
          .then(() => onError(result.error))
          .catch(error => {
            this.logger.error(`[${this.tableName}] Listener error callback failed:`, error);
          });
      });
      return;
    }

    this.listeners.forEach(callback => {
      Promise.resolve()
        .then(() => callback(result.rows))
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
   * Get sync metadata for this table.
   *
   * When `scopeValue` is provided, the returned `lastIncrementalSyncAt` and
   * `totalRows` and `expectedRemoteRows` are projected from that scope's
   * `scopes[scopeValue]` sub-record
   * (defaulting to `0` when the scope has never synced). Callers therefore read
   * a scope-correct watermark without any branching. When `scopeValue` is
   * `undefined`, the raw table-global row is returned unchanged (back-compat).
   */
  async getSyncMetadata(scopeValue?: string): Promise<SyncMetadata | null> {
    try {
      return await this.getSyncMetadataOrThrow(scopeValue);
    } catch {
      return null;
    }
  }

  /** {@link getSyncMetadata} that throws on a failed or timed-out read (already logged). */
  async getSyncMetadataOrThrow(scopeValue?: string): Promise<SyncMetadata | null> {
    const METADATA_TIMEOUT_MS = 5000;

    const readPromise = (async () => {
      const db = await this.getDb();
      const row = (await db.get(REPLICATION_STORES.SYNC_METADATA, this.tableName)) as
        SyncMetadata | undefined;
      return this.projectScopedMetadata(row ?? null, scopeValue);
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
      throw error;
    }
  }

  /**
   * Overlay the per-scope watermark/row-count onto the returned metadata so the
   * scope-sensitive fields reflect `scopes[scopeValue]` rather than the shared
   * table-global slot. Missing scope → watermark of `0` (forces a fetch from
   * epoch, which is safe: it can never skip rows).
   */
  private projectScopedMetadata(
    row: SyncMetadata | null,
    scopeValue?: string
  ): SyncMetadata | null {
    if (!row || scopeValue === undefined) {
      return row;
    }
    const scoped = row.scopes?.[scopeValue];
    const projected: SyncMetadata = {
      ...row,
      lastIncrementalSyncAt: scoped?.lastIncrementalSyncAt ?? 0,
    };
    // totalRows is scope-specific. Replace the spread-in table-global value with
    // this scope's count, and DROP it entirely for a scope that has never synced
    // — otherwise a brand-new scope would report a stale legacy/unscoped count.
    if (scoped?.totalRows !== undefined) {
      projected.totalRows = scoped.totalRows;
    } else {
      delete projected.totalRows;
    }
    if (scoped?.expectedRemoteRows !== undefined) {
      projected.expectedRemoteRows = scoped.expectedRemoteRows;
    } else {
      delete projected.expectedRemoteRows;
    }
    // Same rule as totalRows: another scope's (or the legacy global) stamp must
    // never describe this scope.
    if (scoped?.syncedByAuthUserId !== undefined) {
      projected.syncedByAuthUserId = scoped.syncedByAuthUserId;
    } else {
      delete projected.syncedByAuthUserId;
    }
    return projected;
  }

  /**
   * Update sync metadata (with atomic increment for numeric fields).
   *
   * When `options.scopeValue` is provided, the scope-sensitive fields
   * (`lastIncrementalSyncAt`, `totalRows`, `expectedRemoteRows`) are routed
   * into `scopes[scopeValue]`
   * instead of the table-global slot — table-global fields (`syncStatus`,
   * `errorMessage`, `conflictCount`, `pendingMutations`) still update globally.
   * The full `scopes` map is always preserved across calls so an unscoped
   * status-only update can't wipe other scopes' watermarks.
   *
   * When `options.advanceWatermarkMonotonically` is set, `lastIncrementalSyncAt`
   * is advanced to `max(existing, update)` INSIDE this read-modify-write
   * transaction rather than overwritten — so a slow concurrent sync that
   * snapshotted an older watermark cannot regress a newer one. Applies to both
   * the scope-specific slot (when scoped) and the table-global mirror.
   */
  async updateSyncMetadata(
    updates: Partial<SyncMetadata>,
    options?: {
      scopeValue?: string;
      advanceWatermarkMonotonically?: boolean;
      /**
       * Scoped writes only. A string stamps the scope as synced by that auth
       * user, null clears the stamp, undefined keeps the scope's current one. A
       * {@link ScopeStampDirective} is settled here against the stored stamp.
       */
      scopeSyncedBy?: string | null | ScopeStampDirective;
    }
  ): Promise<void> {
    const METADATA_TIMEOUT_MS = 5000;

    const updatePromise = (async () => {
      const db = await this.getDb();
      const tx = db.transaction(REPLICATION_STORES.SYNC_METADATA, 'readwrite');

      const existing = await tx.store.get(this.tableName);
      const atomicUpdates = { ...updates };
      const storedStamp =
        options?.scopeValue !== undefined
          ? existing?.scopes?.[options.scopeValue]?.syncedByAuthUserId
          : existing?.syncedByAuthUserId;
      const settled = resolveScopeStamp(options?.scopeSyncedBy, storedStamp);
      if (settled.freezeCursor) {
        // Not this sync's cursor to move (see ResolvedScopeStamp.freezeCursor).
        delete atomicUpdates.lastIncrementalSyncAt;
        delete atomicUpdates.lastFullSyncAt;
        delete atomicUpdates.totalRows;
        delete atomicUpdates.expectedRemoteRows;
      }
      if (settled.recordMarker && options?.scopeValue === undefined) {
        atomicUpdates.totalRows = updates.totalRows ?? existing?.totalRows ?? 0;
      }

      // Atomic increment for numeric fields
      if (updates.conflictCount !== undefined && existing) {
        atomicUpdates.conflictCount = (existing.conflictCount || 0) + updates.conflictCount;
      }
      if (updates.pendingMutations !== undefined && existing) {
        atomicUpdates.pendingMutations =
          (existing.pendingMutations || 0) + updates.pendingMutations;
      }

      // Per-scope watermark routing + optional monotonic advance.
      // Scope-sensitive fields belong to the scope's sub-record so a sync under
      // scope B can't advance scope A's `since` past rows A hasn't fetched yet.
      // advanceWatermarkMonotonically additionally ensures a slow concurrent sync
      // can never regress a faster one's watermark — applies inside this transaction
      // so the max is always against the LIVE persisted value.
      let scopes = existing?.scopes;
      const { scopeValue, advanceWatermarkMonotonically } = options ?? {};

      if (scopeValue !== undefined) {
        const prevScope = existing?.scopes?.[scopeValue];
        const incomingWatermark = settled.freezeCursor ? undefined : updates.lastIncrementalSyncAt;
        const rawWatermark = incomingWatermark ?? prevScope?.lastIncrementalSyncAt ?? 0;
        const nextWatermark =
          advanceWatermarkMonotonically && incomingWatermark !== undefined
            ? Math.max(prevScope?.lastIncrementalSyncAt ?? 0, incomingWatermark)
            : rawWatermark;
        const nextScope: ScopeSyncState = { lastIncrementalSyncAt: nextWatermark };
        const nextTotalRows =
          (settled.freezeCursor ? undefined : updates.totalRows) ??
          prevScope?.totalRows ??
          (settled.recordMarker ? 0 : undefined);
        const nextExpectedRemoteRows =
          (settled.freezeCursor ? undefined : updates.expectedRemoteRows) ??
          prevScope?.expectedRemoteRows;
        if (nextTotalRows !== undefined) {
          nextScope.totalRows = nextTotalRows;
        }
        if (nextExpectedRemoteRows !== undefined) {
          nextScope.expectedRemoteRows = nextExpectedRemoteRows;
        }
        const nextSyncedBy =
          settled.stamp === undefined
            ? prevScope?.syncedByAuthUserId
            : (settled.stamp ?? undefined);
        if (nextSyncedBy !== undefined) {
          nextScope.syncedByAuthUserId = nextSyncedBy;
        }
        scopes = { ...existing?.scopes, [scopeValue]: nextScope };

        // Mirror an informational, monotonic "last incremental sync across ANY
        // scope" onto the table-global field so unscoped getSyncMetadata() reads
        // stay meaningful (e.g. a "last synced" UI indicator). The scoped READ
        // path — getSyncMetadata(scopeValue) — NEVER consults this; it uses
        // scopes[scopeValue] defaulting to 0. So this mirror cannot reintroduce
        // cross-scope row-skipping.
        if (incomingWatermark !== undefined) {
          atomicUpdates.lastIncrementalSyncAt = Math.max(
            existing?.lastIncrementalSyncAt ?? 0,
            incomingWatermark
          );
        } else {
          delete atomicUpdates.lastIncrementalSyncAt;
        }
        // totalRows has no meaningful table-global aggregate — keep it scope-only.
        delete atomicUpdates.totalRows;
        // expectedRemoteRows is also scope-specific — keep it scope-only.
        delete atomicUpdates.expectedRemoteRows;
      } else if (
        advanceWatermarkMonotonically &&
        !settled.freezeCursor &&
        updates.lastIncrementalSyncAt !== undefined
      ) {
        // No scope: advance table-global watermark monotonically.
        const existingWatermark = Number.isFinite(existing?.lastIncrementalSyncAt)
          ? (existing!.lastIncrementalSyncAt as number)
          : 0;
        atomicUpdates.lastIncrementalSyncAt = Math.max(
          existingWatermark,
          updates.lastIncrementalSyncAt
        );
      }

      // The table-level stamp (an unscoped sync, or clearCache). Kept across
      // every other update; a scoped write never touches it.
      let tableSyncedBy = existing?.syncedByAuthUserId;
      if (scopeValue === undefined && settled.stamp !== undefined) {
        tableSyncedBy = settled.stamp ?? undefined;
        // An unscoped sync replaces the rows under every scope, so a scoped
        // stamp it supersedes must not outlive it: it would out-rank the newer
        // table stamp and hand one account's rows to another.
        if (scopes) {
          scopes = Object.fromEntries(
            (Object.entries(scopes) as [string, ScopeSyncState][]).map(([key, state]) => {
              const next: ScopeSyncState = { ...state };
              delete next.syncedByAuthUserId;
              if (tableSyncedBy !== undefined) next.syncedByAuthUserId = tableSyncedBy;
              return [key, next];
            })
          );
        }
      }
      delete atomicUpdates.syncedByAuthUserId;

      const metadata: SyncMetadata = {
        tableName: this.tableName,
        lastFullSyncAt: existing?.lastFullSyncAt || 0,
        lastIncrementalSyncAt: existing?.lastIncrementalSyncAt || 0,
        syncStatus: existing?.syncStatus || 'idle',
        conflictCount: existing?.conflictCount || 0,
        pendingMutations: existing?.pendingMutations || 0,
        ...(scopes !== undefined && { scopes }),
        // Table-level coverage survives any write that does not set it: a stamp
        // without its marker would read as never-synced (MYK9-1148).
        ...(existing?.totalRows !== undefined && { totalRows: existing.totalRows }),
        ...(existing?.expectedRemoteRows !== undefined && {
          expectedRemoteRows: existing.expectedRemoteRows,
        }),
        ...atomicUpdates,
        ...(tableSyncedBy !== undefined && { syncedByAuthUserId: tableSyncedBy }),
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
