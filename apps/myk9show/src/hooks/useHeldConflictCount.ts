import { useEffect, useState } from 'react';
import { CONFLICT_SETTLED_EVENT } from '@/features/replication-conflicts/conflictEvents';
import { listHeldConflicts } from '@/features/replication-conflicts/heldConflicts';

// Events after which the set of held conflicts may have changed.
const REFRESH_EVENTS = [
  'replication:conflict',
  CONFLICT_SETTLED_EVENT,
  'replication:upload-complete',
  'replication:recovery',
] as const;

/**
 * How many changes this device holds for the person's choice (a change that collided with another
 * device's). Read from the persisted conflict snapshots on mount, on the replication events above,
 * and on a slow backstop, so it is true offline and after the notice was closed.
 */
export function useHeldConflictCount(pollMs = 15000): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      listHeldConflicts()
        .then(held => {
          if (!cancelled) setCount(held.length);
        })
        .catch(() => {
          /* best-effort; keep the last known count */
        });
    };

    refresh();
    for (const eventName of REFRESH_EVENTS) window.addEventListener(eventName, refresh);
    const interval = setInterval(refresh, pollMs);
    return () => {
      cancelled = true;
      for (const eventName of REFRESH_EVENTS) window.removeEventListener(eventName, refresh);
      clearInterval(interval);
    };
  }, [pollMs]);

  return count;
}
