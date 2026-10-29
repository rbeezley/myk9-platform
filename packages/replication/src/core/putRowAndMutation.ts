import type { IDBPTransaction } from 'idb';
import { isConflictSurfacingEnabled } from '../conflictConfig';
import type { PendingMutation, ReplicatedRow } from '../types';
import { REPLICATION_STORES } from './DatabaseManager';

/** A prepared mutation plus the queue's counter, which numbers it inside the transaction. */
export interface QueuedWrite {
  mutation: PendingMutation;
  sequencer?: { key: string; next: (persisted: number | undefined) => number } | undefined;
}

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
function finalizeQueuedMutation(
  queued: PendingMutation,
  row: ReplicatedRow<unknown>
): PendingMutation {
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

/** Marks a request handled, so an abort cannot surface it as an unhandled rejection. */
function settled<P extends Promise<unknown>>(request: P): P {
  request.catch(() => undefined);
  return request;
}

/**
 * Commit the dirty row and its mutation in `tx`, one transaction
 * over both stores: they land together or not at all (MYK9-1471). `rowPut` is
 * the row store's pending put; this issues the mutation put right behind it with
 * nothing awaited in between, so the transaction cannot auto-commit between them.
 * Any failure aborts the transaction, discarding the row put too.
 */
export async function putRowAndMutation(
  tx: WriteTransaction,
  rowPut: Promise<unknown>,
  row: ReplicatedRow<unknown>,
  queued: QueuedWrite
): Promise<void> {
  // Settled below via Promise.all; this keeps an abort from surfacing it as unhandled.
  settled(rowPut);
  try {
    const finalized = finalizeQueuedMutation(queued.mutation, row);
    const puts: Promise<unknown>[] = [rowPut];
    const { sequencer } = queued;
    if (sequencer) {
      // Numbered here, from the counter record this transaction reads, so two
      // overlapping writes are numbered in the order they commit (MYK9-1471).
      const metadata = tx.objectStore(REPLICATION_STORES.SYNC_METADATA);
      const record = (await metadata.get(sequencer.key)) as { value?: number } | undefined;
      const sequenceNumber = sequencer.next(record?.value);
      finalized.sequenceNumber = sequenceNumber;
      puts.push(settled(metadata.put({ tableName: sequencer.key, value: sequenceNumber })));
    }
    puts.push(settled(tx.objectStore(REPLICATION_STORES.PENDING_MUTATIONS).put(finalized)));
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
