import type { SupabaseClient } from '@supabase/supabase-js';
import { databaseManager, REPLICATION_STORES } from './core/DatabaseManager';
import type { Logger } from './dependencies';
import { executeMutation } from './mutation-execute';
import { OccRejectionError } from './mutation-occ';
import { handleOccRejection } from './mutation-occ-rejection';
import { sortMutationsByDependencies } from './mutation-ordering';
import { getMutationQueueCapacity, QUEUE_MAX_SIZE } from './mutation-queue-capacity';
import { classifyMutationFailure } from './mutation-retry';
import * as rowSync from './mutation-row-sync';
import * as uploadEvents from './mutation-upload-events';
import { markPerf, measurePerf } from './perf';
import type { PendingMutation, ReplicatedRow, SyncResult } from './types';
import type { MutationQueueStore } from './MutationQueueStore';

export class MutationUploadRunner {
  private uploadDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private backoffRetryTimer: ReturnType<typeof setTimeout> | null = null;
  private backoffRetryAt: number | null = null;
  private isUploading = false;
  private uploadRequestedWhileRunning = false;

  constructor(
    private readonly supabase: SupabaseClient,
    private readonly logger: Logger,
    private readonly maxRetries: number,
    private readonly retryBackoffBase: number,
    private readonly maxOccAttempts: number,
    private readonly queueStore: MutationQueueStore,
    private readonly writeBackup: () => Promise<void>
  ) {}

  /**
   * Schedule an upload attempt shortly after a mutation is queued.
   *
   * Debounced at 100ms so rapid mutations (e.g. batch inserts) are
   * coalesced into a single upload pass. Skips if offline.
   */
  scheduleUpload(uploadPendingMutations = () => this.uploadPendingMutations()): void {
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

      uploadPendingMutations().catch(err => {
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
      // A mutation may have been queued after the active pass captured its
      // pending snapshot. Remember this request so the new work is not stranded
      // when the overlapping attempt returns early.
      this.uploadRequestedWhileRunning = true;
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
        uploadEvents.dispatchQueueOverflow(this.logger, pending.length, QUEUE_MAX_SIZE);
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
      // Skip accounting: a pass that touches nothing while the queue is
      // non-empty must be loud (warn), because every individual skip below
      // logs at debug level — invisible with the app's default log filter,
      // which made a permanently-stalled queue indistinguishable from a
      // healthy empty one (MYK9-47 restored-queue investigation).
      const skipped = { dependency: 0, backoff: 0, conflict: 0, vanished: 0 };
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
          skipped.dependency++;
          blockedDependencyIds.add(mutation.id);
          this.logger.log(
            `[MutationManager] Skipping ${mutation.id} — waiting on dependencies ${unresolvedDependencies.join(', ')}`
          );
          continue;
        }

        if (mutation.nextRetryAt && mutation.nextRetryAt > now) {
          skipped.backoff++;
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
          skipped.vanished++;
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
          skipped.conflict++;
          blockedDependencyIds.add(queuedMutation.id);
          this.logger.log(
            `[MutationManager] Skipping ${queuedMutation.id} — ${queuedMutation.tableName}/${queuedMutation.rowId} has unresolved conflict`
          );
          continue;
        }

        try {
          const { newServerVersion, remappedRowId } = await executeMutation(
            this.supabase,
            this.logger,
            queuedMutation
          );
          const uploadedMutation = remappedRowId
            ? await rowSync.remapUploadedRpcInsertRowId(
                db,
                this.logger,
                queuedMutation,
                remappedRowId
              )
            : queuedMutation;
          await rowSync.markReplicatedRowSynced(db, uploadedMutation, newServerVersion);
          if (newServerVersion !== undefined) {
            const updated = await this.queueStore.updateMutationServerVersions(
              uploadedMutation.tableName,
              uploadedMutation.rowId,
              newServerVersion
            );
            if (updated > 0) {
              await this.writeBackup();
            }
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
            // OCC conflict handling (token advance, backoff re-queue, lifetime-cap
            // parking) lives in a sibling module to keep this file within the
            // source-size budget; behavior is unchanged. It mutates results /
            // failedMutations / the dependency sets by reference and returns the
            // re-queued mutation's nextRetryAt (or null when parked/gone) so we
            // can advance the earliest-backoff self-schedule.
            const backoffCandidate = await handleOccRejection({
              db,
              logger: this.logger,
              error,
              queuedMutation,
              now,
              retryBackoffBase: this.retryBackoffBase,
              maxOccAttempts: this.maxOccAttempts,
              results,
              failedMutations,
              blockedDependencyIds,
              failedDependencyIds,
            });
            if (
              backoffCandidate !== null &&
              (earliestBackoff === null || backoffCandidate < earliestBackoff)
            ) {
              earliestBackoff = backoffCandidate;
            }
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

      if (results.length === 0 && pending.length > 0) {
        this.logger.warn(
          `[MutationManager] Upload pass skipped all ${pending.length} pending mutation(s) — ` +
            `dependency: ${skipped.dependency}, backoff: ${skipped.backoff}, ` +
            `conflict: ${skipped.conflict}, vanished mid-pass: ${skipped.vanished}. ` +
            `Queue is stalled until the blocking condition clears.`
        );
      }

      uploadEvents.notifyUserOfSyncFailure(this.logger, failedMutations);

      // Persist the post-upload queue immediately. A debounced backup here can
      // leave localStorage holding already-uploaded mutations if the page
      // navigates before the timer fires, causing duplicate replays on restore.
      try {
        await this.writeBackup();
      } catch (err) {
        this.logger.warn('[MutationManager] Post-upload backup failed:', err);
      }

      // Self-schedule a retry pass so backoff-skipped mutations don't sit idle
      // when no other activity triggers the upload debounce timer.
      if (earliestBackoff !== null) {
        this.scheduleBackoffRetry(earliestBackoff);
      }

      uploadEvents.dispatchUploadComplete(this.logger, results, pending.length, startTime);

      return results;
    } catch (error) {
      // Rethrow, don't return []: an empty array is the healthy "queue is
      // empty" signal, and returning it here made a completely broken pass
      // (e.g. IndexedDB open failure) indistinguishable from success — the
      // queue stalled forever with diagnostics reporting all-clear.
      this.logger.error('[MutationManager] Failed to upload mutations:', error);
      throw error;
    } finally {
      this.isUploading = false;
      if (this.uploadRequestedWhileRunning) {
        this.uploadRequestedWhileRunning = false;
        this.scheduleUpload();
      }
      measurePerf('replication:flush', 'replication:flush:start', {
        durationMs: Date.now() - startTime,
      });
    }
  }

  destroy(): void {
    if (this.uploadDebounceTimer) clearTimeout(this.uploadDebounceTimer);
    if (this.backoffRetryTimer) clearTimeout(this.backoffRetryTimer);
    this.uploadDebounceTimer = this.backoffRetryTimer = null;
    this.backoffRetryAt = null;
    this.uploadRequestedWhileRunning = false;
  }
}
