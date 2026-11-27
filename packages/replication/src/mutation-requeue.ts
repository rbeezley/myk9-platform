import type { PendingMutation } from './types';

/**
 * A dead letter, put back in the queue as a fresh pending mutation: a full set of
 * retries and OCC attempts, and none of the failure bookkeeping. Used when a
 * person retries it and when a new passcode session adopts it (MYK9-2009).
 *
 * A user-driven retry grants a fresh set of OCC attempts too: without it, a
 * mutation parked at the OCC lifetime cap would re-park on its very next conflict.
 */
export function requeueFailedMutation(failed: PendingMutation): PendingMutation {
  const requeued: PendingMutation = {
    ...failed,
    status: 'pending',
    retries: 0,
    occRetries: 0,
  };
  delete requeued.transportRetries;
  delete requeued.error;
  delete requeued.failureKind;
  delete requeued.errorCode;
  delete requeued.nextRetryAt;
  delete requeued.failedAt;
  return requeued;
}
