import type { IDBPDatabase } from 'idb';
import type { Logger } from '../dependencies';
import type { ReplicatedReadResult, ReplicatedRow } from '../types';
import { GET_ALL_TIMEOUT_MS } from '../constants';
import { databaseManager, REPLICATION_STORES } from './DatabaseManager';

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
    const getAllPromise = (async () => {
      const db = await this.getDb();
      const tx = db.transaction(REPLICATION_STORES.REPLICATED_TABLES, 'readonly');
      const index = tx.store.index('tableName');

      const rows = (await index.getAll(this.tableName)) as ReplicatedRow<T>[];

      if (licenseKey) {
        return rows
          .filter(row => (row.data as Record<string, unknown>).license_key === licenseKey)
          .map(row => row.data);
      }

      return rows.map(row => row.data);
    })();

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`[${this.tableName}] getAll() timed out after ${GET_ALL_TIMEOUT_MS}ms`));
      }, GET_ALL_TIMEOUT_MS);
    });

    try {
      const result = await Promise.race([getAllPromise, timeoutPromise]);
      databaseManager.resetFailures();
      return { ok: true, rows: result, error: null };
    } catch (error) {
      this.logger.error(`[${this.tableName}] getAll() failed:`, error);
      databaseManager.recordFailure();
      return { ok: false, rows: [], error };
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
