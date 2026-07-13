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
import { calculateBackoffDelay } from './mutation-utils';
import { classifyMutationFailure } from './mutation-retry';
import { OccRejectionError } from './mutation-occ';
import { sortMutationsByDependencies } from './mutation-ordering';
import { getMutationQueueCapacity, QUEUE_MAX_SIZE } from './mutation-queue-capacity';
import {
  MUTATION_BACKUP_STORAGE_KEY,
  parseMutationBackup,
  writeMutationBackup,
} from './mutation-backup';
import { executeMutation, type MutationExecutionResult } from './mutation-execute';
import { MutationQueueStore } from './MutationQueueStore';
import {
  advanceReplicatedRowServerVersion,
  markReplicatedRowSynced,
  remapUploadedRpcInsertRowId,
} from './mutation-row-sync';
import { type PendingMutation, type ReplicatedRow, type SyncResult } from './types';

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
  private supabase: SupabaseClient;
  private maxRetries: number;
  private retryBackoffBase: number;
  private maxOccAttempts: number;
  private logger: Logger;
  private queueStore: MutationQueueStore;

  // Auto-upload: flush mutations to server shortly after queuing
  private uploadDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private backoffRetryTimer: ReturnType<typeof setTimeout> | null = null;
  private backoffRetryAt: number | null = null;
  private isUploading: boolean = false;

  constructor(supabaseClient: SupabaseClient, options: MutationManagerOptions = {}) {
    this.supabase = supabaseClient;
    this.maxRetries = options.maxRetries ?? 3;
    this.retryBackoffBase = options.retryBackoffBase ?? 1000;
    this.maxOccAttempts = options.maxOccAttempts ?? 50;
    this.logger = options.logger ?? noopLogger;
    this.queueStore = new MutationQueueStore(this.logger);
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
    const changed = await this.queueStore.reconcilePendingMutationsForRow(
      tableName,
      rowId,
      newServerVersion,
      rebuiltData
    );
    if (changed > 0) {
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
   * Upload pending mutations (offline changes) to server.
   *
   * Serialized ACROSS TABS via the Web Locks API: two tabs uploading the same
   * queue can double-apply a mutation or, worse, re-insert one that the other
   * tab already uploaded and deleted (a zombie stuck in OCC backoff — audit M1).
   * The per-tab `isUploading` guard still prevents re-entrancy within a tab, and
   * we fall back to it alone when Web Locks is unavailable (older engines, tests).
   */
  async uploadPendingMutations(): Promise<SyncResult[]> {
    const locks =
      typeof navigator !== 'undefined'
        ? (
            navigator as unknown as {
              locks?: {
                request?: (name: string, cb: () => Promise<SyncResult[]>) => Promise<SyncResult[]>;
              };
            }
          ).locks
        : undefined;
    if (locks && typeof locks.request === 'function') {
      const result = await locks.request('replication-upload', () => this.runUploadPass());
      return result ?? [];
    }
    return this.runUploadPass();
  }

  /**
   * Single upload pass (see uploadPendingMutations for the cross-tab wrapper).
   * Processes mutations in topological order to respect causal dependencies.
   */
  private async runUploadPass(): Promise<SyncResult[]> {
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

        const queuedMutation = (await db.get(REPLICATION_STORES.PENDING_MUTATIONS, mutation.id)) as
          PendingMutation | undefined;
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

          this.logger.log(
            `[MutationManager] Mutation ${uploadedMutation.id} uploaded successfully`
          );
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
            // separate counter from `retries` so an ordinary conflict is not
            // dead-lettered after 3 attempts — it slows down and keeps waiting
            // for reconciliation. It is NOT unlimited: occRetries persists on
            // the mutation, and at maxOccAttempts (default 50, across reloads)
            // the mutation is PARKED into the failed-mutations store — visible
            // and user-recoverable via retry/discard, never silently dropped,
            // never replayed forever (2026-07-11 ringside conflict storm).
            const occRetries = (queuedMutation.occRetries ?? 0) + 1;
            const nextRetryAt = now + calculateBackoffDelay(occRetries - 1, this.retryBackoffBase);
            // Re-persist the backoff ONLY if the mutation still exists. A past
            // upload (from this tab or, before the cross-tab lock, another) may
            // have already uploaded and deleted it; a blind put() would resurrect
            // a deleted mutation as a zombie that loops in OCC backoff forever
            // (audit M1). The cross-tab lock serializes uploads, so no other
            // uploader can delete it between this get and put.
            let occPersisted = false;
            const stillQueued = (await db.get(
              REPLICATION_STORES.PENDING_MUTATIONS,
              queuedMutation.id
            )) as PendingMutation | undefined;
            // Lifetime cap: park ONLY RPC/delta mutations (the storm vector,
            // ringside_update_entry). Their payload is a targeted field set, so
            // the parked mutation can rebase onto the fresh authoritative token
            // (already applied to the row on the first rejection) and a user
            // Retry can actually succeed — last-write on exactly those fields.
            //
            // Direct full-row UPDATEs are DELIBERATELY not capped/parked: they
            // are owned end-to-end by the existing full-row conflict-resolution
            // subsystem (conflict surfacing, reconcileDirtyRow / same-field
            // "Keep mine" / "Take theirs" / rebuildUpdatePayload), which operates
            // exclusively on PENDING_MUTATIONS. Moving them to FAILED_MUTATIONS
            // would sever them from that resolver, and advancing their whole-row
            // token would clobber another client's change. Full-row OCC conflicts
            // have never stormed (this incident and 2026-06-25 were both RPC), so
            // they keep their existing behavior unchanged — see the
            // ringside-occ-conflict-circuit-breaker design "Non-Goals" for the
            // deferred unification of full-row parking + the resolver.
            const occCapReached =
              stillQueued !== undefined &&
              stillQueued.rpc !== undefined &&
              occRetries >= this.maxOccAttempts;
            if (occCapReached) {
              // Lifetime cap reached: park. The payload survives in the
              // failed-mutations store and surfaces through the existing
              // sync-failed toast (Retry resets the counters; Discard is
              // explicit). Parking, not deleting — durability contract.
              const parked: PendingMutation = {
                ...stillQueued,
                occRetries,
                status: 'failed',
                // Stamp the AUTHORITATIVE server version so a user Retry
                // re-uploads with a fresh OCC token instead of the stale one it
                // kept while awaiting reconciliation (Codex review, P1). Safe:
                // this branch is RPC/delta only; the row token was already
                // advanced on the first rejection.
                ...(typeof freshServerVersion === 'number'
                  ? { serverVersion: freshServerVersion }
                  : {}),
                error:
                  `Version conflict persisted through ${occRetries} attempts ` +
                  `(${error.tableName}/${error.rowId}); parked for review.`,
                failedAt: now,
              };
              delete parked.nextRetryAt;
              // Move stores in ONE transaction so an interrupted write can never
              // leave the mutation in BOTH pending (auto-uploads) and failed
              // (Retry/Discard toast) — which would defeat the circuit breaker
              // and surface conflicting user actions (Codex review, P2).
              const parkTx = db.transaction(
                [REPLICATION_STORES.FAILED_MUTATIONS, REPLICATION_STORES.PENDING_MUTATIONS],
                'readwrite'
              );
              await Promise.all([
                parkTx.objectStore(REPLICATION_STORES.FAILED_MUTATIONS).put(parked),
                parkTx.objectStore(REPLICATION_STORES.PENDING_MUTATIONS).delete(queuedMutation.id),
                parkTx.done,
              ]);
              failedMutations.push(parked);
              blockedDependencyIds.add(queuedMutation.id);
              failedDependencyIds.add(queuedMutation.id);
              this.logger.error(
                `[MutationManager] OCC conflict for ${error.tableName}/${error.rowId} ` +
                  `exhausted ${occRetries} lifetime attempts; mutation ${queuedMutation.id} ` +
                  `parked for user review.`
              );
              results.push({
                success: false,
                tableName: queuedMutation.tableName,
                operation: queuedMutation.operation,
                rowsAffected: 0,
                duration: 0,
                error: error.message,
              });
              continue;
            }
            if (stillQueued) {
              await db.put(REPLICATION_STORES.PENDING_MUTATIONS, {
                ...stillQueued,
                occRetries,
                nextRetryAt,
              });
              occPersisted = true;
            }
            if (occPersisted && (earliestBackoff === null || nextRetryAt < earliestBackoff)) {
              earliestBackoff = nextRetryAt;
            }

            this.logger.warn(
              `[MutationManager] OCC rejection for ${error.tableName}/${error.rowId} ` +
                `(server version ${freshServerVersion}, attempt ${occRetries}). ` +
                (occPersisted
                  ? `Row token advanced; mutation stays dirty, next retry after ` +
                    `${new Date(nextRetryAt).toISOString()}.`
                  : `Mutation was already uploaded by another tab; not re-queued.`)
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

  private async executeMutation(mutation: PendingMutation): Promise<MutationExecutionResult> {
    return executeMutation(this.supabase, this.logger, mutation);
  }

  private async markReplicatedRowSynced(
    db: Awaited<ReturnType<typeof databaseManager.getDatabase>>,
    mutation: PendingMutation,
    newServerVersion?: number
  ): Promise<void> {
    return markReplicatedRowSynced(db, mutation, newServerVersion);
  }

  private async remapUploadedRpcInsertRowId(
    db: Awaited<ReturnType<typeof databaseManager.getDatabase>>,
    mutation: PendingMutation,
    serverRowId: string
  ): Promise<PendingMutation> {
    return remapUploadedRpcInsertRowId(db, this.logger, mutation, serverRowId);
  }

  private async advanceReplicatedRowServerVersion(
    db: Awaited<ReturnType<typeof databaseManager.getDatabase>>,
    tableName: string,
    rowId: string,
    serverVersion: number
  ): Promise<void> {
    return advanceReplicatedRowServerVersion(db, tableName, rowId, serverVersion);
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
