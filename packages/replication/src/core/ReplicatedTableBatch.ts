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
import { downloadLeavesRowAsIs, shouldKeepNewerRow } from './downloadRowGuards';
import { MAX_CHUNK_SIZE } from '../constants';
import { withQuotaEviction } from '../quota-eviction';
import { deleteRowsIfClean, type DeleteRowsIfCleanResult } from './deleteRowsIfClean';
import type { SyncDeleteAuthority } from './syncDeleteAuthority';
import {
  repairStuckPendingFlags,
  type RepairStuckPendingFlagsResult,
  type StuckRepairAdapter,
} from './repairStuckPendingFlags';

/**
 * Batch operations manager for a replicated table
 */
export class ReplicatedTableBatchManager<T extends { id: string }> {
  constructor(
    private tableName: string,
    private logger: Logger,
    private getDb: () => Promise<IDBPDatabase>,
    private notifyListeners: () => void,
    /** Frees cache space when a bulk write hits the storage quota. */
    private relieveQuota: () => Promise<number>,
    /**
     * Whether a downloaded row may be stored, asked inside the write's
     * transaction just before the put (see ReplicatedTable.acceptsRemoteRow).
     */
    private acceptsRemoteRow: (id: string) => boolean = () => true
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
  async batchSet(
    items: T[],
    serverVersions?: Map<string, number>,
    ownerAuthUserId?: string,
    versionsAtFetch?: ReadonlyMap<string, number>
  ): Promise<void> {
    // Bulk sync downloads are the most likely point to overflow the storage
    // quota. Evict + retry once on a quota abort instead of letting it escape.
    await withQuotaEviction(
      () => this.batchSetOnce(items, serverVersions, ownerAuthUserId, versionsAtFetch),
      () => this.relieveQuota(),
      this.logger
    );
  }

  /** Single attempt of {@link batchSet}; opens its own transaction so it is safe to retry. */
  private async batchSetOnce(
    items: T[],
    serverVersions?: Map<string, number>,
    ownerAuthUserId?: string,
    versionsAtFetch?: ReadonlyMap<string, number>
  ): Promise<void> {
    const db = await this.getDb();
    const tx = db.transaction(REPLICATION_STORES.REPLICATED_TABLES, 'readwrite');
    let changedRows = 0;

    for (const item of items) {
      const normalizedId = String(item.id);

      // Guard: skip if existing row is locally-dirty (pending local mutation).
      const existingRow = (await tx.store.get([this.tableName, normalizedId])) as
        ReplicatedRow<T> | undefined;
      if (existingRow?.isDirty) {
        this.logger.log(
          `[${this.tableName}] Skipped server push for row ${normalizedId} — local mutation pending`
        );
        continue;
      }

      // Asked synchronously inside this transaction, right before the put, so a
      // decision the table made after the download was read (a delete it saw
      // confirmed) still holds at the write.
      if (!this.acceptsRemoteRow(normalizedId)) {
        this.logger.log(
          `[${this.tableName}] Skipped server push for row ${normalizedId} — refused`
        );
        continue;
      }

      // A download that read the server before a local write was acknowledged
      // carries an older version than the row now holds (MYK9-1050 review):
      // applying it would roll the acknowledged write back. Same transaction
      // as the put, so it is atomic against the ack.
      if (
        shouldKeepNewerRow(
          existingRow,
          serverVersions?.get(normalizedId),
          ownerAuthUserId,
          versionsAtFetch?.get(normalizedId)
        )
      ) {
        continue;
      }

      const normalizedData = { ...item, id: normalizedId } as T;
      // Prefer the caller-supplied server version; fall back to what was already
      // stored so a re-sync without a version column doesn't wipe the OCC precondition.
      const serverVersion = serverVersions?.get(normalizedId) ?? existingRow?.serverVersion;
      const owner = ownerAuthUserId ?? existingRow?.ownerAuthUserId;
      const unchanged = downloadLeavesRowAsIs(existingRow, normalizedData, serverVersion, owner);
      if (!unchanged) changedRows++;

      const row: ReplicatedRow<T> = {
        tableName: this.tableName,
        id: normalizedId,
        data: normalizedData,
        // An unchanged re-download keeps its version: nothing a local writer
        // compared against has moved (MYK9-1332).
        version: existingRow ? (unchanged ? existingRow.version : existingRow.version + 1) : 1,
        lastSyncedAt: Date.now(),
        lastAccessedAt: Date.now(),
        isDirty: false,
        syncStatus: 'synced',
        ...(serverVersion !== undefined && { serverVersion }),
        ...(owner !== undefined && { ownerAuthUserId: owner }),
      };

      await tx.store.put(row);
    }

    await tx.done;
    this.logger.log(
      `[${this.tableName}] Batch cached ${items.length} rows (${changedRows} changed)`
    );

    // Only a row that actually changed is news to a subscriber. The incremental
    // sync re-downloads every row inside its 60 s `since` buffer on every pass,
    // and on a quiet table that is the same unchanged rows each time; notifying
    // anyway made every registrations pass refetch the dog rosters (MYK9-1332).
    if (changedRows > 0) this.notifyListeners();
  }

  /**
   * The serverVersion of each of `ids` that is stored clean, read in one
   * transaction. A full sync reads it just before its fetch, as the
   * `versionsAtFetch` its write passes to {@link batchSet} (MYK9-1633). A row
   * with a write pending is left out, so it keeps the guard. A failed read
   * answers with no versions: every row keeps the guard, and the sync goes on.
   */
  async cleanServerVersions(ids: Iterable<string>): Promise<Map<string, number>> {
    const versions = new Map<string, number>();
    try {
      const db = await this.getDb();
      const tx = db.transaction(REPLICATION_STORES.REPLICATED_TABLES, 'readonly');
      for (const id of ids) {
        const row = (await tx.store.get([this.tableName, String(id)])) as
          ReplicatedRow<T> | undefined;
        if (row && !row.isDirty && row.serverVersion !== undefined) {
          versions.set(row.id, row.serverVersion);
        }
      }
      await tx.done;
      return versions;
    } catch (error) {
      this.logger.log(`[${this.tableName}] Could not read server versions before a fetch:`, error);
      return new Map();
    }
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
  async batchSetChunked(
    items: T[],
    chunkSize: number = MAX_CHUNK_SIZE,
    serverVersions?: Map<string, number>,
    ownerAuthUserId?: string
  ): Promise<void> {
    const totalRows = items.length;

    if (totalRows <= chunkSize) {
      return this.batchSet(items, serverVersions, ownerAuthUserId);
    }

    // The chunked write already rolls itself back atomically on failure, so a
    // quota abort leaves a clean slate — safe to evict and retry the whole run.
    await withQuotaEviction(
      () => this.batchSetChunkedOnce(items, chunkSize, serverVersions, ownerAuthUserId),
      () => this.relieveQuota(),
      this.logger
    );
  }

  /** Single attempt of {@link batchSetChunked}; self-rolls-back, so it is safe to retry. */
  private async batchSetChunkedOnce(
    items: T[],
    chunkSize: number,
    serverVersions?: Map<string, number>,
    ownerAuthUserId?: string
  ): Promise<void> {
    const totalRows = items.length;

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
        ReplicatedRow<T> | undefined;
      preState.set(id, existing);
    }
    await walTx.done;

    // ── Chunked writes ───────────────────────────────────────────────────────
    let processedRows = 0;
    let changedRows = 0;
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
            ReplicatedRow<T> | undefined;
          if (existingRow?.isDirty) {
            this.logger.log(
              `[${this.tableName}] Skipped server push for row ${normalizedId} — local mutation pending`
            );
            continue;
          }

          if (!this.acceptsRemoteRow(normalizedId)) continue;

          if (shouldKeepNewerRow(existingRow, serverVersions?.get(normalizedId), ownerAuthUserId)) {
            continue;
          }

          const normalizedData = { ...item, id: normalizedId } as T;
          const serverVersion = serverVersions?.get(normalizedId) ?? existingRow?.serverVersion;
          const owner = ownerAuthUserId ?? existingRow?.ownerAuthUserId;
          const unchanged = downloadLeavesRowAsIs(
            existingRow,
            normalizedData,
            serverVersion,
            owner
          );
          if (!unchanged) changedRows++;

          const row: ReplicatedRow<T> = {
            tableName: this.tableName,
            id: normalizedId,
            data: normalizedData,
            version: existingRow ? (unchanged ? existingRow.version : existingRow.version + 1) : 1,
            lastSyncedAt: Date.now(),
            lastAccessedAt: Date.now(),
            isDirty: false,
            syncStatus: 'synced',
            ...(serverVersion !== undefined && { serverVersion }),
            ...(owner !== undefined && { ownerAuthUserId: owner }),
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
            ReplicatedRow<T> | undefined;
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

    this.logger.log(
      `[${this.tableName}] Chunked batch complete: ${processedRows} rows (${changedRows} changed)`
    );

    // Same rule as batchSet: unchanged re-downloads are not news (MYK9-1332).
    if (changedRows > 0) this.notifyListeners();
  }

  /**
   * Batch delete
   */
  async batchDelete(ids: string[], by?: SyncDeleteAuthority): Promise<void> {
    const db = await this.getDb();
    if (by?.aborted) return;
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
   * Delete the rows that hold no unsynced local work, in ONE transaction that
   * also reads the mutation queue (see `deleteRowsIfClean`). Rows with work are
   * returned in `kept` and left untouched.
   */
  async deleteRowsIfClean(
    ids: Iterable<string>,
    remoteVersions?: ReadonlyMap<string, number>,
    by?: SyncDeleteAuthority
  ): Promise<DeleteRowsIfCleanResult> {
    const db = await this.getDb();
    // Nothing deleted: every id is reported kept, the safe answer.
    if (by?.aborted) return { deleted: [], kept: [...new Set([...ids].map(String))] };
    const result = await deleteRowsIfClean(db, this.tableName, ids, remoteVersions);
    if (result.deleted.length > 0) {
      this.logger.log(`[${this.tableName}] Deleted ${result.deleted.length} clean rows`);
      this.notifyListeners();
    }
    return result;
  }

  /** Refresh rows stuck at a `'pending'` data flag (MYK9-1055; see repairStuckPendingFlags). */
  async repairStuckPendingFlags<TRemote>(
    adapter: StuckRepairAdapter<TRemote, T>
  ): Promise<RepairStuckPendingFlagsResult> {
    const db = await this.getDb();
    const result = await repairStuckPendingFlags(db, this.tableName, adapter);
    if (result.refreshed.length + result.normalized.length > 0) {
      this.logger.log(
        `[${this.tableName}] Repaired ${result.refreshed.length + result.normalized.length} rows stuck pending`
      );
      this.notifyListeners();
    }
    return result;
  }

  /**
   * Clear all cached rows for this table
   */
  /** Resolves false, having cleared nothing, when `by` has aborted. */
  async clearCache(by?: SyncDeleteAuthority): Promise<boolean> {
    const db = await this.getDb();
    if (by?.aborted) return false;
    const tx = db.transaction(REPLICATION_STORES.REPLICATED_TABLES, 'readwrite');
    const index = tx.store.index('tableName');

    const keys = await index.getAllKeys(this.tableName);
    for (const key of keys) {
      if (by?.aborted) break;
      await tx.store.delete(key);
    }

    await tx.done;
    this.logger.log(`[${this.tableName}] Cache cleared`);

    this.notifyListeners();
    return true;
  }
}
