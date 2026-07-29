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
import { getMutationQueueCapacity } from './mutation-queue-capacity';
import {
  MUTATION_BACKUP_STORAGE_KEY,
  parseMutationBackup,
  writeMutationBackup,
} from './mutation-backup';
import { MutationQueueStore } from './MutationQueueStore';
import { MutationUploadRunner } from './MutationUploadRunner';
import { type PendingMutation, type SyncResult } from './types';

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
  /**
   * Lifetime cap on OCC-conflict upload attempts for one mutation (default:
   * 50). occRetries persists on the queued mutation, so the cap holds across
   * page reloads. On reaching it the mutation is PARKED into the
   * failed-mutations store (visible, user-recoverable via retry/discard —
   * never silently dropped) instead of retrying the same conflicting write
   * forever — the 2026-07-11 ringside conflict storm.
   */
  maxOccAttempts?: number;
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
  private logger: Logger;
  private queueStore: MutationQueueStore;
  private uploadRunner: MutationUploadRunner;

  constructor(supabaseClient: SupabaseClient, options: MutationManagerOptions = {}) {
    this.logger = options.logger ?? noopLogger;
    this.queueStore = new MutationQueueStore(this.logger);
    this.uploadRunner = new MutationUploadRunner(
      supabaseClient,
      this.logger,
      options.maxRetries ?? 3,
      options.retryBackoffBase ?? 1000,
      options.maxOccAttempts ?? 50,
      this.queueStore,
      () => this.writeCurrentMutationsBackup()
    );
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
   * @param scheduleUploadNow - When false, the mutation is persisted but the
   *   auto-upload is NOT scheduled; the caller must call requestUpload() after
   *   it has finished any dependent local write. Prevents an online upload from
   *   flushing (and deleting) the mutation before the caller marks its cache row
   *   dirty — which would strand the row as pending forever.
   * @returns The generated mutation ID
   */
  async queueMutation(
    tableName: string,
    operation: PendingMutation['operation'],
    rowId: string,
    data: Record<string, unknown>,
    dependsOn?: string[],
    serverVersion?: number,
    rpc?: PendingMutation['rpc'],
    scheduleUploadNow = true
  ): Promise<string> {
    // Queue overflow protection
    const pendingCount = await this.getPendingCount();
    const capacity = getMutationQueueCapacity(pendingCount);
    if (capacity === 'overflow') {
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
    if (capacity === 'warning') {
      this.logger.warn(`[MutationManager] Queue warning: ${pendingCount} pending mutations`);
    }

    const id = await this.queueStore.queueMutation(
      tableName,
      operation,
      rowId,
      data,
      dependsOn,
      serverVersion,
      rpc
    );
    // Backup synchronously (not debounced): a page reload inside a debounce
    // window would leave the newest mutations only in IndexedDB, where browser
    // cache eviction can destroy them. Offline scores must hit localStorage
    // before queueMutation resolves.
    //
    // But the backup is a SECONDARY safety net: the score is already durable in
    // IndexedDB above. A localStorage-full failure (Safari private mode, a large
    // queue) must NOT fail a successfully-queued score, so swallow it here
    // instead of rejecting queueMutation (audit M2).
    try {
      await this.writeCurrentMutationsBackup();
    } catch (backupErr) {
      this.logger.warn(
        '[MutationManager] localStorage backup failed (score is durably queued in IndexedDB):',
        backupErr
      );
    }

    // Announce the queue grew so pending-count UIs update immediately rather
    // than waiting for the next poll tick. Critical offline: no upload-complete
    // event can fire while offline, so without this the "N waiting to sync"
    // signal would lag a queued score by up to the poll interval.
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('replication:mutation-queued', { detail: { rowId } }));
    }

    // Auto-upload: schedule immediate flush to server — unless the caller is
    // deferring it until after a dependent local write (see scheduleUploadNow).
    if (scheduleUploadNow) {
      this.scheduleUpload();
    }

    return id;
  }

  /**
   * Public trigger for a debounced upload. Used by callers that queued a
   * mutation with `scheduleUploadNow: false` and have now finished the dependent
   * local write (e.g. marking the cache row dirty), so it is safe to flush.
   */
  requestUpload(): void {
    this.scheduleUpload();
  }

  /**
   * Get the count of pending mutations in the queue
   */
  async getPendingCount(): Promise<number> {
    return this.queueStore.getPendingCount();
  }

  /**
   * List queued mutations for a specific table row.
   *
   * This is intentionally narrow: callers can depend on a local row's pending
   * mutation without reaching into the queue store directly.
   */
  async getPendingMutationsForRow(tableName: string, rowId: string): Promise<PendingMutation[]> {
    return this.queueStore.getPendingMutationsForRow(tableName, rowId);
  }

  // ========================================
  // FAILED MUTATION MANAGEMENT
  // ========================================

  /**
   * List permanently failed mutations awaiting user review.
   *
   * Mutations land here when they exhaust retries or hit a non-retryable
   * error (RLS rejection, constraint violation, expired auth). They are
   * never deleted automatically — the user must retry or discard them.
   */
  async getFailedMutations(): Promise<PendingMutation[]> {
    return this.queueStore.getFailedMutations();
  }

  /**
   * Re-queue a failed mutation for upload (e.g. after the user re-authenticates
   * or a secretary fixes the underlying permission problem). Resets the retry
   * counter so the mutation gets a full set of attempts.
   */
  async retryFailedMutation(mutationId: string): Promise<void> {
    const failed = await this.queueStore.retryFailedMutation(mutationId);
    if (!failed) return;
    await this.writeCurrentMutationsBackup();
    this.scheduleUpload();
  }

  /**
   * Permanently discard a failed mutation after user review.
   */
  async discardFailedMutation(mutationId: string): Promise<void> {
    await this.queueStore.discardFailedMutation(mutationId);
    // Refresh the localStorage backup: failed mutations are included in it, so
    // without this a discarded mutation is restored (and re-surfaced) after a
    // circuit-breaker recovery or startup restore — the discard wouldn't be
    // durable.
    await this.writeCurrentMutationsBackup();
    this.logger.log(`[MutationManager] Discarded failed mutation ${mutationId}`);
  }

  /**
   * Discard all queued mutations for a specific row.
   *
   * Call this when the user chooses "Take theirs" in the conflict resolution UI —
   * otherwise the old local value re-uploads on the next sync cycle and silently
   * overwrites the remote version the user just accepted.
   */
  async discardPendingMutationsForRow(tableName: string, rowId: string): Promise<void> {
    const discarded = await this.queueStore.discardPendingMutationsForRow(tableName, rowId);
    if (discarded === 0) return;
    await this.writeCurrentMutationsBackup();
  }

  /**
   * Update the OCC serverVersion on all pending mutations for a row.
   *
   * Call this after the user chooses "Keep mine" so that the next upload uses
   * the conflict-snapshot's remoteServerVersion as the WHERE precondition.
   * Without this, the re-upload still carries the stale snapshot version and
   * is immediately rejected again, causing an infinite conflict loop.
   */
  async updateMutationServerVersions(
    tableName: string,
    rowId: string,
    newServerVersion: number
  ): Promise<void> {
    const updated = await this.queueStore.updateMutationServerVersions(
      tableName,
      rowId,
      newServerVersion
    );
    if (updated === 0) return;
    await this.writeCurrentMutationsBackup();
  }

  /**
   * Reconcile the QUEUED mutations for a row after a non-conflicting dirty
   * sync-down advanced the row's OCC token (syncReplicatedTable → reconcileDirtyRow).
   *
   * This is what actually stops the stale-token storm: the upload reads
   * `mutation.serverVersion` / `mutation.data` from the queued snapshot, NOT the
   * IndexedDB replicated row — so reconciling only the row leaves the queued
   * mutation uploading the stale token forever. Per UPDATE mutation on the row:
   *
   *  - **RPC delta mutation** (`mutation.rpc` set): advance `serverVersion`
   *    forward-only. The payload is the touched-field delta (`rpc.fields`), which
   *    never clobbers server-changed untouched fields, so the token advance alone
   *    is correct. This is the ringside incident path.
   *  - **Full-row direct UPDATE** (no `rpc`): the upload sends the entire
   *    `mutation.data`, so advancing the token without refreshing the payload would
   *    regress server-changed untouched fields (silent clobber). Only advance — and
   *    replace `data` with `rebuiltData` — when the caller supplied a rebuilt
   *    payload (from the reconciled row). Keys recorded as deliberate when the
   *    mutation was queued and omitted by the rebuild are retained; adapters use
   *    that omission to distinguish explicit intent from server-owned values.
   *    For legacy mutations without recorded keys, the table adapter can name
   *    omitted keys that must remain server-wins. With no rebuild available the
   *    mutation is LEFT UNTOUCHED (stays throttled by the #961 backoff) rather than
   *    clobber.
   *
   * INSERT/DELETE carry no OCC token and are ignored.
   */
  async reconcilePendingMutationsForRow(
    tableName: string,
    rowId: string,
    newServerVersion: number,
    rebuiltData?: Record<string, unknown>,
    legacyOmittedKeysServerWins?: readonly string[]
  ): Promise<void> {
    const changed = await this.queueStore.reconcilePendingMutationsForRow(
      tableName,
      rowId,
      newServerVersion,
      rebuiltData,
      legacyOmittedKeysServerWins
    );
    if (changed > 0) {
      await this.writeCurrentMutationsBackup();
    }
  }

  // ========================================
  // MUTATION UPLOAD
  // ========================================

  private scheduleUpload(): void {
    this.uploadRunner.scheduleUpload(() => this.uploadPendingMutations());
  }

  /**
   * Upload pending mutations (offline changes) to server.
   *
   * Serialized ACROSS TABS via the Web Locks API: two tabs uploading the same
   * queue can double-apply a mutation or, worse, re-insert one that the other
   * tab already uploaded and deleted (a zombie stuck in OCC backoff — audit M1).
   * The per-tab `isUploading` guard still prevents re-entrancy within a tab, and
   * we fall back to it alone when Web Locks is unavailable (older engines, tests).
   */
  async uploadPendingMutations(): Promise<SyncResult[]> {
    return this.uploadRunner.uploadPendingMutations();
  }

  // ========================================
  // BACKUP / RESTORE
  // ========================================

  /**
   * Backup pending mutations to localStorage
   *
   * Prevents data loss if IndexedDB is cleared. Writes immediately — a
   * debounced write here would leave a window where a page reload loses the
   * newest queued mutations (offline scores) if IndexedDB is later evicted.
   */
  async backupMutationsToLocalStorage(): Promise<void> {
    if (typeof window === 'undefined') return;

    try {
      await this.writeCurrentMutationsBackup();
    } catch (error) {
      this.logger.warn('[MutationManager] Failed to backup mutations to localStorage:', error);
    }
  }

  /**
   * Write the current IndexedDB mutation queue to localStorage immediately.
   * Used after uploads, where stale backups are more dangerous than write
   * coalescing.
   */
  private async writeCurrentMutationsBackup(): Promise<void> {
    if (typeof window === 'undefined') return;

    const db = await databaseManager.getDatabase('MutationManager');
    const pending = (await db.getAll(REPLICATION_STORES.PENDING_MUTATIONS)) as PendingMutation[];
    // Include dead-lettered mutations (status: 'failed') so a circuit-breaker DB
    // wipe can't destroy them — they carry the 'failed' status, so restore
    // routes them back to the failed store, not the active queue.
    const failed = (await db.getAll(REPLICATION_STORES.FAILED_MUTATIONS)) as PendingMutation[];

    writeMutationBackup(localStorage, [...pending, ...failed]);
    if (pending.length > 0 || failed.length > 0) {
      this.logger.log(
        `[MutationManager] Backed up ${pending.length} pending + ${failed.length} failed mutation(s) to localStorage`
      );
    }
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
      const backup = localStorage.getItem(MUTATION_BACKUP_STORAGE_KEY);

      const parsed = parseMutationBackup(backup);
      if (parsed.error) {
        this.logger.error(
          '[MutationManager] Failed to restore mutations from localStorage:',
          parsed.error
        );
        return;
      }

      if (
        !backup ||
        (parsed.mutations.length === 0 &&
          parsed.failedMutations.length === 0 &&
          parsed.malformedCount === 0)
      ) {
        return; // No backup to restore
      }

      if (parsed.malformedCount > 0) {
        this.logger.warn(
          `[MutationManager] Discarded ${parsed.malformedCount} malformed mutation(s) from localStorage backup`
        );
      }

      if (parsed.mutations.length === 0 && parsed.failedMutations.length === 0) {
        return;
      }

      const db = await databaseManager.getDatabase('MutationManager');

      // Restore pending mutations into the active queue (dedup by id).
      const existing = await db.getAll(REPLICATION_STORES.PENDING_MUTATIONS);
      const existingIds = new Set(existing.map((m: PendingMutation) => m.id));

      let restoredCount = 0;
      for (const mutation of parsed.mutations) {
        if (!existingIds.has(mutation.id)) {
          await db.put(REPLICATION_STORES.PENDING_MUTATIONS, mutation);
          restoredCount++;
        }
      }

      // Restore dead-lettered mutations into the FAILED store (dedup by id) so
      // they don't auto-retry but remain reviewable after a DB wipe.
      const existingFailed = await db.getAll(REPLICATION_STORES.FAILED_MUTATIONS);
      const existingFailedIds = new Set(existingFailed.map((m: PendingMutation) => m.id));

      let restoredFailedCount = 0;
      for (const mutation of parsed.failedMutations) {
        if (!existingFailedIds.has(mutation.id)) {
          await db.put(REPLICATION_STORES.FAILED_MUTATIONS, mutation);
          restoredFailedCount++;
        }
      }

      if (restoredCount > 0 || restoredFailedCount > 0) {
        this.logger.log(
          `[MutationManager] Restored ${restoredCount} pending + ${restoredFailedCount} failed mutation(s) from localStorage backup`
        );
      }
    } catch (error) {
      this.logger.error('[MutationManager] Failed to restore mutations from localStorage:', error);
    }
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
      await this.queueStore.clearAllMutations();

      // Also clear the localStorage backup
      if (typeof window !== 'undefined') {
        localStorage.removeItem(MUTATION_BACKUP_STORAGE_KEY);
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
    this.uploadRunner.destroy();
    this.logger.log('[MutationManager] Destroyed');
  }
}
