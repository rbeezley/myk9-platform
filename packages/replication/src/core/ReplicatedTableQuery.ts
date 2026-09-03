import type { IDBPDatabase } from 'idb';
import type { Logger } from '../dependencies';
import type { ReplicatedReadResult, ReplicatedRow } from '../types';
import { GET_ALL_TIMEOUT_MS, QUERY_TIMEOUT_MS, SLOW_QUERY_THRESHOLD_MS } from '../constants';
import { databaseManager, REPLICATION_STORES } from './DatabaseManager';

/**
 * Query operations for a replicated table.
 */
export class ReplicatedTableQueryManager<T extends { id: string }> {
  constructor(
    private tableName: string,
    private logger: Logger,
    private getDb: () => Promise<IDBPDatabase>,
    private getAllData: (licenseKey?: string) => Promise<T[]>
  ) {}

  /**
   * Query rows by index (uses IndexedDB indexes for O(log n) performance)
   */
  async queryByField(
    fieldName: 'class_id' | 'trial_id' | 'show_id' | 'armband_number',
    value: string
  ): Promise<T[]> {
    const startTime = performance.now();
    const db = await this.getDb();
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

        return rows.map(row => row.data);
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
      const allRows = await this.getAllData();
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

    const allRows = await this.getAllData();
    return allRows.filter(row => row[indexName] === value);
  }

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
