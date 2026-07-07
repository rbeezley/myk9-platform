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
import { markPerf, measurePerf } from './perf';
import { withTimeout, TIMEOUT_PRESETS, calculateBackoffDelay } from './mutation-utils';
import { classifyMutationFailure } from './mutation-retry';
import {
  classifyEmptyUpdateResult,
  getConflictServerVersion,
  getReturnedServerVersion,
  isVersionConflictError,
  OccRejectionError,
} from './mutation-occ';
import { sortMutationsByDependencies } from './mutation-ordering';
import { getMutationQueueCapacity, QUEUE_MAX_SIZE } from './mutation-queue-capacity';
import {
  MUTATION_BACKUP_STORAGE_KEY,
  parseMutationBackup,
  writeMutationBackup,
} from './mutation-backup';
import { type PendingMutation, type ReplicatedRow, type SyncResult } from './types';

// ============================================
// CONSTANTS
// ============================================

const POSTGRES_UNIQUE_VIOLATION = '23505';

interface MutationExecutionResult {
  newServerVersion?: number;
  remappedRowId?: string;
}

function isPrimaryKeyDuplicateError(error: unknown, tableName: string, rowId: string): boolean {
  const candidate = error as { code?: unknown; message?: unknown; details?: unknown } | null;
  if (candidate?.code !== POSTGRES_UNIQUE_VIOLATION) return false;

  const haystack = [candidate.message, candidate.details]
    .filter((part): part is string => typeof part === 'string')
    .join(' ')
    .toLowerCase();
  const tablePrimaryKey = `${tableName.toLowerCase()}_pkey`;
  const normalizedRowId = rowId.toLowerCase();

  return (
    haystack.includes(tablePrimaryKey) ||
    (haystack.includes('key (id)=') && haystack.includes(`(${normalizedRowId})`))
  );
}

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

  // Auto-upload: flush mutations to server shortly after queuing
  private uploadDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private backoffRetryTimer: ReturnType<typeof setTimeout> | null = null;
  private backoffRetryAt: number | null = null;
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
    dependsOn?: string[],
    serverVersion?: number,
    rpc?: PendingMutation['rpc']
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
      ...(serverVersion !== undefined && { serverVersion }),
      ...(rpc !== undefined && { rpc }),
    };
    await db.put(REPLICATION_STORES.PENDING_MUTATIONS, mutation);
    this.logger.log(`[MutationManager] Queued ${operation} for ${tableName}/${rowId}`);
    // Backup synchronously (not debounced): a page reload inside a debounce
    // window would leave the newest mutations only in IndexedDB, where browser
    // cache eviction can destroy them. Offline scores must hit localStorage
    // before queueMutation resolves.
    await this.writeCurrentMutationsBackup();

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

  /**
   * List queued mutations for a specific table row.
   *
   * This is intentionally narrow: callers can depend on a local row's pending
   * mutation without reaching into the queue store directly.
   */
  async getPendingMutationsForRow(tableName: string, rowId: string): Promise<PendingMutation[]> {
    const db = await databaseManager.getDatabase('MutationManager');
    const all = (await db.getAll(REPLICATION_STORES.PENDING_MUTATIONS)) as PendingMutation[];

    return all
      .filter(mutation => mutation.tableName === tableName && mutation.rowId === rowId)
      .sort((a, b) => {
        const sequenceA = a.sequenceNumber ?? Number.MAX_SAFE_INTEGER;
        const sequenceB = b.sequenceNumber ?? Number.MAX_SAFE_INTEGER;
        if (sequenceA !== sequenceB) return sequenceA - sequenceB;
        if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp;
        return a.id.localeCompare(b.id);
      });
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
    const db = await databaseManager.getDatabase('MutationManager');
    return (await db.getAll(REPLICATION_STORES.FAILED_MUTATIONS)) as PendingMutation[];
  }

  /**
   * Re-queue a failed mutation for upload (e.g. after the user re-authenticates
   * or a secretary fixes the underlying permission problem). Resets the retry
   * counter so the mutation gets a full set of attempts.
   */
  async retryFailedMutation(mutationId: string): Promise<void> {
    const db = await databaseManager.getDatabase('MutationManager');
    const failed = (await db.get(REPLICATION_STORES.FAILED_MUTATIONS, mutationId)) as
      PendingMutation | undefined;
    if (!failed) return;

    const requeued: PendingMutation = {
      ...failed,
      status: 'pending',
      retries: 0,
    };
    delete requeued.error;
    delete requeued.nextRetryAt;
    delete requeued.failedAt;

    await db.put(REPLICATION_STORES.PENDING_MUTATIONS, requeued);
    await db.delete(REPLICATION_STORES.FAILED_MUTATIONS, mutationId);
    this.logger.log(
      `[MutationManager] Re-queued failed mutation ${mutationId} (${failed.tableName}/${failed.rowId})`
    );
    await this.writeCurrentMutationsBackup();
    this.scheduleUpload();
  }

  /**
   * Permanently discard a failed mutation after user review.
   */
  async discardFailedMutation(mutationId: string): Promise<void> {
    const db = await databaseManager.getDatabase('MutationManager');
    await db.delete(REPLICATION_STORES.FAILED_MUTATIONS, mutationId);
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
    const db = await databaseManager.getDatabase('MutationManager');
    const all = await db.getAll(REPLICATION_STORES.PENDING_MUTATIONS);
    const toDelete = all.filter(m => m.tableName === tableName && m.rowId === rowId).map(m => m.id);

    if (toDelete.length === 0) return;

    const tx = db.transaction(REPLICATION_STORES.PENDING_MUTATIONS, 'readwrite');
    for (const id of toDelete) {
      await tx.store.delete(id);
    }
    await tx.done;
    this.logger.log(
      `[MutationManager] Discarded ${toDelete.length} mutation(s) for ${tableName}/${rowId} (conflict resolved: take remote)`
    );
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
    const db = await databaseManager.getDatabase('MutationManager');
    const all = await db.getAll(REPLICATION_STORES.PENDING_MUTATIONS);
    const toUpdate = all.filter(m => m.tableName === tableName && m.rowId === rowId);

    if (toUpdate.length === 0) return;

    const tx = db.transaction(REPLICATION_STORES.PENDING_MUTATIONS, 'readwrite');
    for (const mutation of toUpdate) {
      await tx.store.put({ ...mutation, serverVersion: newServerVersion });
    }
    await tx.done;
    this.logger.log(
      `[MutationManager] Updated serverVersion → ${newServerVersion} for ${toUpdate.length} mutation(s) on ${tableName}/${rowId}`
    );
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
   *    payload (from the reconciled row). With no rebuild available the mutation is
   *    LEFT UNTOUCHED (stays throttled by the #961 backoff) rather than clobber.
   *
   * INSERT/DELETE carry no OCC token and are ignored.
   */
  async reconcilePendingMutationsForRow(
    tableName: string,
    rowId: string,
    newServerVersion: number,
    rebuiltData?: Record<string, unknown>
  ): Promise<void> {
    const db = await databaseManager.getDatabase('MutationManager');
    const all = await db.getAll(REPLICATION_STORES.PENDING_MUTATIONS);
    const candidates = all.filter(
      m => m.tableName === tableName && m.rowId === rowId && m.operation === 'UPDATE'
    );
    if (candidates.length === 0) return;

    const tx = db.transaction(REPLICATION_STORES.PENDING_MUTATIONS, 'readwrite');
    let changed = 0;
    for (const mutation of candidates) {
      const isRpc = mutation.rpc !== undefined;
      // A full-row UPDATE can only be advanced if we can also refresh its payload;
      // otherwise advancing the token would trade a 40001 for a silent clobber.
      if (!isRpc && rebuiltData === undefined) continue;

      const nextServerVersion =
        mutation.serverVersion === undefined || newServerVersion > mutation.serverVersion
          ? newServerVersion
          : mutation.serverVersion;

      const next: PendingMutation = {
        ...mutation,
        serverVersion: nextServerVersion,
        ...(!isRpc && rebuiltData !== undefined ? { data: rebuiltData } : {}),
      };
      await tx.store.put(next);
      changed++;
    }
    await tx.done;

    if (changed > 0) {
      this.logger.log(
        `[MutationManager] Reconciled ${changed} queued mutation(s) for ${tableName}/${rowId} ` +
          `→ serverVersion ${newServerVersion}`
      );
      await this.writeCurrentMutationsBackup();
    }
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
   * Schedule an upload retry at the given timestamp so mutations stuck in
   * backoff get retried even if no new mutations are queued in the meantime.
   * If a timer is already pending for an earlier time, keep it.
   */
  private scheduleBackoffRetry(atTimestamp: number): void {
    if (
      this.backoffRetryTimer &&
      this.backoffRetryAt !== null &&
      this.backoffRetryAt <= atTimestamp
    ) {
      return;
    }

    const delay = Math.max(0, atTimestamp - Date.now());

    if (this.backoffRetryTimer) {
      clearTimeout(this.backoffRetryTimer);
    }

    this.backoffRetryAt = atTimestamp;
    this.logger.log(`[MutationManager] Scheduling backoff retry in ${delay}ms`);

    this.backoffRetryTimer = setTimeout(() => {
      this.backoffRetryTimer = null;
      this.backoffRetryAt = null;

      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        return;
      }

      this.uploadPendingMutations().catch(err => {
        this.logger.error('[MutationManager] Backoff retry upload failed:', err);
      });
    }, delay);
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
    markPerf('replication:flush:start');

    try {
      const db = await databaseManager.getDatabase('MutationManager');
      const pending = await db.getAll(REPLICATION_STORES.PENDING_MUTATIONS);

      if (pending.length === 0) {
        this.logger.log('[MutationManager] No pending mutations to upload');
        return [];
      }

      // Warn if mutation queue is getting large
      const capacity = getMutationQueueCapacity(pending.length);
      if (capacity === 'overflow') {
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
      } else if (capacity === 'warning') {
        this.logger.warn(
          `[MutationManager] Mutation queue is getting large (${pending.length}/${QUEUE_MAX_SIZE}). Consider syncing soon.`
        );
      }

      this.logger.log(`[MutationManager] Uploading ${pending.length} pending mutations...`);

      // Sort mutations to respect dependencies
      const ordering = sortMutationsByDependencies(pending as PendingMutation[]);
      const sortedMutations = ordering.sorted;
      const queuedMutationIds = new Set(sortedMutations.map(mutation => mutation.id));
      const uploadedMutationIds = new Set<string>();
      const blockedDependencyIds = new Set<string>();
      const failedMutationRows = (await db.getAll(
        REPLICATION_STORES.FAILED_MUTATIONS
      )) as PendingMutation[];
      const failedDependencyIds = new Set(failedMutationRows.map(mutation => mutation.id));

      if (ordering.circularCount > 0) {
        this.logger.warn(
          `[MutationManager] Circular dependency detected, adding ${ordering.circularCount} mutations in timestamp order`
        );
      }

      const results: SyncResult[] = [];
      const failedMutations: PendingMutation[] = [];
      const now = Date.now();
      // Independent mutations shouldn't stall on one mutation's backoff; track the
      // earliest skipped nextRetryAt so we can self-schedule a follow-up pass.
      let earliestBackoff: number | null = null;

      for (const mutation of sortedMutations) {
        const unresolvedDependencies = (mutation.dependsOn ?? []).filter(
          dependencyId =>
            failedDependencyIds.has(dependencyId) ||
            blockedDependencyIds.has(dependencyId) ||
            (queuedMutationIds.has(dependencyId) && !uploadedMutationIds.has(dependencyId))
        );
        if (unresolvedDependencies.length > 0) {
          blockedDependencyIds.add(mutation.id);
          this.logger.log(
            `[MutationManager] Skipping ${mutation.id} — waiting on dependencies ${unresolvedDependencies.join(', ')}`
          );
          continue;
        }

        if (mutation.nextRetryAt && mutation.nextRetryAt > now) {
          blockedDependencyIds.add(mutation.id);
          this.logger.log(
            `[MutationManager] Skipping ${mutation.id} — backoff until ${new Date(mutation.nextRetryAt).toISOString()}`
          );
          if (earliestBackoff === null || mutation.nextRetryAt < earliestBackoff) {
            earliestBackoff = mutation.nextRetryAt;
          }
          continue;
        }

        const queuedMutation = (await db.get(
          REPLICATION_STORES.PENDING_MUTATIONS,
          mutation.id
        )) as PendingMutation | undefined;
        if (!queuedMutation) {
          continue;
        }

        // Hold uploads for rows with unresolved conflicts. Uploading would either
        // be immediately OCC-rejected (noisy retry loop) or, if OCC were somehow
        // bypassed, silently overwrite the remote value the user just accepted via
        // "Take theirs". The mutation stays in the queue until the user resolves.
        const replicatedRow = (await db.get(REPLICATION_STORES.REPLICATED_TABLES, [
          queuedMutation.tableName,
          String(queuedMutation.rowId),
        ])) as ReplicatedRow<unknown> | undefined;
        if (replicatedRow?.syncStatus === 'conflict') {
          blockedDependencyIds.add(queuedMutation.id);
          this.logger.log(
            `[MutationManager] Skipping ${queuedMutation.id} — ${queuedMutation.tableName}/${queuedMutation.rowId} has unresolved conflict`
          );
          continue;
        }

        try {
          const { newServerVersion, remappedRowId } = await this.executeMutation(queuedMutation);
          const uploadedMutation = remappedRowId
            ? await this.remapUploadedRpcInsertRowId(db, queuedMutation, remappedRowId)
            : queuedMutation;
          await this.markReplicatedRowSynced(db, uploadedMutation, newServerVersion);
          if (newServerVersion !== undefined) {
            await this.updateMutationServerVersions(
              uploadedMutation.tableName,
              uploadedMutation.rowId,
              newServerVersion
            );
          }

          await db.delete(REPLICATION_STORES.PENDING_MUTATIONS, uploadedMutation.id);
          uploadedMutationIds.add(uploadedMutation.id);

          results.push({
            success: true,
            tableName: uploadedMutation.tableName,
            operation: uploadedMutation.operation,
            rowsAffected: 1,
            duration: 0,
          });

          this.logger.log(`[MutationManager] Mutation ${uploadedMutation.id} uploaded successfully`);
        } catch (error) {
          if (error instanceof OccRejectionError) {
            // Concurrent server write rejected this stale offline mutation.
            // Do NOT delete the mutation and do NOT clear isDirty — the row
            // stays dirty so the download loop can detect the same-field conflict
            // and prompt the user to reconcile.
            //
            // Advance the replicated row's OCC token to the authoritative server
            // version so the app stops minting NEW writes with the stale version
            // (queueMutation stamps serverVersion from this row). Without this the
            // client regenerates the same conflicting write indefinitely — the
            // ringside high-CPU conflict storm. We advance the row token only, not
            // this queued mutation's, so the dirty offline edit still awaits user
            // reconciliation rather than auto-overwriting the server.
            const freshServerVersion = error.currentServerVersion ?? error.expectedVersion;
            if (typeof freshServerVersion === 'number') {
              await this.advanceReplicatedRowServerVersion(
                db,
                error.tableName,
                error.rowId,
                freshServerVersion
              );
            }

            // Throttle re-upload of an unresolved conflict (exponential backoff,
            // capped) so it cannot hammer the server every flush cycle. This is a
            // separate counter from `retries` so the conflict is never dead-lettered
            // (which would destroy the offline edit) — it just slows down.
            const occRetries = (queuedMutation.occRetries ?? 0) + 1;
            const occBackoff: PendingMutation = {
              ...queuedMutation,
              occRetries,
              nextRetryAt: now + calculateBackoffDelay(occRetries - 1, this.retryBackoffBase),
            };
            await db.put(REPLICATION_STORES.PENDING_MUTATIONS, occBackoff);
            if (earliestBackoff === null || occBackoff.nextRetryAt! < earliestBackoff) {
              earliestBackoff = occBackoff.nextRetryAt!;
            }

            this.logger.warn(
              `[MutationManager] OCC rejection for ${error.tableName}/${error.rowId} ` +
                `(server version ${freshServerVersion}, attempt ${occRetries}). ` +
                `Row token advanced; mutation stays dirty, next retry after ` +
                `${new Date(occBackoff.nextRetryAt!).toISOString()}.`
            );
            results.push({
              success: false,
              tableName: queuedMutation.tableName,
              operation: queuedMutation.operation,
              rowsAffected: 0,
              duration: 0,
              error: error.message,
            });
            blockedDependencyIds.add(queuedMutation.id);
            continue;
          }
          const failure = classifyMutationFailure({
            mutation: queuedMutation,
            error,
            maxRetries: this.maxRetries,
            retryBackoffBase: this.retryBackoffBase,
          });

          if (failure.permanentlyFailed) {
            failedMutations.push(failure.mutation);
            blockedDependencyIds.add(queuedMutation.id);
            failedDependencyIds.add(queuedMutation.id);
            this.logger.error(
              `[MutationManager] Mutation ${queuedMutation.id} (${queuedMutation.tableName}/${queuedMutation.operation}) failed permanently${failure.canRetry ? ' (max retries)' : ' (non-retryable)'}: ${failure.message}`,
              error
            );
            // Move permanently failed mutations out of the active queue but keep
            // them in the failed_mutations store. Deleting them outright would
            // silently destroy offline work (e.g. ringside scores blocked by an
            // RLS/auth failure) with nothing for the user to review or retry.
            await db.put(REPLICATION_STORES.FAILED_MUTATIONS, failure.mutation);
            await db.delete(REPLICATION_STORES.PENDING_MUTATIONS, queuedMutation.id);
          } else {
            blockedDependencyIds.add(queuedMutation.id);
            this.logger.warn(
              `[MutationManager] Mutation ${queuedMutation.id} failed (retry ${failure.mutation.retries}/${this.maxRetries}), next attempt after ${new Date(failure.mutation.nextRetryAt!).toISOString()}:`,
              error
            );

            await db.put(REPLICATION_STORES.PENDING_MUTATIONS, failure.mutation);

            if (
              failure.mutation.nextRetryAt !== undefined &&
              (earliestBackoff === null || failure.mutation.nextRetryAt < earliestBackoff)
            ) {
              earliestBackoff = failure.mutation.nextRetryAt;
            }
          }

          results.push({
            success: false,
            tableName: queuedMutation.tableName,
            operation: queuedMutation.operation,
            rowsAffected: 0,
            duration: 0,
            error: failure.message,
          });
        }
      }

      if (failedMutations.length > 0) {
        this.notifyUserOfSyncFailure(failedMutations);
      }

      // Persist the post-upload queue immediately. A debounced backup here can
      // leave localStorage holding already-uploaded mutations if the page
      // navigates before the timer fires, causing duplicate replays on restore.
      try {
        await this.writeCurrentMutationsBackup();
      } catch (err) {
        this.logger.warn('[MutationManager] Post-upload backup failed:', err);
      }

      // Self-schedule a retry pass so backoff-skipped mutations don't sit idle
      // when no other activity triggers the upload debounce timer.
      if (earliestBackoff !== null) {
        this.scheduleBackoffRetry(earliestBackoff);
      }

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
      measurePerf('replication:flush', 'replication:flush:start', {
        durationMs: Date.now() - startTime,
      });
    }
  }

  /**
   * Execute a single mutation on the server with timeout protection.
   *
   * Uses `select()` after upsert/delete to get the returned rows,
   * which lets us detect RLS silent rejections (0 rows affected = RLS blocked).
   */
  private async executeMutation(mutation: PendingMutation): Promise<MutationExecutionResult> {
    const { tableName, operation, data } = mutation;

    switch (operation) {
      case 'INSERT': {
        if (mutation.rpc) {
          const { data: returned, error } = await withTimeout(
            this.supabase.rpc(mutation.rpc.name, mutation.rpc.args ?? data),
            TIMEOUT_PRESETS.standard,
            `${tableName} rpc ${mutation.rpc.name}`
          );
          if (error) throw error;
          if (mutation.rpc.expectRowId && typeof returned === 'string') {
            if (returned !== mutation.rowId) {
              return { remappedRowId: returned };
            }
          }
          return {};
        }

        const { data: rows, error } = await withTimeout(
          this.supabase.from(tableName).insert(data).select('id'),
          TIMEOUT_PRESETS.standard,
          `${tableName} insert`
        );
        if (isPrimaryKeyDuplicateError(error, tableName, mutation.rowId)) {
          // Row already exists — retry hit a duplicate-key on a client-generated UUID.
          // The INSERT succeeded on a prior attempt; treat this as success.
          // INVARIANT: all offline-INSERT entities use client-generated UUIDs (verified Plan 006).
          this.logger.log(
            `[MutationManager] 23505 on INSERT ${tableName}/${mutation.rowId} — prior attempt committed, treating as success`
          );
          return {};
        }
        if (error) throw error;
        if (!rows || rows.length === 0) {
          throw new Error(
            `RLS policy blocked INSERT on ${tableName} for row ${mutation.rowId}. ` +
              `Check that the authenticated user has the required role.`
          );
        }
        return {};
      }

      case 'UPDATE': {
        // RPC-routed UPDATE: apply through a SECURITY DEFINER function instead of
        // a direct table UPDATE. Used when the caller's role is denied by the
        // table's UPDATE RLS policy but admitted by the function's own per-row
        // authorization (e.g. at-show ringside writes by an assigned judge). The
        // function returns the authoritative post-trigger version.
        if (mutation.rpc) {
          const { data: returned, error } = await withTimeout(
            this.supabase.rpc(
              mutation.rpc.name,
              mutation.rpc.args ?? {
                p_entry_id: data.id as string,
                p_fields: mutation.rpc.fields ?? {},
                p_expected_version: mutation.serverVersion ?? null,
              }
            ),
            TIMEOUT_PRESETS.standard,
            `${tableName} rpc ${mutation.rpc.name}`
          );
          if (error) {
            // A version-conflict raise (`40001`) would otherwise dead-letter,
            // leaving the local OCC token stale so the app regenerates the same
            // conflicting write forever (CPU storm). The RPC surfaces the current
            // server version in the error DETAIL (error.details) — read it from
            // there rather than a direct entries re-read, which the ringside
            // caller's role (assigned judge / steward / passcode) may be denied.
            // Re-throw as an OccRejectionError so the conflict handler advances
            // the token and backs off.
            if (isVersionConflictError(error)) {
              const fresh = getConflictServerVersion(error);
              throw new OccRejectionError(
                tableName,
                mutation.rowId,
                mutation.serverVersion ?? fresh ?? 0,
                fresh
              );
            }
            throw error;
          }
          // The RPC returns the new integer version (or null if the function
          // signals a no-op). Surface it so the local row's OCC token stays fresh.
          const newServerVersion = typeof returned === 'number' ? returned : undefined;
          return { newServerVersion };
        }

        // Build the query: add OCC precondition when serverVersion is set so a
        // concurrent server write (trigger bumped version) causes 0-row rejection
        // rather than silently overwriting with last-write-wins.
        let updateQuery = this.supabase
          .from(tableName)
          .update(data)
          .eq('id', data.id as string);
        if (mutation.serverVersion !== undefined) {
          updateQuery = updateQuery.eq('version', mutation.serverVersion);
        }
        const { data: rows, error } = await withTimeout(
          updateQuery.select('id, version'),
          TIMEOUT_PRESETS.standard,
          `${tableName} update`
        );
        if (error) throw error;
        if (!rows || rows.length === 0) {
          let serverCheck: { version?: number } | null | undefined;
          let serverCheckError: unknown;
          if (mutation.serverVersion !== undefined) {
            // Disambiguate: OCC rejection (version advanced) vs RLS denial (version unchanged)
            // vs row deleted. One bounded re-check avoids silent permanent queue stall.
            const { data: check, error: checkError } = await withTimeout(
              this.supabase
                .from(tableName)
                .select('version')
                .eq('id', data.id as string)
                .maybeSingle(),
              TIMEOUT_PRESETS.standard,
              `${tableName} occ-check`
            );
            serverCheck = check as { version?: number } | null | undefined;
            serverCheckError = checkError;
          }
          throw classifyEmptyUpdateResult({
            tableName,
            rowId: mutation.rowId,
            serverVersion: mutation.serverVersion,
            serverCheck,
            serverCheckError,
          });
        }
        const newServerVersion = getReturnedServerVersion(rows as Array<{ version?: number }>);
        return { newServerVersion };
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
        return {};
      }

      default:
        throw new Error(`Unknown operation: ${operation}`);
    }
  }

  private async markReplicatedRowSynced(
    db: Awaited<ReturnType<typeof databaseManager.getDatabase>>,
    mutation: PendingMutation,
    newServerVersion?: number
  ): Promise<void> {
    if (mutation.operation === 'DELETE') return;

    const key = [mutation.tableName, String(mutation.rowId)];
    const existingRow = (await db.get(REPLICATION_STORES.REPLICATED_TABLES, key)) as
      ReplicatedRow<unknown> | undefined;

    if (!existingRow?.isDirty) return;

    await db.put(REPLICATION_STORES.REPLICATED_TABLES, {
      ...existingRow,
      isDirty: false,
      syncStatus: 'synced',
      lastSyncedAt: Date.now(),
      // Refresh OCC precondition so subsequent queued mutations use the post-write
      // version (trigger incremented it on the server). Without this, a second
      // offline edit to the same row would carry a stale version and spuriously reject.
      ...(newServerVersion !== undefined && { serverVersion: newServerVersion }),
    });
  }

  private remapDogIdReferences<T extends Record<string, unknown>>(
    data: T,
    oldDogId: string,
    newDogId: string,
    options: { replacePrimaryId?: boolean } = {}
  ): { data: T; changed: boolean } {
    let changed = false;
    const next: Record<string, unknown> = { ...data };

    if (options.replacePrimaryId && next.id === oldDogId) {
      next.id = newDogId;
      changed = true;
    }

    for (const field of ['dog_id', 'dogId']) {
      if (next[field] === oldDogId) {
        next[field] = newDogId;
        changed = true;
      }
    }

    return { data: next as T, changed };
  }

  private async remapUploadedRpcInsertRowId(
    db: Awaited<ReturnType<typeof databaseManager.getDatabase>>,
    mutation: PendingMutation,
    serverRowId: string
  ): Promise<PendingMutation> {
    const oldRowId = String(mutation.rowId);
    const newRowId = String(serverRowId);
    if (oldRowId === newRowId) return mutation;

    if (mutation.tableName !== 'dogs') {
      throw new Error(
        `${mutation.rpc?.name ?? 'RPC'} returned row ${newRowId} for ${mutation.tableName}/${oldRowId}`
      );
    }

    const replicatedRows = (await db.getAll(
      REPLICATION_STORES.REPLICATED_TABLES
    )) as ReplicatedRow<Record<string, unknown>>[];
    const existingCanonicalDog = (await db.get(REPLICATION_STORES.REPLICATED_TABLES, [
      'dogs',
      newRowId,
    ])) as ReplicatedRow<Record<string, unknown>> | undefined;

    for (const row of replicatedRows) {
      if (row.tableName === 'dogs' && row.id === oldRowId) {
        if (!existingCanonicalDog) {
          const remapped = this.remapDogIdReferences(row.data, oldRowId, newRowId, {
            replacePrimaryId: true,
          });
          await db.put(REPLICATION_STORES.REPLICATED_TABLES, {
            ...row,
            id: newRowId,
            data: remapped.data,
          });
        }
        await db.delete(REPLICATION_STORES.REPLICATED_TABLES, [row.tableName, oldRowId]);
        continue;
      }

      const remapped = this.remapDogIdReferences(row.data, oldRowId, newRowId);
      if (remapped.changed) {
        await db.put(REPLICATION_STORES.REPLICATED_TABLES, {
          ...row,
          data: remapped.data,
        });
      }
    }

    const pendingMutations = (await db.getAll(
      REPLICATION_STORES.PENDING_MUTATIONS
    )) as PendingMutation[];
    for (const pendingMutation of pendingMutations) {
      if (pendingMutation.id === mutation.id) continue;
      const remapped = this.remapDogIdReferences(pendingMutation.data, oldRowId, newRowId);
      if (remapped.changed) {
        await db.put(REPLICATION_STORES.PENDING_MUTATIONS, {
          ...pendingMutation,
          data: remapped.data,
        });
      }
    }

    this.logger.log(
      `[MutationManager] Remapped offline dog ${oldRowId} to existing server dog ${newRowId}`
    );

    const remappedMutationData = this.remapDogIdReferences(mutation.data, oldRowId, newRowId, {
      replacePrimaryId: true,
    });
    return {
      ...mutation,
      rowId: newRowId,
      data: remappedMutationData.data,
    };
  }

  /**
   * Advance a replicated row's OCC token to the authoritative server version
   * after a conflict, WITHOUT clearing its dirty/conflict state. New mutations
   * stamp `serverVersion` from this row (see ReplicatedTable.queueMutation), so
   * advancing it stops the app from regenerating writes that carry the stale
   * version — the engine behind the ringside conflict storm. The unsynced
   * optimistic edit is preserved for the user to reconcile.
   */
  private async advanceReplicatedRowServerVersion(
    db: Awaited<ReturnType<typeof databaseManager.getDatabase>>,
    tableName: string,
    rowId: string,
    serverVersion: number
  ): Promise<void> {
    const key = [tableName, String(rowId)];
    const existingRow = (await db.get(REPLICATION_STORES.REPLICATED_TABLES, key)) as
      ReplicatedRow<unknown> | undefined;
    if (!existingRow) return;
    if (existingRow.serverVersion === serverVersion) return;

    await db.put(REPLICATION_STORES.REPLICATED_TABLES, {
      ...existingRow,
      serverVersion,
    });
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
    const pending = await db.getAll(REPLICATION_STORES.PENDING_MUTATIONS);

    writeMutationBackup(localStorage, pending as PendingMutation[]);
    if (pending.length > 0) {
      this.logger.log(`[MutationManager] Backed up ${pending.length} mutations to localStorage`);
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

      if (!backup || (parsed.mutations.length === 0 && parsed.malformedCount === 0)) {
        return; // No backup to restore
      }

      if (parsed.malformedCount > 0) {
        this.logger.warn(
          `[MutationManager] Discarded ${parsed.malformedCount} malformed mutation(s) from localStorage backup`
        );
      }

      if (parsed.mutations.length === 0) {
        return;
      }

      const db = await databaseManager.getDatabase('MutationManager');

      // Check if mutations already exist in IndexedDB
      const existing = await db.getAll(REPLICATION_STORES.PENDING_MUTATIONS);
      const existingIds = new Set(existing.map((m: PendingMutation) => m.id));

      let restoredCount = 0;

      for (const mutation of parsed.mutations) {
        // Only restore pending mutations that aren't already in IndexedDB
        if (!existingIds.has(mutation.id)) {
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

      // Failed mutations belong to the same session/show context — stale ones
      // from a previous login must not resurface for the next user.
      const failedTx = db.transaction(REPLICATION_STORES.FAILED_MUTATIONS, 'readwrite');
      await failedTx.store.clear();
      await failedTx.done;

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
    if (this.uploadDebounceTimer) {
      clearTimeout(this.uploadDebounceTimer);
      this.uploadDebounceTimer = null;
    }
    if (this.backoffRetryTimer) {
      clearTimeout(this.backoffRetryTimer);
      this.backoffRetryTimer = null;
      this.backoffRetryAt = null;
    }

    this.logger.log('[MutationManager] Destroyed');
  }
}
