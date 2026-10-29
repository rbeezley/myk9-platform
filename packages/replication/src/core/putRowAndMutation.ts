import type { IDBPTransaction } from 'idb';
import { isConflictSurfacingEnabled } from '../conflictConfig';
import type { PendingMutation, ReplicatedRow } from '../types';
import { REPLICATION_STORES } from './DatabaseManager';

type WriteTransaction = Pick<
  IDBPTransaction<unknown, string[], 'readwrite'>,
  'objectStore' | 'done' | 'abort'
>;

/**
 * The queue record as the row write produced it: `rowRevision` is the revision
 * this write gave the row (Discard revert, MYK9-1076, needs it), and an UPDATE
 * carries the row's server version as its OCC precondition, read from the same
 * row the same transaction writes, so no upload can move it in between.
 */
function finalizeQueuedMutation(queued: PendingMutation, row: ReplicatedRow<unknown>) {
  const withOcc =
    queued.operation === 'UPDATE' &&
    isConflictSurfacingEnabled() &&
    row.serverVersion !== undefined;
  return {
    ...queued,
    rowRevision: row.version,
    ...(withOcc && { serverVersion: row.serverVersion }),
  };
}

/**
 * Commit the dirty row and (when given) its mutation in `tx`, one transaction
 * over both stores: they land together or not at all (MYK9-1471). `rowPut` is
 * the row store's pending put; this issues the mutation put right behind it with
 * nothing awaited in between, so the transaction cannot auto-commit between them.
 * Any failure aborts the transaction, discarding the row put too.
 */
export async function putRowAndMutation(
  tx: WriteTransaction,
  rowPut: Promise<unknown>,
  row: ReplicatedRow<unknown>,
  queued: PendingMutation | undefined
): Promise<void> {
  // Settled below via Promise.all; this keeps an abort from surfacing it as unhandled.
  rowPut.catch(() => undefined);
  try {
    const puts: Promise<unknown>[] = [rowPut];
    if (queued) {
      puts.push(
        tx
          .objectStore(REPLICATION_STORES.PENDING_MUTATIONS)
          .put(finalizeQueuedMutation(queued, row))
      );
    }
    await Promise.all(puts);
    await tx.done;
  } catch (error) {
    try {
      tx.abort();
    } catch {
      /* already finished */
    }
    await tx.done.catch(() => undefined);
    throw error;
  }
}
