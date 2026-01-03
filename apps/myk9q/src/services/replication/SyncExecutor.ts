/**
 * SyncExecutor - Sync Operation Execution
 *
 * Extracted from SyncEngine.ts (DEBT-005) to improve maintainability.
 *
 * Responsibilities:
 * - Full sync: Download all data for a table
 * - Incremental sync: Delta updates since last sync
 * - Streaming fetch for large datasets
 * - Quota management before sync
 * - Progress reporting
 */

import { supabase } from '@/lib/supabase';
import type { ReplicatedTable } from './ReplicatedTable';
import type { SyncMetadata, SyncResult, SyncProgress } from './types';
import { logger } from '@/utils/logger';
import { withTimeout, TIMEOUT_PRESETS } from '@/utils/networkUtils';

/**
 * Chrome-specific memory info interface
 * @see https://developer.chrome.com/docs/web-platform/memory-measurement/
 */
interface PerformanceMemory {
  usedJSHeapSize: number;
  totalJSHeapSize: number;
  jsHeapSizeLimit: number;
}

interface PerformanceWithMemory extends Performance {
  memory?: PerformanceMemory;
}

/**
 * Options for sync operations
 */
export interface SyncExecutorOptions {
  /** Force full sync even if incremental is available */
  forceFullSync?: boolean;
  /** License key for multi-tenant filtering */
  licenseKey: string;
  /** Batch size for bulk operations */
  batchSize?: number;
  /** Progress callback for UI updates */
  onProgress?: (progress: SyncProgress) => void;
}

/**
 * Callback type for getting sync metadata
 */
export type GetSyncMetadataCallback = (tableName: string) => Promise<SyncMetadata | null>;

/**
 * Callback type for updating sync metadata
 */
export type UpdateSyncMetadataCallback = (
  tableName: string,
  updates: Partial<SyncMetadata>
) => Promise<void>;

/**
 * SyncExecutor - handles all sync operation concerns
 */
export class SyncExecutor {
  private getSyncMetadata: GetSyncMetadataCallback;
  private updateSyncMetadata: UpdateSyncMetadataCallback;

  constructor(
    getSyncMetadata: GetSyncMetadataCallback,
    updateSyncMetadata: UpdateSyncMetadataCallback
  ) {
    this.getSyncMetadata = getSyncMetadata;
    this.updateSyncMetadata = updateSyncMetadata;
  }

  // ========================================
  // FULL SYNC
  // ========================================

  /**
   * Full sync: Download all data for a table
   */
  async fullSync(
    table: ReplicatedTable<{ id: string }>,
    options: SyncExecutorOptions
  ): Promise<SyncResult> {
    const startTime = Date.now();
    const tableName = table.getTableName();

    try {
      logger.log(`🔄 [SyncExecutor] Starting full sync for ${tableName}...`);

      // Day 25-26 MEDIUM Fix: Use streaming fetch with pagination for large datasets
      const STREAM_THRESHOLD = 1000; // Switch to streaming if >1000 rows expected
      const STREAM_PAGE_SIZE = 500;  // Fetch 500 rows per page

      // First, check row count (HEAD-only query) with timeout
      const { count: totalCount, error: countError } = await withTimeout(
        supabase
          .from(tableName)
          .select('*', { count: 'exact', head: true })
          .eq('license_key', options.licenseKey),
        TIMEOUT_PRESETS.quick,
        `${tableName} row count`
      );

      if (countError) {
        throw new Error(`Row count query failed: ${countError.message}`);
      }

      if (!totalCount || totalCount === 0) {
        logger.log(`ℹ️ [SyncExecutor] No data found for ${tableName}`);
        await this.updateSyncMetadata(tableName, {
          lastFullSyncAt: Date.now(),
          lastIncrementalSyncAt: Date.now(),
          totalRows: 0,
        });

        return {
          success: true,
          tableName,
          operation: 'full-sync',
          rowsAffected: 0,
          duration: Date.now() - startTime,
        };
      }

      let totalRowsProcessed = 0; // Track total rows for final metadata update

      // Day 25-26 MEDIUM Fix: Use streaming fetch for large datasets to prevent memory spike
      if (totalCount > STREAM_THRESHOLD) {
        totalRowsProcessed = await this.streamingFullSync(
          table,
          tableName,
          totalCount,
          STREAM_PAGE_SIZE,
          options
        );
      } else {
        // Small dataset: fetch all at once (existing behavior)
        totalRowsProcessed = await this.standardFullSync(table, tableName, options);
      }

      // Update sync metadata
      await this.updateSyncMetadata(tableName, {
        lastFullSyncAt: Date.now(),
        lastIncrementalSyncAt: Date.now(),
        totalRows: totalRowsProcessed,
      });

      const duration = Date.now() - startTime;
      logger.log(
        `✅ [SyncExecutor] Full sync complete for ${tableName}: ${totalRowsProcessed} rows in ${duration}ms`
      );

      return {
        success: true,
        tableName,
        operation: 'full-sync',
        rowsAffected: totalRowsProcessed,
        duration,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const message = error instanceof Error ? error.message : String(error);

      logger.error(`❌ [SyncExecutor] Full sync failed for ${tableName}:`, error);

      return {
        success: false,
        tableName,
        operation: 'full-sync',
        rowsAffected: 0,
        duration,
        error: message,
      };
    }
  }

  /**
   * Streaming full sync for large datasets
   */
  private async streamingFullSync(
    table: ReplicatedTable<any>,
    tableName: string,
    totalCount: number,
    pageSize: number,
    options: SyncExecutorOptions
  ): Promise<number> {
    logger.log(
      `📊 [SyncExecutor] Large dataset detected (${totalCount} rows). Using streaming fetch with ${pageSize}-row pages...`
    );

    let processedRows = 0;
    let currentPage = 0;

    // Collect server IDs for stale entry detection
    const serverIds = new Set<string>();

    while (processedRows < totalCount) {
      // Fetch one page with timeout
      const { data: pageData, error: pageError } = await withTimeout(
        supabase
          .from(tableName)
          .select('*')
          .eq('license_key', options.licenseKey)
          .range(currentPage * pageSize, (currentPage + 1) * pageSize - 1)
          .order('id', { ascending: true }),
        TIMEOUT_PRESETS.standard,
        `${tableName} page ${currentPage}`
      );

      if (pageError) {
        throw new Error(`Page ${currentPage} fetch failed: ${pageError.message}`);
      }

      if (!pageData || pageData.length === 0) {
        break; // No more data
      }

      // Collect IDs for stale entry detection
      for (const row of pageData) {
        serverIds.add(row.id);
      }

      // Process page in chunks
      const batchSize = options.batchSize || 100;
      for (let i = 0; i < pageData.length; i += batchSize) {
        const batch = pageData.slice(i, i + batchSize);
        await table.batchSet(batch);
        processedRows += batch.length;

        // Report progress
        if (options.onProgress) {
          options.onProgress({
            tableName,
            operation: 'full-sync',
            processed: processedRows,
            total: totalCount,
            percentage: (processedRows / totalCount) * 100,
          });
        }
      }

      logger.log(`[SyncExecutor] Streamed page ${currentPage + 1}: ${processedRows}/${totalCount} rows processed`);
      currentPage++;

      // Day 25-26 MEDIUM Fix: Memory monitoring - pause if heap size high
      const perfWithMemory = performance as PerformanceWithMemory;
      if (perfWithMemory.memory) {
        const heapMB = perfWithMemory.memory.usedJSHeapSize / 1024 / 1024;
        if (heapMB > 100) {
          logger.warn(`⚠️ [SyncExecutor] High memory usage (${heapMB.toFixed(2)} MB), pausing for GC...`);
          await new Promise(resolve => setTimeout(resolve, 100)); // Allow GC
        }
      }
    }

    // Stale entry detection: Remove local entries that no longer exist on server
    const staleCount = await table.removeStaleEntries(serverIds);
    if (staleCount > 0) {
      logger.log(`🗑️ [SyncExecutor] Removed ${staleCount} stale entries from ${tableName}`);
    }

    logger.log(`✅ [SyncExecutor] Streaming fetch complete: ${processedRows} rows synced`);
    return processedRows;
  }

  /**
   * Standard full sync for small datasets
   */
  private async standardFullSync(
    table: ReplicatedTable<any>,
    tableName: string,
    options: SyncExecutorOptions
  ): Promise<number> {
    // Fetch all data with timeout
    const { data, error } = await withTimeout(
      supabase
        .from(tableName)
        .select('*')
        .eq('license_key', options.licenseKey),
      TIMEOUT_PRESETS.standard,
      `${tableName} full fetch`
    );

    if (error) {
      throw new Error(`Supabase query failed: ${error.message}`);
    }

    if (!data || data.length === 0) {
      logger.log(`ℹ️ [SyncExecutor] No data found for ${tableName}`);
      await this.updateSyncMetadata(tableName, {
        lastFullSyncAt: Date.now(),
        lastIncrementalSyncAt: Date.now(),
        totalRows: 0,
      });
      return 0;
    }

    // Day 25-26 MEDIUM Fix: Pre-sync quota check
    const estimatedSizeMB = (JSON.stringify(data).length / 1024 / 1024);
    const quotaCheckResult = await this.checkQuotaBeforeSync(estimatedSizeMB);

    if (!quotaCheckResult.hasSpace) {
      logger.error(
        `❌ [SyncExecutor] Insufficient quota for ${tableName} sync. ` +
        `Need ${estimatedSizeMB.toFixed(2)} MB, available ~${quotaCheckResult.availableMB.toFixed(2)} MB`
      );

      // Try to free up space
      if (quotaCheckResult.needsEviction) {
        logger.warn('[SyncExecutor] Attempting proactive eviction before sync...');
        const evictedRows = await table.evictLRU(estimatedSizeMB);
        logger.log(`[SyncExecutor] Evicted ${evictedRows} rows to free space`);

        // Re-check quota
        const recheckResult = await this.checkQuotaBeforeSync(estimatedSizeMB);
        if (!recheckResult.hasSpace) {
          throw new Error(
            `Insufficient storage quota. Need ${estimatedSizeMB.toFixed(2)} MB but only ${recheckResult.availableMB.toFixed(2)} MB available after eviction. ` +
            `Please free up space or reduce data scope.`
          );
        }
      }
    }

    // Batch set all rows
    // Day 23-24: Use chunked batch set for large datasets (500+ rows)
    const batchSize = options.batchSize || 100;

    // Collect server IDs for stale entry detection
    const serverIds = new Set<string>(data.map((row: { id: string }) => row.id));

    if (data.length >= 500) {
      // Large dataset: use optimized chunking (single transaction per chunk)
      logger.log(`📦 [SyncExecutor] Using chunked batch set for ${data.length} rows`);
      await table.batchSetChunked(data, batchSize);

      // Report final progress
      if (options.onProgress) {
        options.onProgress({
          tableName,
          operation: 'full-sync',
          processed: data.length,
          total: data.length,
          percentage: 100,
        });
      }
    } else {
      // Small dataset: use existing chunking logic with progress updates
      let processed = 0;
      for (let i = 0; i < data.length; i += batchSize) {
        const batch = data.slice(i, i + batchSize);
        await table.batchSet(batch);

        processed += batch.length;

        // Report progress
        if (options.onProgress) {
          options.onProgress({
            tableName,
            operation: 'full-sync',
            processed,
            total: data.length,
            percentage: (processed / data.length) * 100,
          });
        }
      }
    }

    // Stale entry detection: Remove local entries that no longer exist on server
    // This handles the case where rows are deleted from the database
    const staleCount = await table.removeStaleEntries(serverIds);
    if (staleCount > 0) {
      logger.log(`🗑️ [SyncExecutor] Removed ${staleCount} stale entries from ${tableName}`);
    }

    return data.length;
  }

  // ========================================
  // INCREMENTAL SYNC
  // ========================================

  /**
   * Incremental sync: Download only changed data since last sync
   */
  async incrementalSync(
    table: ReplicatedTable<{ id: string }>,
    options: SyncExecutorOptions
  ): Promise<SyncResult> {
    const startTime = Date.now();
    const tableName = table.getTableName();

    try {
      // Get last sync timestamp
      const metadata = await this.getSyncMetadata(tableName);
      const lastSync = metadata?.lastIncrementalSyncAt || 0;

      // If never synced, do full sync instead
      if (lastSync === 0 || options.forceFullSync) {
        logger.log(
          `ℹ️ [SyncExecutor] No previous sync for ${tableName}, doing full sync`
        );
        return this.fullSync(table, options);
      }

      logger.log(
        `🔄 [SyncExecutor] Starting incremental sync for ${tableName} (since ${new Date(lastSync).toISOString()})...`
      );

      // Day 25-26: Check row count before fetching to prevent unbounded sync
      const MAX_INCREMENTAL_ROWS = 5000;

      const { count: rowCount, error: countError } = await withTimeout(
        supabase
          .from(tableName)
          .select('*', { count: 'exact', head: true })
          .eq('license_key', options.licenseKey)
          .gt('updated_at', new Date(lastSync).toISOString()),
        TIMEOUT_PRESETS.quick,
        `${tableName} incremental count`
      );

      if (countError) {
        throw new Error(`Row count query failed: ${countError.message}`);
      }

      // If too many rows changed, do full sync instead (more efficient)
      if (rowCount && rowCount > MAX_INCREMENTAL_ROWS) {
        logger.warn(
          `⚠️ [SyncExecutor] Too many changes since last sync (${rowCount} rows > ${MAX_INCREMENTAL_ROWS} limit). Switching to full sync...`
        );
        return this.fullSync(table, options);
      }

      // Fetch rows updated since last sync with timeout
      const { data, error } = await withTimeout(
        supabase
          .from(tableName)
          .select('*')
          .eq('license_key', options.licenseKey)
          .gt('updated_at', new Date(lastSync).toISOString())
          .order('updated_at', { ascending: true }),
        TIMEOUT_PRESETS.standard,
        `${tableName} incremental fetch`
      );

      if (error) {
        throw new Error(`Supabase query failed: ${error.message}`);
      }

      if (!data || data.length === 0) {
        logger.log(`ℹ️ [SyncExecutor] No updates for ${tableName}`);
        await this.updateSyncMetadata(tableName, {
          lastIncrementalSyncAt: Date.now(),
        });

        return {
          success: true,
          tableName,
          operation: 'incremental-sync',
          rowsAffected: 0,
          duration: Date.now() - startTime,
        };
      }

      // Batch set changed rows (with conflict resolution)
      const batchSize = options.batchSize || 100;
      let processed = 0;

      for (let i = 0; i < data.length; i += batchSize) {
        const batch = data.slice(i, i + batchSize);

        // Use set() instead of batchSet() to trigger conflict resolution
        for (const row of batch) {
          await table.set(row.id, row);
        }

        processed += batch.length;

        if (options.onProgress) {
          options.onProgress({
            tableName,
            operation: 'incremental-sync',
            processed,
            total: data.length,
            percentage: (processed / data.length) * 100,
          });
        }
      }

      // Update sync metadata
      await this.updateSyncMetadata(tableName, {
        lastIncrementalSyncAt: Date.now(),
        totalRows: (metadata?.totalRows || 0) + data.length,
      });

      const duration = Date.now() - startTime;
      logger.log(
        `✅ [SyncExecutor] Incremental sync complete for ${tableName}: ${data.length} rows in ${duration}ms`
      );

      return {
        success: true,
        tableName,
        operation: 'incremental-sync',
        rowsAffected: data.length,
        duration,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const message = error instanceof Error ? error.message : String(error);

      logger.error(
        `❌ [SyncExecutor] Incremental sync failed for ${tableName}:`,
        error
      );

      return {
        success: false,
        tableName,
        operation: 'incremental-sync',
        rowsAffected: 0,
        duration,
        error: message,
      };
    }
  }

  // ========================================
  // QUOTA MANAGEMENT
  // ========================================

  /**
   * Check quota before sync to prevent QuotaExceededError
   * Day 25-26 MEDIUM Fix: Proactive quota management
   *
   * @param estimatedSizeMB - Estimated size of data to sync
   * @returns Result indicating if space is available
   */
  private async checkQuotaBeforeSync(estimatedSizeMB: number): Promise<{
    hasSpace: boolean;
    availableMB: number;
    needsEviction: boolean;
  }> {
    try {
      // Check IndexedDB quota (if available)
      if (navigator.storage && navigator.storage.estimate) {
        const estimate = await navigator.storage.estimate();
        const usedMB = (estimate.usage || 0) / 1024 / 1024;
        const quotaMB = (estimate.quota || 0) / 1024 / 1024;
        const availableMB = quotaMB - usedMB;

        // Reserve 10% of quota for safety margin
        const safeAvailableMB = availableMB * 0.9;

        logger.log(
          `[SyncExecutor] Quota check: ${usedMB.toFixed(2)}/${quotaMB.toFixed(2)} MB used, ` +
          `${safeAvailableMB.toFixed(2)} MB available (need ${estimatedSizeMB.toFixed(2)} MB)`
        );

        if (estimatedSizeMB > safeAvailableMB) {
          // Need eviction or will exceed quota
          return {
            hasSpace: false,
            availableMB: safeAvailableMB,
            needsEviction: true,
          };
        }

        return {
          hasSpace: true,
          availableMB: safeAvailableMB,
          needsEviction: false,
        };
      }

      // Fallback: navigator.storage not available (assume space available)
      logger.warn('[SyncExecutor] Quota API not available, assuming space available');
      return {
        hasSpace: true,
        availableMB: Infinity,
        needsEviction: false,
      };
    } catch (error) {
      logger.error('[SyncExecutor] Quota check failed:', error);
      // On error, assume space available (fail gracefully)
      return {
        hasSpace: true,
        availableMB: Infinity,
        needsEviction: false,
      };
    }
  }
}
