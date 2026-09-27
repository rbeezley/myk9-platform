import type { IDBPDatabase } from 'idb';
import type { Logger } from '../dependencies';
import type { ReplicatedReadResult, ReplicatedRow } from '../types';
import { GET_ALL_TIMEOUT_MS } from '../constants';
import { databaseManager, REPLICATION_STORES, SHOW_ID_INDEX } from './DatabaseManager';

/**
 * Query operations for a replicated table.
 */
export class ReplicatedTableQueryManager<T extends { id: string }> {
  constructor(
    private tableName: string,
    private logger: Logger,
    private getDb: () => Promise<IDBPDatabase>
  ) {}

  /**
   * Get all rows for this table
   */
  async getAll(licenseKey?: string): Promise<T[]> {
    return (await this.getAllWithStatus(licenseKey)).rows;
  }

  /**
   * Get all rows while preserving the difference between an empty table and
   * a failed local read. Prefer this for callers that make factual claims from
   * an empty result; getAll() remains the compatibility adapter.
   */
  async getAllWithStatus(licenseKey?: string): Promise<ReplicatedReadResult<T>> {
    return this.readWithStatus('getAll()', async db => {
      const index = db
        .transaction(REPLICATION_STORES.REPLICATED_TABLES, 'readonly')
        .store.index('tableName');
      const rows = (await index.getAll(this.tableName)) as ReplicatedRow<T>[];
      if (licenseKey) {
        return rows
          .filter(row => (row.data as Record<string, unknown>).license_key === licenseKey)
          .map(row => row.data);
      }
      return rows.map(row => row.data);
    });
  }

  /**
   * One show's rows, read through the show index (MYK9-788), with the same
   * explicit read status as getAllWithStatus. The read is bounded by the
   * show's own rows, so a device holding many shows does not scan them all.
   */
  async getByShowWithStatus(showId: string): Promise<ReplicatedReadResult<T>> {
    return this.readWithStatus('getByShow()', async db => {
      const index = db
        .transaction(REPLICATION_STORES.REPLICATED_TABLES, 'readonly')
        .store.index(SHOW_ID_INDEX);
      const rows = (await index.getAll(
        IDBKeyRange.only([this.tableName, showId])
      )) as ReplicatedRow<T>[];
      return rows.map(row => row.data);
    });
  }

  private async readWithStatus(
    label: string,
    read: (db: IDBPDatabase) => Promise<T[]>
  ): Promise<ReplicatedReadResult<T>> {
    const readPromise = (async () => read(await this.getDb()))();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeout = setTimeout(() => {
        reject(new Error(`[${this.tableName}] ${label} timed out after ${GET_ALL_TIMEOUT_MS}ms`));
      }, GET_ALL_TIMEOUT_MS);
    });

    try {
      const result = await Promise.race([readPromise, timeoutPromise]);
      databaseManager.resetFailures();
      return { ok: true, rows: result, error: null };
    } catch (error) {
      this.logger.error(`[${this.tableName}] ${label} failed:`, error);
      databaseManager.recordFailure();
      return { ok: false, rows: [], error };
    } finally {
      if (timeout !== undefined) clearTimeout(timeout);
    }
  }

  async getAllLocalIds(): Promise<Set<string>> {
    const db = await this.getDb();
    const tx = db.transaction(REPLICATION_STORES.REPLICATED_TABLES, 'readonly');
    const index = tx.store.index('tableName');
    const rows = (await index.getAll(this.tableName)) as ReplicatedRow<T>[];

    return new Set(rows.map(row => row.id));
  }
}
