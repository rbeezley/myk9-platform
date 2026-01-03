/**
 * ReplicatedTableBatch - Batch Operations for Replicated Tables
 *
 * Responsibilities:
 * - Batch set (bulk insert)
 * - Chunked batch set (for large syncs)
 * - Batch delete
 * - Cache clearing
 *
 * CRITICAL: ID Normalization
 * All IDs MUST be stored as strings in IndexedDB because:
 * 1. Supabase returns bigserial/bigint IDs as numbers
 * 2. IndexedDB compound keys treat 2 and "2" as DIFFERENT keys
 * 3. Without normalization, we get duplicate records
 */

import type { IDBPDatabase } from 'idb';
import type { ReplicatedRow } from '../types';
import type { Logger } from '../dependencies';
import { REPLICATION_STORES } from './DatabaseManager';
import { MAX_CHUNK_SIZE } from '../constants';

/**
 * Batch operations manager for a replicated table
 */
export class ReplicatedTableBatchManager<T extends { id: string }> {
  constructor(
    private tableName: string,
    private logger: Logger,
    private getDb: () => Promise<IDBPDatabase>,
    private notifyListeners: () => void
  ) {}

  /**
   * Batch set (for initial sync)
   *
   * CRITICAL: Normalizes all IDs to strings to prevent duplicate records.
   */
  async batchSet(items: T[]): Promise<void> {
    const db = await this.getDb();
    const tx = db.transaction(REPLICATION_STORES.REPLICATED_TABLES, 'readwrite');

    for (const item of items) {
      const normalizedId = String(item.id);
      const normalizedData = { ...item, id: normalizedId } as T;

      const row: ReplicatedRow<T> = {
        tableName: this.tableName,
        id: normalizedId,
        data: normalizedData,
        version: 1,
        lastSyncedAt: Date.now(),
        lastAccessedAt: Date.now(),
        isDirty: false,
        syncStatus: 'synced',
      };

      await tx.store.put(row);
    }

    await tx.done;
    this.logger.log(`[${this.tableName}] Batch cached ${items.length} rows`);

    this.notifyListeners();
  }

  /**
   * Batch set with chunking (for large syncs > 500 rows)
   *
   * Processes data in chunks to:
   * - Reduce memory pressure
   * - Allow progress updates
   * - Prevent transaction timeouts
   */
  async batchSetChunked(items: T[], chunkSize: number = MAX_CHUNK_SIZE): Promise<void> {
    const totalRows = items.length;

    if (totalRows <= chunkSize) {
      return this.batchSet(items);
    }

    this.logger.log(`[${this.tableName}] Starting chunked batch set: ${totalRows} rows (chunks of ${chunkSize})`);

    let processedRows = 0;

    for (let i = 0; i < totalRows; i += chunkSize) {
      const chunk = items.slice(i, i + chunkSize);
      const db = await this.getDb();
      const tx = db.transaction(REPLICATION_STORES.REPLICATED_TABLES, 'readwrite');

      for (const item of chunk) {
        const normalizedId = String(item.id);
        const normalizedData = { ...item, id: normalizedId } as T;

        const row: ReplicatedRow<T> = {
          tableName: this.tableName,
          id: normalizedId,
          data: normalizedData,
          version: 1,
          lastSyncedAt: Date.now(),
          lastAccessedAt: Date.now(),
          isDirty: false,
          syncStatus: 'synced',
        };

        await tx.store.put(row);
      }

      await tx.done;
      processedRows += chunk.length;

      const progress = Math.round((processedRows / totalRows) * 100);
      this.logger.log(`[${this.tableName}] Chunk progress: ${processedRows}/${totalRows} (${progress}%)`);
    }

    this.logger.log(`[${this.tableName}] Chunked batch complete: ${processedRows} rows`);

    this.notifyListeners();
  }

  /**
   * Batch delete
   */
  async batchDelete(ids: string[]): Promise<void> {
    const db = await this.getDb();
    const tx = db.transaction(REPLICATION_STORES.REPLICATED_TABLES, 'readwrite');

    for (const id of ids) {
      const normalizedId = String(id);
      await tx.store.delete([this.tableName, normalizedId]);
    }

    await tx.done;
    this.logger.log(`[${this.tableName}] Batch deleted ${ids.length} rows`);

    this.notifyListeners();
  }

  /**
   * Clear all cached rows for this table
   */
  async clearCache(): Promise<void> {
    const db = await this.getDb();
    const tx = db.transaction(REPLICATION_STORES.REPLICATED_TABLES, 'readwrite');
    const index = tx.store.index('tableName');

    const keys = await index.getAllKeys(this.tableName);
    for (const key of keys) {
      await tx.store.delete(key);
    }

    await tx.done;
    this.logger.log(`[${this.tableName}] Cache cleared`);

    this.notifyListeners();
  }
}
