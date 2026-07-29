import type { IDBPDatabase } from 'idb';
import { REPLICATION_STORES } from './core/DatabaseManager';
import type { Logger } from './dependencies';
import { OccRejectionError } from './mutation-occ';
import * as rowSync from './mutation-row-sync';
import { calculateBackoffDelay } from './mutation-utils';
import type { PendingMutation, SyncResult } from './types';

export interface OccRejectionContext {
  db: IDBPDatabase;
  logger: Logger;
  error: OccRejectionError;
  queuedMutation: PendingMutation;
  now: number;
  retryBackoffBase: number;
  maxOccAttempts: number;
  /** Upload results accumulator — a failure result is pushed for this mutation. */
  results: SyncResult[];
  /** Parked (dead-lettered) mutations accumulator, appended when the cap is hit. */
  failedMutations: PendingMutation[];
  blockedDependencyIds: Set<string>;
  failedDependencyIds: Set<string>;
}

/**
 * Handle an OCC (version-conflict) rejection for a single queued mutation.
 *
 * Extracted verbatim from MutationUploadRunner.runUploadPass to keep that file
 * within the source-size budget; behavior is unchanged. Mutates the passed
 * `results` / `failedMutations` / dependency sets (by reference), matching the
 * inline loop it replaced.
 *
 * @returns the mutation's `nextRetryAt` when it was re-queued with backoff (so
 *   the caller can advance its earliest-backoff self-schedule), or `null` when
 *   the mutation was parked or already gone (no follow-up pass to schedule).
 */
export async function handleOccRejection(ctx: OccRejectionContext): Promise<number | null> {
  const {
    db,
    logger,
    error,
    queuedMutation,
    now,
    retryBackoffBase,
    maxOccAttempts,
    results,
    failedMutations,
    blockedDependencyIds,
    failedDependencyIds,
  } = ctx;

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
  const nextRetryAt = now + calculateBackoffDelay(occRetries - 1, retryBackoffBase);
  // Re-persist the backoff ONLY if the mutation still exists. A past
  // upload (from this tab or, before the cross-tab lock, another) may
  // have already uploaded and deleted it; a blind put() would resurrect
  // a deleted mutation as a zombie that loops in OCC backoff forever
  // (audit M1). The cross-tab lock serializes uploads, so no other
  // uploader can delete it between this get and put.
  let occPersisted = false;
  const stillQueued = (await db.get(REPLICATION_STORES.PENDING_MUTATIONS, queuedMutation.id)) as
    PendingMutation | undefined;
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
    stillQueued !== undefined && stillQueued.rpc !== undefined && occRetries >= maxOccAttempts;
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
      ...(typeof freshServerVersion === 'number' ? { serverVersion: freshServerVersion } : {}),
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
    logger.error(
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
    return null;
  }
  if (stillQueued) {
    await db.put(REPLICATION_STORES.PENDING_MUTATIONS, {
      ...stillQueued,
      occRetries,
      nextRetryAt,
    });
    occPersisted = true;
  }

  logger.warn(
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
  return occPersisted ? nextRetryAt : null;
}
