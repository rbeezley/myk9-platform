import { useEffect, useState } from 'react';
import {
  EMPTY_UNSENT_WORK,
  readDeviceUnsentWork,
  type UnsentWork,
} from '@/services/replication/unsentWork';

// Replication events after which the unsent work may have changed.
export const UNSENT_WORK_REFRESH_EVENTS = [
  // Fired on every successful queueMutation: the ONLY signal that arrives while
  // offline, so the count reflects a just-saved score immediately, not after a
  // poll tick.
  'replication:mutation-queued',
  'replication:upload-complete',
  'replication:sync-failed',
  'replication:queue-overflow',
  'replication:recovery',
  'replication:conflict',
  // A Try again or a removal on the Scores not sent list.
  'replication:unsent-changed',
] as const;

/** Tell every count that the list changed the dead letters (Try again, Remove). */
export function announceUnsentChanged(): void {
  window.dispatchEvent(new CustomEvent('replication:unsent-changed'));
}

/**
 * The real unsent work on this device: waiting AND refused, in scores (MYK9-2011). Reads
 * IndexedDB on mount, on every replication event, and on a slow interval backstop. This is
 * the source of truth for every "not sent yet" count; never fabricate it.
 */
export function useUnsentWork(pollMs = 15000): UnsentWork {
  const [work, setWork] = useState<UnsentWork>(EMPTY_UNSENT_WORK);

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      readDeviceUnsentWork()
        .then(next => {
          if (!cancelled) setWork(next);
        })
        .catch(() => {
          /* best-effort; keep the last known value */
        });
    };

    refresh();
    for (const eventName of UNSENT_WORK_REFRESH_EVENTS) {
      window.addEventListener(eventName, refresh);
    }
    const interval = setInterval(refresh, pollMs);

    return () => {
      cancelled = true;
      for (const eventName of UNSENT_WORK_REFRESH_EVENTS) {
        window.removeEventListener(eventName, refresh);
      }
      clearInterval(interval);
    };
  }, [pollMs]);

  return work;
}
