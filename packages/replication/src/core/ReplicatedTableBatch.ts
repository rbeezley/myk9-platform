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
   *
   * Guard: never overwrite a locally-dirty row with a clean server value.
   * A dirty row has a pending mutation that hasn't been flushed to Supabase
   * yet. Allowing a sync download (isDirty=false) to clobber it would cause
   * data loss — this mirrors the Phase 1 set() guard (scoring-sync-bug fix).
   */
  async batchSet(items: T[], serverVersions?: Map<string, number>): Promise<void> {
    const db = await this.getDb();
    const tx = db.transaction(REPLICATION_STORES.REPLICATED_TABLES, 'readwrite');

    for (const item of items) {
      const normalizedId = String(item.id);

      // Guard: skip if existing row is locally-dirty (pending local mutation).
      const existingRow = (await tx.store.get([this.tableName, normalizedId])) as
        | ReplicatedRow<T>
        | undefined;
      if (existingRow?.isDirty) {
        this.logger.log(
          `[${this.tableName}] Skipped server push for row ${normalizedId} — local mutation pending`
        );
        continue;
      }

      const normalizedData = { ...item, id: normalizedId } as T;
      // Prefer the caller-supplied server version; fall back to what was already
      // stored so a re-sync without a version column doesn't wipe the OCC precondition.
      const serverVersion = serverVersions?.get(normalizedId) ?? existingRow?.serverVersion;

      const row: ReplicatedRow<T> = {
        tableName: this.tableName,
        id: normalizedId,
        data: normalizedData,
        version: existingRow ? existingRow.version + 1 : 1,
        lastSyncedAt: Date.now(),
        lastAccessedAt: Date.now(),
        isDirty: false,
        syncStatus: 'synced',
        ...(serverVersion !== undefined && { serverVersion }),
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
   *
   * Atomicity (B2 fix — write-ahead log approach): before writing any chunk,
   * snapshot the pre-existing IDB state for every affected row.  If any chunk
   * fails, all previously committed chunks are rolled back by restoring the
   * snapshot, and the error is re-thrown so callers can retry cleanly.
   *
   * A single IDB transaction for the entire set was considered but rejected:
   * the reason chunking exists at all is to prevent transaction timeouts on
   * large initial syncs (hundreds of rows). A single transaction spanning all
   * chunks would re-introduce the timeout risk.  The write-ahead log gives us
   * atomicity without that constraint.
   */
  async batchSetChunked(items: T[], chunkSize: number = MAX_CHUNK_SIZE, serverVersions?: Map<string, number>): Promise<void> {
    const totalRows = items.length;

    if (totalRows <= chunkSize) {
      return this.batchSet(items, serverVersions);
    }

    this.logger.log(
      `[${this.tableName}] Starting chunked batch set: ${totalRows} rows (chunks of ${chunkSize})`
    );

    // ── Write-ahead log: snapshot pre-existing state of every affected row ──
    const affectedIds = items.map(item => String(item.id));
    const walDb = await this.getDb();
    const walTx = walDb.transaction(REPLICATION_STORES.REPLICATED_TABLES, 'readonly');
    const preState = new Map<string, ReplicatedRow<T> | undefined>();
    for (const id of affectedIds) {
      const existing = (await walTx.store.get([this.tableName, id])) as
        | ReplicatedRow<T>
        | undefined;
      preState.set(id, existing);
    }
    await walTx.done;

    // ── Chunked writes ───────────────────────────────────────────────────────
    let processedRows = 0;
    let lastCommittedChunk = -1;

    try {
      for (let i = 0; i < totalRows; i += chunkSize) {
        const chunk = items.slice(i, i + chunkSize);
        const db = await this.getDb();
        const tx = db.transaction(REPLICATION_STORES.REPLICATED_TABLES, 'readwrite');

        for (const item of chunk) {
          const normalizedId = String(item.id);

          // Guard: skip if existing row is locally-dirty (pending local mutation).
          const existingRow = (await tx.store.get([this.tableName, normalizedId])) as
            | ReplicatedRow<T>
            | undefined;
          if (existingRow?.isDirty) {
            this.logger.log(
              `[${this.tableName}] Skipped server push for row ${normalizedId} — local mutation pending`
            );
            continue;
          }

          const normalizedData = { ...item, id: normalizedId } as T;
          const serverVersion = serverVersions?.get(normalizedId) ?? existingRow?.serverVersion;

          const row: ReplicatedRow<T> = {
            tableName: this.tableName,
            id: normalizedId,
            data: normalizedData,
            version: existingRow ? existingRow.version + 1 : 1,
            lastSyncedAt: Date.now(),
            lastAccessedAt: Date.now(),
            isDirty: false,
            syncStatus: 'synced',
            ...(serverVersion !== undefined && { serverVersion }),
          };

          await tx.store.put(row);
        }

        await tx.done;
        lastCommittedChunk = i;
        processedRows += chunk.length;

        const progress = Math.round((processedRows / totalRows) * 100);
        this.logger.log(
          `[${this.tableName}] Chunk progress: ${processedRows}/${totalRows} (${progress}%)`
        );
      }
    } catch (err) {
      // ── Rollback: restore pre-existing state for all affected rows ─────────
      // Skip rows that became dirty after snapshot — concurrent set() wins.
      this.logger.log(
        `[${this.tableName}] Chunk failed after committing up to index ${lastCommittedChunk}; rolling back`
      );
      try {
        const rbDb = await this.getDb();
        const rbTx = rbDb.transaction(REPLICATION_STORES.REPLICATED_TABLES, 'readwrite');
        for (const [id, snapshot] of preState) {
          const current = (await rbTx.store.get([this.tableName, id])) as
            | ReplicatedRow<T>
            | undefined;
          if (current?.isDirty) {
            this.logger.log(
              `[${this.tableName}] Rollback skipped row ${id} — concurrent local mutation pending`
            );
            continue;
          }
          if (snapshot === undefined) {
            // Row did not exist before — delete it if it was partially written.
            await rbTx.store.delete([this.tableName, id]);
          } else {
            // Row existed before — restore the snapshot.
            await rbTx.store.put(snapshot);
          }
        }
        await rbTx.done;
        this.logger.log(`[${this.tableName}] Rollback complete`);
      } catch (rbErr) {
        this.logger.log(`[${this.tableName}] Rollback failed:`, rbErr);
      }
      throw err;
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
