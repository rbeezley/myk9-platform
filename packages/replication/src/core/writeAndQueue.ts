import type { Logger } from '../dependencies';
import type { PendingMutation } from '../types';
import type { ReplicatedSetResult } from './coldInsertGuard';

export interface WriteAndQueueSteps {
  /** The app-level write slot (cache-clear gate); undefined when there is none. */
  acquireLock: () => Promise<(() => void) | undefined>;
  /** The queue record, built but unwritten; null when no MutationManager is set. */
  prepare: () => Promise<PendingMutation | null>;
  /** Commits the dirty row and `queued` in one IndexedDB transaction. */
  write: (queued: PendingMutation | null) => Promise<{ result: ReplicatedSetResult }>;
  /** After commit: localStorage backup (best-effort) and the queued event. */
  announce: () => Promise<void>;
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
 * A write that stores nothing (cold-insert refusal) queues nothing.
 */
export async function writeAndQueue(steps: WriteAndQueueSteps): Promise<WriteAndQueueResult> {
  const releaseLock = await steps.acquireLock();
  try {
    const queued = await steps.prepare();
    const { result } = await steps.write(queued);
    if (!queued || !result.written) return { mutationId: null, result };
    await steps.announce().catch(error => {
      steps.logger.warn('[writeAndQueue] Post-commit announce failed:', error);
    });
    steps.requestUpload();
    return { mutationId: queued.id, result };
  } finally {
    releaseLock?.();
  }
}
