import type { SupabaseClient } from '@supabase/supabase-js';
import { databaseManager, REPLICATION_STORES } from './core/DatabaseManager';
import type { Logger } from './dependencies';
import { executeMutation } from './mutation-execute';
import { OccRejectionError } from './mutation-occ';
import { sortMutationsByDependencies } from './mutation-ordering';
import { getMutationQueueCapacity, QUEUE_MAX_SIZE } from './mutation-queue-capacity';
import { classifyMutationFailure } from './mutation-retry';
import * as rowSync from './mutation-row-sync';
import * as uploadEvents from './mutation-upload-events';
import { calculateBackoffDelay } from './mutation-utils';
import { markPerf, measurePerf } from './perf';
import type { PendingMutation, ReplicatedRow, SyncResult } from './types';
import type { MutationQueueStore } from './MutationQueueStore';

export class MutationUploadRunner {
  private uploadDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private backoffRetryTimer: ReturnType<typeof setTimeout> | null = null;
  private backoffRetryAt: number | null = null;
  private isUploading = false;

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
              await rowSync.advanceReplicatedRowServerVersion(
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
  }
}
