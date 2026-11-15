import { useEffect, useState } from 'react';
import { mutationManager } from '@/services/replication/sharedMutationManager';

// Replication events after which the pending-mutation count may have changed.
const REFRESH_EVENTS = [
  // Fired on every successful queueMutation — the ONLY signal that arrives while
  // offline, so the count reflects a just-queued score immediately, not after a
  // poll tick.
  'replication:mutation-queued',
  'replication:upload-complete',
  'replication:sync-failed',
  'replication:queue-overflow',
  'replication:recovery',
  'replication:conflict',
  // Try again / Remove on "Scores not sent" (MYK9-2011) move rows between the two stores.
  'scores-not-sent:changed',
] as const;

/**
 * The real count of writes queued locally but not yet synced. Reads
 * mutationManager.getPendingCount() on mount, on every replication event, and
 * on a slow interval backstop. This is the source of truth for "N waiting to
 * sync" affordances — never fabricate it.
 */
export function usePendingMutationCount(pollMs = 15000): number {
  return useQueueCount(readPendingCount, pollMs);
}

/**
 * This user's writes the server refused or that ran out of tries (the failed-mutation store),
 * kept until retried or removed. A refused write has not reached the server, so no "all saved"
 * line may show while this is above zero (MYK9-2011).
 */
export function useFailedMutationCount(pollMs = 15000): number {
  return useQueueCount(readFailedCount, pollMs);
}

const readPendingCount = () => mutationManager.getPendingCount();
const readFailedCount = async () => (await mutationManager.getFailedMutations()).length;

function useQueueCount(read: () => Promise<number>, pollMs: number): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      read()
        .then(next => {
          if (!cancelled) setCount(next);
        })
        .catch(() => {
          /* best-effort; keep last known value */
        });
    };

    refresh();
    for (const eventName of REFRESH_EVENTS) {
      window.addEventListener(eventName, refresh);
    }
    const interval = setInterval(refresh, pollMs);

    return () => {
      cancelled = true;
      for (const eventName of REFRESH_EVENTS) {
        window.removeEventListener(eventName, refresh);
      }
      clearInterval(interval);
    };
  }, [read, pollMs]);

  return count;
}
