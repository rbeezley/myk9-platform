import { useEffect, useState } from 'react';
import { mutationManager } from '@/services/replication/sharedMutationManager';

// Replication events after which the pending-mutation count may have changed.
const REFRESH_EVENTS = [
  'replication:upload-complete',
  'replication:sync-failed',
  'replication:queue-overflow',
  'replication:recovery',
  'replication:conflict',
] as const;

/**
 * The real count of writes queued locally but not yet synced. Reads
 * mutationManager.getPendingCount() on mount, on every replication event, and
 * on a slow interval backstop. This is the source of truth for "N waiting to
 * sync" affordances — never fabricate it.
 */
export function usePendingMutationCount(pollMs = 15000): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      mutationManager
        .getPendingCount()
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
  }, [pollMs]);

  return count;
}
