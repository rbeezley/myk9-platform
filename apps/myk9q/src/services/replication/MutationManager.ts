/**
 * MutationManager - Offline Mutation Queue Management
 *
 * Extracted from SyncEngine.ts (DEBT-005) to improve maintainability.
 *
 * Responsibilities:
 * - Upload pending mutations to server
 * - Topological sorting for dependency ordering
 * - localStorage backup/restore for data safety
 * - Retry logic with exponential backoff
 * - User notification of sync failures
 */

import { supabase } from '@/lib/supabase';
import type { PendingMutation, SyncResult } from './types';
import { logger } from '@/utils/logger';
import { REPLICATION_STORES } from './DatabaseManager';
import type { IDBPDatabase } from 'idb';
import {
  withTimeout,
  backoffDelay,
  isRetryableError,
  TIMEOUT_PRESETS,
} from '@/utils/networkUtils';

/**
 * Configuration for MutationManager
 */
export interface MutationManagerConfig {
  /** Maximum retry attempts for failed mutations */
  maxRetries?: number;
  /** Exponential backoff base (ms) */
  retryBackoffBase?: number;
}

/**
 * Callback type for getting the database instance
 */
export type GetDatabaseCallback = () => Promise<IDBPDatabase>;

/**
 * MutationManager - handles all mutation queue concerns
 */
export class MutationManager {
  private getDb: GetDatabaseCallback;
  private maxRetries: number;
  private retryBackoffBase: number;

  // Issue #12 Fix: Debounce localStorage backup to prevent race conditions
  private backupDebounceTimer: NodeJS.Timeout | null = null;
  private isBackupInProgress: boolean = false;

  constructor(config: MutationManagerConfig, getDb: GetDatabaseCallback) {
    this.getDb = getDb;
    this.maxRetries = config.maxRetries || 3;
    this.retryBackoffBase = config.retryBackoffBase || 1000;
  }

  // ========================================
  // MUTATION UPLOAD
  // ========================================

  /**
   * Upload pending mutations (offline changes) to server
   *
   * Day 25-26: Added topological sorting to respect causal dependencies
   * Day 25-26 MEDIUM Fix: Check mutation queue size to prevent overflow
   */
  async uploadPendingMutations(): Promise<SyncResult[]> {
    const startTime = Date.now();

    try {
      const db = await this.getDb();
      const pending = await db.getAll(REPLICATION_STORES.PENDING_MUTATIONS);

      if (pending.length === 0) {
        logger.log('ℹ️ [MutationManager] No pending mutations to upload');
        return [];
      }

      // Warn if mutation queue is getting large
      const QUEUE_WARNING_THRESHOLD = 500;
      const QUEUE_MAX_SIZE = 1000;

      if (pending.length >= QUEUE_MAX_SIZE) {
        logger.error(
          `❌ [MutationManager] Mutation queue at maximum capacity (${pending.length}/${QUEUE_MAX_SIZE}). ` +
          `Please sync immediately to prevent data loss!`
        );

        // Dispatch critical warning event
        window.dispatchEvent(new CustomEvent('replication:queue-overflow', {
          detail: { queueSize: pending.length, maxSize: QUEUE_MAX_SIZE }
        }));
      } else if (pending.length >= QUEUE_WARNING_THRESHOLD) {
        logger.warn(
          `⚠️ [MutationManager] Mutation queue is getting large (${pending.length}/${QUEUE_MAX_SIZE}). Consider syncing soon.`
        );
      }

      logger.log(
        `🔄 [MutationManager] Uploading ${pending.length} pending mutations...`
      );

      // Sort mutations to respect dependencies
      const sortedMutations = this.topologicalSortMutations(pending as PendingMutation[]);

      if (sortedMutations.length < pending.length) {
        logger.warn(
          `⚠️ [MutationManager] Circular dependency detected! ${pending.length - sortedMutations.length} mutations skipped`
        );
      }

      const results: SyncResult[] = [];
      const failedMutations: PendingMutation[] = [];

      for (const mutation of sortedMutations) {
        try {
          // Execute mutation on server
          await this.executeMutation(mutation);

          // Delete from pending queue
          await db.delete(REPLICATION_STORES.PENDING_MUTATIONS, mutation.id);

          // Backup after each successful mutation
          await this.backupMutationsToLocalStorage();

          results.push({
            success: true,
            tableName: mutation.tableName,
            operation: mutation.operation,
            rowsAffected: 1,
            duration: 0,
          });

          logger.log(
            `✅ [MutationManager] Mutation ${mutation.id} uploaded successfully`
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const canRetry = isRetryableError(error);

          // Increment retry count
          mutation.retries = (mutation.retries || 0) + 1;

          // Mark as failed if max retries exceeded OR error is not retryable
          if (mutation.retries >= this.maxRetries || !canRetry) {
            mutation.status = 'failed';
            mutation.error = canRetry
              ? `Max retries exceeded: ${message}`
              : `Non-retryable error: ${message}`;
            failedMutations.push(mutation);

            logger.error(
              `❌ [MutationManager] Mutation ${mutation.id} failed permanently${canRetry ? ' (max retries)' : ' (non-retryable)'}:`,
              error
            );
          } else {
            mutation.status = 'pending';
            mutation.error = message;

            logger.warn(
              `⚠️ [MutationManager] Mutation ${mutation.id} failed (retry ${mutation.retries}/${this.maxRetries}):`,
              error
            );

            // Apply exponential backoff delay before next attempt
            await backoffDelay(mutation.retries - 1, this.retryBackoffBase);
          }

          // Update mutation in queue
          await db.put(REPLICATION_STORES.PENDING_MUTATIONS, mutation);

          results.push({
            success: false,
            tableName: mutation.tableName,
            operation: mutation.operation,
            rowsAffected: 0,
            duration: 0,
            error: message,
          });
        }
      }

      // Notify user if any mutations permanently failed
      if (failedMutations.length > 0) {
        this.notifyUserOfSyncFailure(failedMutations);
      }

      const duration = Date.now() - startTime;
      logger.log(
        `✅ [MutationManager] Uploaded ${results.filter((r) => r.success).length}/${pending.length} mutations in ${duration}ms`
      );

      return results;
    } catch (error) {
      logger.error('❌ [MutationManager] Failed to upload mutations:', error);
      return [];
    }
  }

  /**
   * Execute a single mutation on the server with timeout protection
   */
  private async executeMutation(mutation: PendingMutation): Promise<void> {
    const { tableName, operation, data } = mutation;

    switch (operation) {
      case 'INSERT':
      case 'UPDATE': {
        const { error } = await withTimeout(
          supabase.from(tableName).upsert(data),
          TIMEOUT_PRESETS.standard,
          `${tableName} upsert`
        );
        if (error) throw error;
        break;
      }

      case 'DELETE': {
        const { error } = await withTimeout(
          supabase
            .from(tableName)
            .delete()
            .eq('id', data.id),
          TIMEOUT_PRESETS.standard,
          `${tableName} delete`
        );
        if (error) throw error;
        break;
      }

      default:
        throw new Error(`Unknown operation: ${operation}`);
    }
  }

  // ========================================
  // TOPOLOGICAL SORTING
  // ========================================

  /**
   * Topological sort mutations to respect dependencies
   * Prevents out-of-order execution
   *
   * @returns Sorted mutations (cycles are broken by skipping dependent nodes)
   */
  private topologicalSortMutations(mutations: PendingMutation[]): PendingMutation[] {
    // Build adjacency list (mutation ID -> dependents)
    const graph = new Map<string, string[]>();
    const inDegree = new Map<string, number>();
    const mutationMap = new Map<string, PendingMutation>();

    // Initialize
    for (const mutation of mutations) {
      mutationMap.set(mutation.id, mutation);
      graph.set(mutation.id, []);
      inDegree.set(mutation.id, 0);
    }

    // Build dependency graph
    for (const mutation of mutations) {
      if (mutation.dependsOn && mutation.dependsOn.length > 0) {
        for (const depId of mutation.dependsOn) {
          // Only add edge if dependency exists in current batch
          if (mutationMap.has(depId)) {
            graph.get(depId)!.push(mutation.id);
            inDegree.set(mutation.id, (inDegree.get(mutation.id) || 0) + 1);
          }
        }
      }
    }

    // Kahn's algorithm for topological sort
    const queue: string[] = [];
    const sorted: PendingMutation[] = [];

    // Find all nodes with no dependencies
    for (const [id, degree] of inDegree) {
      if (degree === 0) {
        queue.push(id);
      }
    }

    // Process queue
    while (queue.length > 0) {
      const id = queue.shift()!;
      const mutation = mutationMap.get(id)!;
      sorted.push(mutation);

      // Reduce in-degree of dependents
      const dependents = graph.get(id) || [];
      for (const depId of dependents) {
        const newDegree = (inDegree.get(depId) || 0) - 1;
        inDegree.set(depId, newDegree);

        if (newDegree === 0) {
          queue.push(depId);
        }
      }
    }

    // Fallback: If circular dependency detected, add remaining mutations by sequence/timestamp
    if (sorted.length < mutations.length) {
      const remaining = mutations.filter(m => !sorted.includes(m));

      // Sort remaining by sequenceNumber (if exists) or timestamp
      remaining.sort((a, b) => {
        if (a.sequenceNumber !== undefined && b.sequenceNumber !== undefined) {
          return a.sequenceNumber - b.sequenceNumber;
        }
        return a.timestamp - b.timestamp;
      });

      logger.warn(
        `[MutationManager] Circular dependency detected, adding ${remaining.length} mutations in timestamp order`
      );

      sorted.push(...remaining);
    }

    return sorted;
  }

  // ========================================
  // BACKUP / RESTORE
  // ========================================

  /**
   * Backup pending mutations to localStorage
   * Prevents data loss if IndexedDB cleared
   * Issue #12 Fix: Debounce backup writes to prevent race conditions
   */
  async backupMutationsToLocalStorage(): Promise<void> {
    // Clear existing timer
    if (this.backupDebounceTimer) {
      clearTimeout(this.backupDebounceTimer);
    }

    // Debounce for 1 second
    return new Promise((resolve) => {
      this.backupDebounceTimer = setTimeout(async () => {
        // Issue #12 Fix: Skip if backup already in progress
        if (this.isBackupInProgress) {
          logger.log('[MutationManager] Backup already in progress, skipping duplicate call');
          resolve();
          return;
        }

        this.isBackupInProgress = true;
        try {
          const db = await this.getDb();
          const pending = await db.getAll(REPLICATION_STORES.PENDING_MUTATIONS);

          if (pending.length > 0) {
            localStorage.setItem('replication_mutation_backup', JSON.stringify(pending));
            logger.log(`[MutationManager] Backed up ${pending.length} mutations to localStorage`);
          } else {
            localStorage.removeItem('replication_mutation_backup');
          }
        } catch (error) {
          logger.warn('[MutationManager] Failed to backup mutations to localStorage:', error);
        } finally {
          this.isBackupInProgress = false;
          resolve();
        }
      }, 1000); // 1 second debounce
    });
  }

  /**
   * Restore pending mutations from localStorage backup
   * Recovers from IndexedDB clear
   */
  async restoreMutationsFromLocalStorage(): Promise<void> {
    try {
      const backup = localStorage.getItem('replication_mutation_backup');

      if (!backup) {
        return; // No backup to restore
      }

      const mutations = JSON.parse(backup) as PendingMutation[];

      if (mutations.length === 0) {
        return;
      }

      const db = await this.getDb();

      // Check if mutations already exist in IndexedDB
      const existing = await db.getAll(REPLICATION_STORES.PENDING_MUTATIONS);
      const existingIds = new Set(existing.map((m: PendingMutation) => m.id));

      let restoredCount = 0;

      for (const mutation of mutations) {
        // Only restore if not already in IndexedDB
        if (!existingIds.has(mutation.id)) {
          await db.put(REPLICATION_STORES.PENDING_MUTATIONS, mutation);
          restoredCount++;
        }
      }

      if (restoredCount > 0) {
        logger.log(`[MutationManager] ✅ Restored ${restoredCount} mutations from localStorage backup`);
      }
    } catch (error) {
      logger.error('[MutationManager] Failed to restore mutations from localStorage:', error);
    }
  }

  // ========================================
  // USER NOTIFICATION
  // ========================================

  /**
   * Notify user of sync failures via custom event
   */
  private notifyUserOfSyncFailure(failedMutations: PendingMutation[]): void {
    const event = new CustomEvent('replication:sync-failed', {
      detail: {
        count: failedMutations.length,
        mutations: failedMutations,
        message: `${failedMutations.length} change(s) failed to sync. Please check your connection and try again.`,
      },
    });

    window.dispatchEvent(event);

    logger.error(
      `[MutationManager] ${failedMutations.length} mutations failed permanently`,
      failedMutations
    );
  }

  // ========================================
  // CLEANUP
  // ========================================

  /**
   * Clear all pending mutations (call on logout/show switch)
   * Prevents stale mutations from previous shows being uploaded
   */
  async clearAllMutations(): Promise<void> {
    try {
      const db = await this.getDb();

      // Clear all pending mutations from IndexedDB
      const tx = db.transaction(REPLICATION_STORES.PENDING_MUTATIONS, 'readwrite');
      await tx.store.clear();
      await tx.done;

      // Also clear the localStorage backup
      localStorage.removeItem('replication_mutation_backup');

      logger.log('[MutationManager] ✅ Cleared all pending mutations and localStorage backup');
    } catch (error) {
      logger.error('[MutationManager] Failed to clear mutations:', error);
    }
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    if (this.backupDebounceTimer) {
      clearTimeout(this.backupDebounceTimer);
      this.backupDebounceTimer = null;
    }

    logger.log('🗑️ [MutationManager] Destroyed');
  }
}
