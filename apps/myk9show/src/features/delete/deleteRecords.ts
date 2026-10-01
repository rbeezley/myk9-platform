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
  deleteErrorMessage,
  isRetryableRestoreError,
  restoreErrorMessage,
} from './deleteErrors';
import { reconcileLocalDeletion, reconcileLocalRestore } from './deleteLocalState';
import { restoreOnServer, softDeleteOnServer, type ServerDeleteOptions } from './deleteServer';
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

/** Undo is offered to the deleter only inside the server's 10-minute window. */
export function canStillUndo(deletedAt: number, now: number = Date.now()): boolean {
  return now - deletedAt < UNDO_WINDOW_MS;
}

export interface RestoreRecordsResult {
  restored: DeleteTarget[];
  failed: DeleteFailure[];
}

export async function restoreRecords(
  kind: DeleteObjectKind,
  targets: readonly DeleteTarget[]
): Promise<RestoreRecordsResult> {
  const restored: DeleteTarget[] = [];
  const failed: DeleteFailure[] = [];
  await forEachLimited(targets, async target => {
    try {
      await restoreOnServer(kind, target.id);
    } catch (error) {
      failed.push({
        target,
        message: restoreErrorMessage(kind, error),
        retryable: isRetryableRestoreError(error),
      });
      return;
    }
    restored.push(target);
    await reconcileLocalRestore(kind, target);
  });
  return { restored, failed };
}

/** React Query caches each kind of delete can change. */
const AFFECTED_QUERY_ROOTS: Record<DeleteObjectKind, readonly string[]> = {
  club: ['clubs', 'shows'],
  show: ['shows', 'trials', 'classes', 'entries', 'clubs'],
  trial: ['trials', 'classes', 'entries', 'shows'],
  class: ['classes', 'entries', 'trials', 'shows'],
  entry: ['entries', 'classes', 'shows', 'dogs'],
  dog: ['dogs', 'entries', 'users', 'people'],
  person: ['users', 'people', 'dogs'],
};

export function invalidateAfterDelete(queryClient: QueryClient, kind: DeleteObjectKind): void {
  for (const root of AFFECTED_QUERY_ROOTS[kind]) {
    void queryClient.invalidateQueries({ queryKey: [root] });
  }
}
