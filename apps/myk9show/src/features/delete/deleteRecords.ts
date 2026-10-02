/**
 * The one client delete service (CRUD standard Phase 2). For every item:
 *   1. soft-delete it on the server (the object's own RPC, `deleteServer.ts`);
 *   2. purge it from this device (`deleteLocalState.ts`, never throws);
 * and, for Undo, restore it on the server and re-sync it on this device (the same declared stores).
 *
 * There is no other way to delete a club, show, trial, class, entry, dog or
 * person in the app: every surface opens `DeleteObjectDialog`, which calls this.
 */
import type { QueryClient } from '@tanstack/react-query';
import {
  classifyDeleteError,
  isAlreadyGoneError,
  deleteErrorMessage,
  isRetryableRestoreError,
  restoreErrorMessage,
} from './deleteErrors';
import { QUERY_ROOTS_BY_KIND } from './deleteLocalStores';
import { reconcileLocalDeletion, reconcileLocalRestore } from './deleteLocalState';
import { restoreOnServer, softDeleteOnServer, type ServerDeleteOptions } from './deleteServer';
import { fetchDeletePreview } from './deletePreview';
import { deviceHasUnsavedWork, stillSavingError } from './deleteUnsyncedWork';
import { UNDO_WINDOW_MS, type DeleteObjectKind, type DeleteTarget } from './deleteTypes';

export interface DeleteFailure {
  target: DeleteTarget;
  message: string;
  /** Restore only: true when pressing Undo again could succeed. */
  retryable?: boolean;
}

export interface DeleteRecordsResult {
  /** Deleted by this call: these are what Undo restores. */
  deleted: DeleteTarget[];
  /** Already deleted elsewhere: gone from this device too, but not ours to undo. */
  alreadyGone: DeleteTarget[];
  failed: DeleteFailure[];
  /** When the deletes landed (client clock), for the Undo window. */
  deletedAt: number;
}

/** Server writes in flight at once for a bulk delete. */
const CONCURRENCY = 3;

async function forEachLimited<T>(
  items: readonly T[],
  run: (item: T) => Promise<void>
): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const item = items[next++] as T;
      await run(item);
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, worker));
}

export async function deleteRecords(
  kind: DeleteObjectKind,
  targets: readonly DeleteTarget[],
  options: ServerDeleteOptions = {}
): Promise<DeleteRecordsResult> {
  const deleted: DeleteTarget[] = [];
  const alreadyGone: DeleteTarget[] = [];
  const failed: DeleteFailure[] = [];

  // Defensive final check, before the server is called at all: unsaved work on
  // this device may not be on the server yet, and a cascade would purge it. An
  // unreadable queue is refused too (never a pass).
  let refusal: unknown;
  try {
    if ((await deviceHasUnsavedWork()).total > 0) refusal = stillSavingError();
  } catch (error) {
    refusal = error;
  }
  if (refusal !== undefined) {
    return {
      deleted,
      alreadyGone,
      failed: targets.map(target => ({ target, message: deleteErrorMessage(kind, refusal) })),
      deletedAt: Date.now(),
    };
  }

  await forEachLimited(targets, async target => {
    try {
      const outcome = await softDeleteOnServer(kind, target.id, options);
      (outcome === 'already-deleted' ? alreadyGone : deleted).push(target);
    } catch (error) {
      if (classifyDeleteError(error) === 'already-deleted') {
        alreadyGone.push(target);
      } else {
        failed.push({ target, message: deleteErrorMessage(kind, error) });
        return;
      }
    }
    await reconcileLocalDeletion(kind, target);
  });

  // Keep the caller's order, not completion order.
  const order = new Map(targets.map((target, index) => [target.id, index]));
  const byOrder = (a: DeleteTarget, b: DeleteTarget) =>
    (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0);
  return {
    deleted: deleted.sort(byOrder),
    alreadyGone: alreadyGone.sort(byOrder),
    failed: failed.sort((a, b) => byOrder(a.target, b.target)),
    deletedAt: Date.now(),
  };
}

export interface ReconcileGoneResult {
  /** Gone on the server and now gone from this device. */
  reconciled: DeleteTarget[];
  /** Not purged: still saving, or the queue could not be read. */
  failed: DeleteFailure[];
}

/**
 * Items the preview found already gone (P0002), reconciled on this device only
 * when the user confirms. A target with unsynced local work is NOT purged: the
 * "gone" answer may only mean it has not uploaded yet (same rule as a delete).
 */
export async function reconcileGoneTargets(
  kind: DeleteObjectKind,
  targets: readonly DeleteTarget[]
): Promise<ReconcileGoneResult> {
  const reconciled: DeleteTarget[] = [];
  const failed: DeleteFailure[] = [];
  if (targets.length === 0) return { reconciled, failed };
  try {
    if ((await deviceHasUnsavedWork()).total > 0) throw stillSavingError();
  } catch (error) {
    return {
      reconciled,
      failed: targets.map(target => ({ target, message: deleteErrorMessage(kind, error) })),
    };
  }
  for (const target of targets) {
    await reconcileLocalDeletion(kind, target);
    reconciled.push(target);
  }
  return { reconciled, failed };
}

/** Undo is offered to the deleter only inside the server's 10-minute window. */
export function canStillUndo(deletedAt: number, now: number = Date.now()): boolean {
  return now - deletedAt < UNDO_WINDOW_MS;
}

export interface RestoreRecordsResult {
  restored: DeleteTarget[];
  /** Restored, but not whole: the message to show instead of a plain "restored". */
  warnings: { target: DeleteTarget; message: string }[];
  failed: DeleteFailure[];
}

async function isLiveOnServer(kind: DeleteObjectKind, id: string): Promise<boolean> {
  try {
    await fetchDeletePreview(kind, id);
    return true;
  } catch {
    return false;
  }
}

export async function restoreRecords(
  kind: DeleteObjectKind,
  targets: readonly DeleteTarget[]
): Promise<RestoreRecordsResult> {
  const restored: DeleteTarget[] = [];
  const warnings: RestoreRecordsResult['warnings'] = [];
  const failed: DeleteFailure[] = [];
  await forEachLimited(targets, async target => {
    try {
      const warning = await restoreOnServer(kind, target.id);
      if (warning) warnings.push({ target, message: warning });
    } catch (error) {
      // P0002 on a retry may mean the FIRST restore committed and only its
      // response was lost. The server's own read says which: a record it can
      // preview is live, so Undo did its job; anything else is a real failure.
      if (!(isAlreadyGoneError(error) && (await isLiveOnServer(kind, target.id)))) {
        failed.push({
          target,
          message: restoreErrorMessage(kind, error),
          retryable: isRetryableRestoreError(error),
        });
        return;
      }
    }
    restored.push(target);
    await reconcileLocalRestore(kind, target);
  });
  return { restored, warnings, failed };
}

/** Delete and Undo alike: the roots come from the per-kind table in `deleteLocalStores.ts`. */
export function invalidateAfterDelete(queryClient: QueryClient, kind: DeleteObjectKind): void {
  for (const root of QUERY_ROOTS_BY_KIND[kind]) {
    void queryClient.invalidateQueries({ queryKey: [root] });
  }
}
