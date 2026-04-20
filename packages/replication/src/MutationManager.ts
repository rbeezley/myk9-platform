/**
 * MutationManager - Shared Offline Mutation Queue Management
 *
 * Ported from apps/myk9q/src/services/replication/MutationManager.ts
 * with dependency injection for SupabaseClient, Logger, and DatabaseManager.
 *
 * Responsibilities:
 * - Queue pending mutations for offline-first operation
 * - Upload pending mutations to server with retry logic
 * - Topological sorting for dependency ordering (Kahn's algorithm)
 * - localStorage backup/restore for data safety
 * - Exponential backoff for transient failures
 * - User notification of sync failures via CustomEvent
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Logger } from './dependencies';
import { noopLogger } from './dependencies';
import { databaseManager, REPLICATION_STORES } from './core/DatabaseManager';
import { withTimeout, calculateBackoffDelay, isRetryableError, TIMEOUT_PRESETS } from './mutation-utils';
import type { PendingMutation, SyncResult } from './types';

// ============================================
// CONSTANTS
// ============================================

/** Warn when mutation queue exceeds this size */
const QUEUE_WARNING_THRESHOLD = 500;

/** Maximum mutation queue capacity */
const QUEUE_MAX_SIZE = 1000;

/** Debounce interval for localStorage backup (ms) */
const BACKUP_DEBOUNCE_MS = 1000;

/** localStorage key for mutation backup */
const BACKUP_STORAGE_KEY = 'replication_mutation_backup';

// ============================================
// TYPES
// ============================================

/**
 * Configuration options for MutationManager
 */
export interface MutationManagerOptions {
  /** Maximum retry attempts for failed mutations (default: 3) */
  maxRetries?: number;
  /** Exponential backoff base delay in ms (default: 1000) */
  retryBackoffBase?: number;
  /** Logger instance for diagnostics */
  logger?: Logger;
}

// ============================================
// MUTATION MANAGER
// ============================================

/**
 * MutationManager - handles all mutation queue concerns
 *
 * Uses dependency injection for SupabaseClient and Logger to support
 * both myK9Q and myK9Show without global imports.
 */
export class MutationManager {
  private supabase: SupabaseClient;
  private maxRetries: number;
  private retryBackoffBase: number;
  private logger: Logger;

  // Debounce localStorage backup to prevent race conditions
  private backupDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private isBackupInProgress: boolean = false;

  // Auto-upload: flush mutations to server shortly after queuing
  private uploadDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private isUploading: boolean = false;

  constructor(supabaseClient: SupabaseClient, options: MutationManagerOptions = {}) {
    this.supabase = supabaseClient;
    this.maxRetries = options.maxRetries ?? 3;
    this.retryBackoffBase = options.retryBackoffBase ?? 1000;
    this.logger = options.logger ?? noopLogger;
  }

  // ========================================
  // MUTATION QUEUEING
  // ========================================

  /**
   * Queue a mutation for later upload
   *
   * Includes overflow protection: throws if queue exceeds QUEUE_MAX_SIZE,
   * warns at QUEUE_WARNING_THRESHOLD.
   *
   * @param tableName - Target Supabase table
   * @param operation - INSERT, UPDATE, or DELETE
   * @param rowId - Primary key of the affected row
   * @param data - Mutation payload
   * @param dependsOn - Optional array of mutation IDs this depends on
   * @returns The generated mutation ID
   */
  async queueMutation(
    tableName: string,
    operation: PendingMutation['operation'],
    rowId: string,
    data: Record<string, unknown>,
    dependsOn?: string[]
  ): Promise<string> {
    // Queue overflow protection
    const pendingCount = await this.getPendingCount();
    if (pendingCount >= QUEUE_MAX_SIZE) {
      this.logger.error(`[MutationManager] Queue overflow: ${pendingCount} pending mutations`);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('replication:queue-overflow', {
            detail: { count: pendingCount },
          })
        );
      }
      throw new Error(`Mutation queue overflow: ${pendingCount} pending`);
    }
    if (pendingCount >= QUEUE_WARNING_THRESHOLD) {
      this.logger.warn(`[MutationManager] Queue warning: ${pendingCount} pending mutations`);
    }

    const db = await databaseManager.getDatabase('MutationManager');
    const id = crypto.randomUUID();
    const mutation: PendingMutation = {
      id,
      tableName,
      operation,
      rowId,
      data,
      timestamp: Date.now(),
      retries: 0,
      status: 'pending',
      dependsOn,
    };
    await db.put(REPLICATION_STORES.PENDING_MUTATIONS, mutation);
    this.logger.log(`[MutationManager] Queued ${operation} for ${tableName}/${rowId}`);
    await this.backupMutationsToLocalStorage();

    // Auto-upload: schedule immediate flush to server
    this.scheduleUpload();

    return id;
  }

  /**
   * Get the count of pending mutations in the queue
   */
  async getPendingCount(): Promise<number> {
    const db = await databaseManager.getDatabase('MutationManager');
    return db.count(REPLICATION_STORES.PENDING_MUTATIONS);
  }

  // ========================================
  // MUTATION UPLOAD
  // ========================================

  /**
   * Schedule an upload attempt shortly after a mutation is queued.
   *
   * Debounced at 100ms so rapid mutations (e.g. batch inserts) are
   * coalesced into a single upload pass. Skips if offline.
   */
  private scheduleUpload(): void {
    if (this.uploadDebounceTimer) {
      clearTimeout(this.uploadDebounceTimer);
    }

    this.uploadDebounceTimer = setTimeout(() => {
      this.uploadDebounceTimer = null;

      // Skip if offline
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        this.logger.log('[MutationManager] Offline, deferring auto-upload');
        return;
      }

      this.uploadPendingMutations().catch(err => {
        this.logger.error('[MutationManager] Auto-upload failed:', err);
      });
    }, 100);
  }

  /**
   * Upload pending mutations (offline changes) to server
   *
   * Processes mutations in topological order to respect causal dependencies.
   * Warns when mutation queue size approaches capacity.
   */
  async uploadPendingMutations(): Promise<SyncResult[]> {
    // Prevent concurrent upload runs
    if (this.isUploading) {
      this.logger.log('[MutationManager] Upload already in progress, skipping');
      return [];
    }
    this.isUploading = true;
    const startTime = Date.now();

    try {
      const db = await databaseManager.getDatabase('MutationManager');
      const pending = await db.getAll(REPLICATION_STORES.PENDING_MUTATIONS);

      if (pending.length === 0) {
        this.logger.log('[MutationManager] No pending mutations to upload');
        return [];
      }

      // Warn if mutation queue is getting large
      if (pending.length >= QUEUE_MAX_SIZE) {
        this.logger.error(
          `[MutationManager] Mutation queue at maximum capacity (${pending.length}/${QUEUE_MAX_SIZE}). ` +
            `Please sync immediately to prevent data loss!`
        );

        // Dispatch critical warning event
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('replication:queue-overflow', {
              detail: { queueSize: pending.length, maxSize: QUEUE_MAX_SIZE },
            })
          );
        }
      } else if (pending.length >= QUEUE_WARNING_THRESHOLD) {
        this.logger.warn(
          `[MutationManager] Mutation queue is getting large (${pending.length}/${QUEUE_MAX_SIZE}). Consider syncing soon.`
        );
      }

      this.logger.log(`[MutationManager] Uploading ${pending.length} pending mutations...`);

      // Sort mutations to respect dependencies
      const sortedMutations = this.topologicalSortMutations(pending as PendingMutation[]);

      if (sortedMutations.length < pending.length) {
        this.logger.warn(
          `[MutationManager] Circular dependency detected! ${pending.length - sortedMutations.length} mutations skipped`
        );
      }

      const results: SyncResult[] = [];
      const failedMutations: PendingMutation[] = [];
      const now = Date.now();

      for (const mutation of sortedMutations) {
        // Skip mutations that are waiting out their backoff window.
        // This lets independent mutations proceed without being stalled by a
        // failing mutation's retry delay.
        if (mutation.nextRetryAt && mutation.nextRetryAt > now) {
          this.logger.log(
            `[MutationManager] Skipping ${mutation.id} — backoff until ${new Date(mutation.nextRetryAt).toISOString()}`
          );
          continue;
        }

        try {
          // Execute mutation on server
          await this.executeMutation(mutation);

          // Delete from pending queue
          await db.delete(REPLICATION_STORES.PENDING_MUTATIONS, mutation.id);

          results.push({
            success: true,
            tableName: mutation.tableName,
            operation: mutation.operation,
            rowsAffected: 1,
            duration: 0,
          });

          this.logger.log(`[MutationManager] Mutation ${mutation.id} uploaded successfully`);
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

            this.logger.error(
              `[MutationManager] Mutation ${mutation.id} (${mutation.tableName}/${mutation.operation}) failed permanently${canRetry ? ' (max retries)' : ' (non-retryable)'}: ${message}`,
              error
            );
            // Remove permanently failed mutations from the queue
            await db.delete(REPLICATION_STORES.PENDING_MUTATIONS, mutation.id);
          } else {
            mutation.status = 'pending';
            mutation.error = message;
            // Record when this mutation may next be retried so that
            // subsequent upload passes skip it without blocking.
            mutation.nextRetryAt =
              Date.now() + calculateBackoffDelay(mutation.retries - 1, this.retryBackoffBase);

            this.logger.warn(
              `[MutationManager] Mutation ${mutation.id} failed (retry ${mutation.retries}/${this.maxRetries}), next attempt after ${new Date(mutation.nextRetryAt).toISOString()}:`,
              error
            );

            // Update retryable mutation in queue with new nextRetryAt
            await db.put(REPLICATION_STORES.PENDING_MUTATIONS, mutation);
          }

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

      // Fire-and-forget: backup after upload completes without blocking the caller.
      this.backupMutationsToLocalStorage().catch(err => {
        this.logger.warn('[MutationManager] Post-upload backup failed:', err);
      });

      const successful = results.filter(r => r.success);
      const duration = Date.now() - startTime;
      this.logger.log(
        `[MutationManager] Uploaded ${successful.length}/${pending.length} mutations in ${duration}ms`
      );

      // Notify listeners of successful uploads so caches can be invalidated
      if (successful.length > 0 && typeof window !== 'undefined') {
        const affectedTables = [...new Set(successful.map(r => r.tableName))];
        window.dispatchEvent(
          new CustomEvent('replication:upload-complete', {
            detail: { tables: affectedTables, count: successful.length },
          })
        );
      }

      return results;
    } catch (error) {
      this.logger.error('[MutationManager] Failed to upload mutations:', error);
      return [];
    } finally {
      this.isUploading = false;
    }
  }

  /**
   * Execute a single mutation on the server with timeout protection.
   *
   * Uses `select()` after upsert/delete to get the returned rows,
   * which lets us detect RLS silent rejections (0 rows affected = RLS blocked).
   */
  private async executeMutation(mutation: PendingMutation): Promise<void> {
    const { tableName, operation, data } = mutation;

    switch (operation) {
      case 'INSERT': {
        const { data: rows, error } = await withTimeout(
          this.supabase.from(tableName).insert(data).select('id'),
          TIMEOUT_PRESETS.standard,
          `${tableName} insert`
        );
        if (error) throw error;
        if (!rows || rows.length === 0) {
          throw new Error(
            `RLS policy blocked INSERT on ${tableName} for row ${mutation.rowId}. ` +
              `Check that the authenticated user has the required role.`
          );
        }
        break;
      }

      case 'UPDATE': {
        const { data: rows, error } = await withTimeout(
          this.supabase
            .from(tableName)
            .update(data)
            .eq('id', data.id as string)
            .select('id'),
          TIMEOUT_PRESETS.standard,
          `${tableName} update`
        );
        if (error) throw error;
        if (!rows || rows.length === 0) {
          throw new Error(
            `RLS policy blocked UPDATE on ${tableName} for row ${mutation.rowId}. ` +
              `Check that the authenticated user has the required role.`
          );
        }
        break;
      }

      case 'DELETE': {
        const { data: rows, error } = await withTimeout(
          this.supabase
            .from(tableName)
            .delete()
            .eq('id', data.id as string)
            .select('id'),
          TIMEOUT_PRESETS.standard,
          `${tableName} delete`
        );
        if (error) throw error;
        // 0 rows affected means either the row was already deleted (OK,
        // idempotent) or RLS silently rejected the DELETE. We can't
        // distinguish the two, so we log a warning and let the next sync
        // determine whether the row still exists.
        if (!rows || rows.length === 0) {
          this.logger.warn(
            `[MutationManager] DELETE on ${tableName} for row ${mutation.rowId} affected 0 rows. ` +
              `Row may have already been deleted, or RLS policy blocked the operation.`
          );
        }
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
   * Topological sort mutations to respect dependencies (Kahn's algorithm)
   *
   * Prevents out-of-order execution by processing dependencies first.
   * Cycles are broken by appending remaining mutations in timestamp order.
   *
   * @returns Sorted mutations array
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

    // Find all nodes with no dependencies, sorted by timestamp
    // (ensures parent records like shows are uploaded before children like trials/classes)
    const roots: PendingMutation[] = [];
    for (const [id, degree] of inDegree) {
      if (degree === 0) {
        roots.push(mutationMap.get(id)!);
      }
    }
    roots.sort((a, b) => a.timestamp - b.timestamp);
    for (const m of roots) {
      queue.push(m.id);
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
      const sortedIds = new Set(sorted.map(m => m.id));
      const remaining = mutations.filter(m => !sortedIds.has(m.id));

      // Sort remaining by sequenceNumber (if exists) or timestamp
      remaining.sort((a, b) => {
        if (a.sequenceNumber !== undefined && b.sequenceNumber !== undefined) {
          return a.sequenceNumber - b.sequenceNumber;
        }
        return a.timestamp - b.timestamp;
      });

      this.logger.warn(
        `[MutationManager] Circular dependency detected, adding ${remaining.length} mutations in timestamp order`
      );

      sorted.push(...remaining);
    }

    return sorted;
  }

  // ========================================
  // BACKUP / RESTORE
  // ========================================

  /** Resolve callback for the pending backup promise (if any) */
  private backupPendingResolve: (() => void) | null = null;

  /**
   * Backup pending mutations to localStorage
   *
   * Prevents data loss if IndexedDB is cleared.
   * Debounced to coalesce rapid writes — previous callers resolve immediately
   * when a new call supersedes their timer.
   */
  async backupMutationsToLocalStorage(): Promise<void> {
    if (typeof window === 'undefined') return;

    // If a previous debounce is pending, resolve its promise so the caller unblocks
    if (this.backupDebounceTimer) {
      clearTimeout(this.backupDebounceTimer);
      if (this.backupPendingResolve) {
        this.backupPendingResolve();
        this.backupPendingResolve = null;
      }
    }

    return new Promise(resolve => {
      this.backupPendingResolve = resolve;
      this.backupDebounceTimer = setTimeout(async () => {
        this.backupPendingResolve = null;

        // Skip if backup already in progress
        if (this.isBackupInProgress) {
          this.logger.log('[MutationManager] Backup already in progress, skipping duplicate call');
          resolve();
          return;
        }

        this.isBackupInProgress = true;
        try {
          const db = await databaseManager.getDatabase('MutationManager');
          const pending = await db.getAll(REPLICATION_STORES.PENDING_MUTATIONS);

          if (pending.length > 0) {
            localStorage.setItem(BACKUP_STORAGE_KEY, JSON.stringify(pending));
            this.logger.log(
              `[MutationManager] Backed up ${pending.length} mutations to localStorage`
            );
          } else {
            localStorage.removeItem(BACKUP_STORAGE_KEY);
          }
        } catch (error) {
          this.logger.warn('[MutationManager] Failed to backup mutations to localStorage:', error);
        } finally {
          this.isBackupInProgress = false;
          resolve();
        }
      }, BACKUP_DEBOUNCE_MS);
    });
  }

  /**
   * Restore pending mutations from localStorage backup
   *
   * Recovers mutations after IndexedDB is cleared.
   * Only restores mutations not already present in IndexedDB.
   */
  async restoreMutationsFromLocalStorage(): Promise<void> {
    if (typeof window === 'undefined') return;

    try {
      const backup = localStorage.getItem(BACKUP_STORAGE_KEY);

      if (!backup) {
        return; // No backup to restore
      }

      const parsed: unknown = JSON.parse(backup);

      if (!Array.isArray(parsed) || parsed.length === 0) {
        return;
      }

      // Validate structure before touching IndexedDB — a corrupt backup must
      // not introduce malformed mutations that crash executeMutation.
      const validOps = new Set<string>(['INSERT', 'UPDATE', 'DELETE', 'BATCH_UPDATE']);
      const mutations = parsed.filter((m): m is PendingMutation => {
        if (typeof m !== 'object' || m === null) return false;
        const candidate = m as Record<string, unknown>;
        return (
          typeof candidate.id === 'string' &&
          typeof candidate.tableName === 'string' &&
          typeof candidate.operation === 'string' &&
          validOps.has(candidate.operation) &&
          typeof candidate.rowId === 'string'
        );
      });

      if (mutations.length < parsed.length) {
        this.logger.warn(
          `[MutationManager] Discarded ${parsed.length - mutations.length} malformed mutation(s) from localStorage backup`
        );
      }

      if (mutations.length === 0) {
        return;
      }

      const db = await databaseManager.getDatabase('MutationManager');

      // Check if mutations already exist in IndexedDB
      const existing = await db.getAll(REPLICATION_STORES.PENDING_MUTATIONS);
      const existingIds = new Set(existing.map((m: PendingMutation) => m.id));

      let restoredCount = 0;

      for (const mutation of mutations) {
        // Only restore pending mutations that aren't already in IndexedDB
        // Skip failed mutations to prevent infinite retry loops
        if (!existingIds.has(mutation.id) && mutation.status !== 'failed') {
          await db.put(REPLICATION_STORES.PENDING_MUTATIONS, mutation);
          restoredCount++;
        }
      }

      if (restoredCount > 0) {
        this.logger.log(
          `[MutationManager] Restored ${restoredCount} mutations from localStorage backup`
        );
      }
    } catch (error) {
      this.logger.error('[MutationManager] Failed to restore mutations from localStorage:', error);
    }
  }

  // ========================================
  // USER NOTIFICATION
  // ========================================

  /**
   * Notify user of sync failures via CustomEvent
   */
  private notifyUserOfSyncFailure(failedMutations: PendingMutation[]): void {
    if (typeof window !== 'undefined') {
      const event = new CustomEvent('replication:sync-failed', {
        detail: {
          count: failedMutations.length,
          mutations: failedMutations,
          message: `${failedMutations.length} change(s) failed to sync. Please check your connection and try again.`,
        },
      });

      window.dispatchEvent(event);
    }

    this.logger.error(
      `[MutationManager] ${failedMutations.length} mutations failed permanently`,
      failedMutations
    );
  }

  // ========================================
  // CLEANUP
  // ========================================

  /**
   * Clear all pending mutations
   *
   * Call on logout or show switch to prevent stale mutations
   * from previous sessions being uploaded.
   */
  async clearAllMutations(): Promise<void> {
    try {
      const db = await databaseManager.getDatabase('MutationManager');

      // Clear all pending mutations from IndexedDB
      const tx = db.transaction(REPLICATION_STORES.PENDING_MUTATIONS, 'readwrite');
      await tx.store.clear();
      await tx.done;

      // Also clear the localStorage backup
      if (typeof window !== 'undefined') {
        localStorage.removeItem(BACKUP_STORAGE_KEY);
      }

      this.logger.log('[MutationManager] Cleared all pending mutations and localStorage backup');
    } catch (error) {
      this.logger.error('[MutationManager] Failed to clear mutations:', error);
    }
  }

  /**
   * Clean up resources (timers)
   *
   * Call when disposing of the MutationManager instance.
   */
  destroy(): void {
    if (this.backupDebounceTimer) {
      clearTimeout(this.backupDebounceTimer);
      this.backupDebounceTimer = null;
    }
    if (this.uploadDebounceTimer) {
      clearTimeout(this.uploadDebounceTimer);
      this.uploadDebounceTimer = null;
    }

    this.logger.log('[MutationManager] Destroyed');
  }
}
