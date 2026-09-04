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
import { getMutationQueueCapacity } from './mutation-queue-capacity';
import { MutationBackupStore } from './MutationBackupStore';
import { MutationQueueStore } from './MutationQueueStore';
import { MutationUploadRunner } from './MutationUploadRunner';
import { type PendingMutation, type SyncResult } from './types';
import type { MutationManagerOptions, MutationUploadAuthContext } from './mutation-manager-options';
export type { MutationManagerOptions, MutationUploadAuthContext } from './mutation-manager-options';

// ============================================
// TYPES
// ============================================

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
  private backupStore: MutationBackupStore;
  private uploadRunner: MutationUploadRunner;
  /** Prevent startup/reconnect restore from racing an active queue flush. */
  private restoreInFlight: Promise<void> | null = null;
  private uploadInFlight: Promise<SyncResult[]> | null = null;
  private readonly getCurrentUserId: () => Promise<string | null>;
  private readonly getCurrentUploadContext: () => Promise<MutationUploadAuthContext | null>;
  private readonly acquireQueueMutationLock: (() => () => void) | undefined;

  constructor(supabaseClient: SupabaseClient, options: MutationManagerOptions = {}) {
    if (!supabaseClient) throw new Error('[MutationManager] Supabase client is required');
    this.logger = options.logger ?? noopLogger;
    this.getCurrentUserId = options.getCurrentUserId ?? (async () => null);
    this.getCurrentUploadContext = options.getCurrentUploadContext ?? (async () => null);
    this.acquireQueueMutationLock = options.acquireQueueMutationLock;
    this.queueStore = new MutationQueueStore(this.logger);
    this.backupStore = new MutationBackupStore(this.logger);
    this.uploadRunner = new MutationUploadRunner(
      this.logger,
      options.maxRetries ?? 3,
      options.retryBackoffBase ?? 1000,
      options.maxOccAttempts ?? 50,
      this.queueStore,
      () => this.backupStore.writeCurrent(),
      () => this.requireCurrentUploadContext()
    );
  }

  private async requireCurrentUserId(): Promise<string> {
    const authUserId = await this.getCurrentUserId();
    if (typeof authUserId !== 'string' || authUserId.trim().length === 0) {
      throw new Error('[MutationManager] Cannot operate without an authenticated user identity');
    }
    return authUserId;
  }

  private async requireSameCurrentUserId(expectedAuthUserId: string): Promise<void> {
    if ((await this.requireCurrentUserId()) !== expectedAuthUserId) {
      throw new Error('[MutationManager] Authenticated user changed during queue operation');
    }
  }

  private async requireCurrentUploadContext(): Promise<MutationUploadAuthContext> {
    const context = await this.getCurrentUploadContext();
    if (
      !context ||
      typeof context.authUserId !== 'string' ||
      context.authUserId.trim().length === 0 ||
      !context.supabaseClient
    ) {
      throw new Error('[MutationManager] Cannot upload without a bound authenticated session');
    }
    return context;
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
    const releaseQueueLock = this.acquireQueueMutationLock?.();
    try {
      const authUserId = await this.requireCurrentUserId();
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
        authUserId,
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
        await this.backupStore.writeCurrent();
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
    } finally {
      releaseQueueLock?.();
    }
  }

  /** Acquire the app-level write slot for a local-write/queue pair. */
  acquireMutationWriteLock(): (() => void) | undefined {
    return this.acquireQueueMutationLock?.();
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
    const authUserId = await this.requireCurrentUserId();
    const pending = await this.queueStore.getPendingMutationsForRow(tableName, rowId, authUserId);
    await this.requireSameCurrentUserId(authUserId);
    return pending;
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
    const authUserId = await this.requireCurrentUserId();
    const failed = await this.queueStore.getFailedMutations(authUserId);
    await this.requireSameCurrentUserId(authUserId);
    return failed;
  }

  /**
   * Re-queue a failed mutation for upload (e.g. after the user re-authenticates
   * or a secretary fixes the underlying permission problem). Resets the retry
   * counter so the mutation gets a full set of attempts.
   */
  async retryFailedMutation(mutationId: string): Promise<void> {
    const authUserId = await this.requireCurrentUserId();
    const failed = await this.queueStore.retryFailedMutation(mutationId, authUserId, () =>
      this.requireSameCurrentUserId(authUserId)
    );
    if (!failed) return;
    await this.backupStore.writeCurrent();
    this.scheduleUpload();
  }

  /**
   * Permanently discard a failed mutation after user review.
   */
  async discardFailedMutation(mutationId: string): Promise<void> {
    const authUserId = await this.requireCurrentUserId();
    const discarded = await this.queueStore.discardFailedMutation(mutationId, authUserId, () =>
      this.requireSameCurrentUserId(authUserId)
    );
    if (!discarded) return;
    // Refresh the localStorage backup: failed mutations are included in it, so
    // without this a discarded mutation is restored (and re-surfaced) after a
    // circuit-breaker recovery or startup restore — the discard wouldn't be
    // durable.
    await this.backupStore.writeCurrent();
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
    const authUserId = await this.requireCurrentUserId();
    const discarded = await this.queueStore.discardPendingMutationsForRow(
      tableName,
      rowId,
      authUserId,
      () => this.requireSameCurrentUserId(authUserId)
    );
    if (discarded === 0) return;
    await this.backupStore.writeCurrent();
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
    const authUserId = await this.requireCurrentUserId();
    const updated = await this.queueStore.updateMutationServerVersions(
      tableName,
      rowId,
      newServerVersion,
      authUserId,
      () => this.requireSameCurrentUserId(authUserId)
    );
    if (updated === 0) return;
    await this.backupStore.writeCurrent();
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
    const authUserId = await this.requireCurrentUserId();
    const changed = await this.queueStore.reconcilePendingMutationsForRow(
      tableName,
      rowId,
      newServerVersion,
      authUserId,
      rebuiltData,
      legacyOmittedKeysServerWins,
      () => this.requireSameCurrentUserId(authUserId)
    );
    if (changed > 0) {
      await this.backupStore.writeCurrent();
    }
  }

  // ========================================
  // MUTATION UPLOAD
  // ========================================

  private scheduleUpload(): void {
    this.uploadRunner.scheduleUpload(() => this.uploadPendingMutations());
  }

  private requestOverlappingUpload(): void {
    void this.uploadRunner.uploadPendingMutations().catch(error => {
      this.logger.error('[MutationManager] Overlapping upload request failed:', error);
    });
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
    if (this.uploadInFlight) {
      // Preserve the runner's queued-while-running signal. Returning the
      // in-flight result here used to strand mutations queued by an auto-upload
      // callback because the runner never saw the overlapping request.
      this.requestOverlappingUpload();
      return [];
    }

    // A restore may have already read the backup while this upload was
    // requested. Finish it first so the upload sees every restored mutation.
    if (this.restoreInFlight) await this.restoreInFlight;
    if (this.uploadInFlight) {
      this.requestOverlappingUpload();
      return [];
    }

    const upload = this.uploadRunner.uploadPendingMutations();
    this.uploadInFlight = upload;
    try {
      return await upload;
    } finally {
      if (this.uploadInFlight === upload) this.uploadInFlight = null;
    }
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
    await this.backupStore.backupSafely();
  }

  /**
   * Restore pending mutations from localStorage backup
   *
   * Recovers mutations after IndexedDB is cleared.
   * Only restores mutations not already present in IndexedDB.
   */
  async restoreMutationsFromLocalStorage(): Promise<void> {
    if (this.restoreInFlight) return this.restoreInFlight;

    // Never restore a stale backup into a queue that is being flushed. The
    // flush owns deletion and its pass-level backup; restore follows it.
    // A failed upload must not prevent startup/reconnect recovery from running.
    // The upload caller still receives the rejection; restore can inspect the
    // durable queue and retry on its own.
    if (this.uploadInFlight) await this.uploadInFlight.catch(() => undefined);

    const restore = this.backupStore.restore();
    this.restoreInFlight = restore;
    try {
      await restore;
    } finally {
      if (this.restoreInFlight === restore) this.restoreInFlight = null;
    }
  }

  // ========================================
  // CLEANUP
  // ========================================

  /**
   * Clear pending and failed mutations owned by the current user.
   * Foreign and legacy-unowned work remains held for its owner or migration.
   */
  async clearAllMutations(): Promise<void> {
    try {
      const authUserId = await this.requireCurrentUserId();
      await this.queueStore.clearMutationsForOwner(authUserId, () =>
        this.requireSameCurrentUserId(authUserId)
      );
      await this.backupStore.writeCurrent();

      this.logger.log('[MutationManager] Cleared mutations owned by the active user');
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
