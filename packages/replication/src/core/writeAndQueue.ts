import type { Logger } from '../dependencies';
import type { ReplicatedSetResult } from './coldInsertGuard';
import type { QueuedWrite } from './putRowAndMutation';

export interface WriteAndQueueSteps {
  /** The app-level write slot (cache-clear gate); undefined when there is none. */
  acquireLock: () => Promise<(() => void) | undefined>;
  /** The queue record, built but unwritten; null when no MutationManager is set. */
  prepare: () => Promise<QueuedWrite | null>;
  /** Commits the dirty row and `queued` in one IndexedDB transaction. */
  write: (queued: QueuedWrite | null) => Promise<{ result: ReplicatedSetResult }>;
  /** After commit: localStorage backup (best-effort) and the queued event. */
  announce: () => Promise<void>;
  /**
   * The plain queue path (own lock, own upload): used when the row write was
   * refused, so the change still reaches the server with no dirty row to strand.
   */
  queueAlone: () => Promise<string | null>;
  requestUpload: () => void;
  logger: Logger;
}

export interface WriteAndQueueResult {
  mutationId: string | null;
  result: ReplicatedSetResult;
}

/**
 * Mark a row dirty and queue its mutation as one atomic unit (MYK9-1471).
 *
 * Everything that awaits non-IndexedDB work (identity, capacity check, id and
 * sequence allocation) runs in `prepare`, BEFORE the transaction opens, because
 * a transaction auto-commits once nothing is pending on it. `write` then puts
 * the row and the mutation in the same transaction, so an upload pass sees both
 * or neither: it can never send and delete a mutation ahead of its dirty row
 * (stranding the row as pending), and a failure leaves neither half behind.
 * A write the cold-insert guard refuses stores no row, but its mutation is still
 * queued, alone and after the write lock is released, as before this change.
 * The sequence number is taken inside the transaction (see putRowAndMutation).
 */
export async function writeAndQueue(steps: WriteAndQueueSteps): Promise<WriteAndQueueResult> {
  let releaseLock = await steps.acquireLock();
  try {
    const queued = await steps.prepare();
    const { result } = await steps.write(queued);
    if (!queued) return { mutationId: null, result };
    if (!result.written) {
      // queueMutation takes the write lock itself; ours must be free first.
      releaseLock?.();
      releaseLock = undefined;
      return { mutationId: await steps.queueAlone(), result };
    }
    await steps.announce().catch(error => {
      steps.logger.warn('[writeAndQueue] Post-commit announce failed:', error);
    });
    steps.requestUpload();
    return { mutationId: queued.mutation.id, result };
  } finally {
    releaseLock?.();
  }
}
