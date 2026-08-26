import { databaseManager, REPLICATION_STORES } from './core/DatabaseManager';
import type { Logger } from './dependencies';
import { executeMutation } from './mutation-execute';
import { ContainmentError, OccRejectionError } from './mutation-occ';
import { handleOccRejection } from './mutation-occ-rejection';
import { sortMutationsByDependencies } from './mutation-ordering';
import * as mutationOwner from './mutation-owner';
import { getMutationQueueCapacity, QUEUE_MAX_SIZE } from './mutation-queue-capacity';
import { classifyMutationFailure } from './mutation-retry';
import * as rowSync from './mutation-row-sync';
import * as uploadEvents from './mutation-upload-events';
import { markPerf, measurePerf } from './perf';
import type { PendingMutation, ReplicatedRow, SyncResult, UploadedMutation } from './types';
import type { MutationQueueStore } from './MutationQueueStore';
import type { MutationUploadAuthContext } from './mutation-manager-options';

/**
 * RPCs the MYK9-115 breaker actually sheds.
 *
 * INTENT: containment is a RINGSIDE SCORING brownout. Gating on "has an rpc"
 * would also hold `create_dog_with_registrations` and every other unrelated
 * RPC in the outbox, turning a scoring pause into a general write outage —
 * which is the blast radius the server-side gate was carefully designed to
 * avoid. Add a name here only when the server can raise RS429 for it.
 */
const CONTAINABLE_RPC_NAMES = new Set(['ringside_update_entry']);

function isContainableRpc(mutation: Pick<PendingMutation, 'rpc'>): boolean {
  return mutation.rpc !== undefined && CONTAINABLE_RPC_NAMES.has(mutation.rpc.name);
}

export class MutationUploadRunner {
  private uploadDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private backoffRetryTimer: ReturnType<typeof setTimeout> | null = null;
  private backoffRetryAt: number | null = null;
  private isUploading = false;
  private uploadRequestedWhileRunning = false;
  /**
   * Epoch ms until which RPC uploads are paused because the server raised
   * RS429 (MYK9-115 admission control), or null when not contained.
   *
   * INTENT: this gates ONLY RPC mutations. Direct-UPDATE writes to other tables
   * are not what the breaker is shedding, and pausing the whole outbox would
   * turn a ringside-scoring brownout into a platform-wide sync outage.
   */
  private containmentUntil: number | null = null;

  constructor(
    private readonly logger: Logger,
    private readonly maxRetries: number,
    private readonly retryBackoffBase: number,
    private readonly maxOccAttempts: number,
    private readonly queueStore: MutationQueueStore,
    private readonly writeBackup: () => Promise<void>,
    private readonly getCurrentUploadContext: () => Promise<MutationUploadAuthContext>
  ) {}

  scheduleUpload(uploadPendingMutations = () => this.uploadPendingMutations()): void {
    if (this.uploadDebounceTimer) {
      clearTimeout(this.uploadDebounceTimer);
    }

    this.uploadDebounceTimer = setTimeout(() => {
      this.uploadDebounceTimer = null;

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

  // eslint-disable-next-line complexity -- branch order is part of queue correctness
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
      const passAuthUserId = (await this.getCurrentUploadContext()).authUserId;
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
      const uploadedMutations: UploadedMutation[] = [];
      const failedMutations: PendingMutation[] = [];
      // Warn on nonempty stalled queues: individual skips log below the app's
      // default filter, concealing a stuck queue (MYK9-47).
      const skipped = mutationOwner.createMutationSkipCounts();
      const now = Date.now();
      // Independent mutations shouldn't stall on one mutation's backoff; track the
      // earliest skipped nextRetryAt so we can self-schedule a follow-up pass.
      let earliestBackoff: number | null = null;

      for (const mutation of sortedMutations) {
        if (mutationOwner.holdForPassOwner(mutation, passAuthUserId, blockedDependencyIds, skipped))
          continue;

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

        // MYK9-115: while contained, hold RPC mutations back rather than
        // sending writes the server has already said it will reject. The
        // earliest-backoff self-schedule below wakes the pass when the window
        // expires, so nothing is stranded.
        if (isContainableRpc(mutation) && this.containmentUntil !== null) {
          if (this.containmentUntil > now) {
            skipped.backoff++;
            blockedDependencyIds.add(mutation.id);
            if (earliestBackoff === null || this.containmentUntil < earliestBackoff) {
              earliestBackoff = this.containmentUntil;
            }
            continue;
          }
          // Window elapsed — clear it and let this pass probe with a real write.
          // The head-of-queue mutation IS the probe: if the breaker is still
          // contained the server raises RS429 again and re-arms the pause.
          this.containmentUntil = null;
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

        const executionContext = await mutationOwner.holdAfterOwnerChange(
          queuedMutation,
          this.getCurrentUploadContext,
          blockedDependencyIds,
          skipped
        );
        if (executionContext === null) continue;

        try {
          const { newServerVersion, remappedRowId } = await executeMutation(
            executionContext.supabaseClient,
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
            await this.queueStore.updateMutationServerVersions(
              uploadedMutation.tableName,
              uploadedMutation.rowId,
              newServerVersion,
              executionContext.authUserId
            );
          }

          // Remove the completed row before the pass-level backup. A concurrent
          // startup restore can read localStorage while this upload is in flight;
          // backing up the still-pending row first would let that restore put a
          // successfully uploaded mutation back after this delete (a zombie
          // queue item that replays or remains stuck on mobile reloads).
          await db.delete(REPLICATION_STORES.PENDING_MUTATIONS, uploadedMutation.id);
          uploadedMutationIds.add(uploadedMutation.id);

          // Back up each successful delete/version bump so a crash before the
          // pass-level backup cannot replay an already-uploaded mutation.
          try {
            await this.writeBackup();
          } catch (err) {
            this.logger.warn('[MutationManager] Per-mutation backup failed:', err);
          }

          uploadedMutations.push(uploadEvents.toUploadedMutation(uploadedMutation));
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
          // MYK9-115. Checked before OccRejectionError: containment is a
          // back-off instruction, not a lost race. The score is NOT failed and
          // NOT retried this pass — it stays queued with its OCC token advanced
          // to the version the server reported, so when the pause lifts the
          // retry carries a fresh token instead of re-conflicting immediately.
          if (error instanceof ContainmentError) {
            const until = now + error.retryAfterMs;
            if (this.containmentUntil === null || until > this.containmentUntil) {
              this.containmentUntil = until;
              uploadEvents.dispatchContainment(this.logger, until);
            }
            if (error.currentServerVersion !== undefined) {
              await rowSync.advanceReplicatedRowServerVersion(
                db,
                queuedMutation.tableName,
                queuedMutation.rowId,
                error.currentServerVersion
              );
              // Advancing the replicated ROW is not enough: executeMutation
              // reads `p_expected_version` from the QUEUED mutation, not from
              // the row. Without this the pause expires and the runner re-sends
              // the same stale token forever. The OCC rejection path stamps the
              // fresh version for exactly this reason (see mutation-occ-rejection).
              const rebased = await db.get(REPLICATION_STORES.PENDING_MUTATIONS, queuedMutation.id);
              if (rebased) {
                await db.put(REPLICATION_STORES.PENDING_MUTATIONS, {
                  ...(rebased as PendingMutation),
                  serverVersion: error.currentServerVersion,
                });
              }
            }
            skipped.backoff++;
            blockedDependencyIds.add(queuedMutation.id);
            if (earliestBackoff === null || until < earliestBackoff) {
              earliestBackoff = until;
            }
            continue;
          }
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

      mutationOwner.logOwnerIsolation(this.logger, skipped);
      mutationOwner.warnIfUploadStalled(this.logger, skipped, pending.length, results.length);

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

      uploadEvents.dispatchUploadComplete(
        this.logger,
        results,
        pending.length,
        startTime,
        uploadedMutations
      );

      return results;
    } catch (error) {
      // Rethrow: [] means a healthy empty queue, not a broken upload pass.
      // Hiding IDB failures here stranded writes while reporting all-clear.
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
