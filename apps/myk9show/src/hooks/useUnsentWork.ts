import { useEffect, useState } from 'react';
import {
  EMPTY_UNSENT_WORK,
  readDeviceUnsentWork,
  type UnsentWork,
} from '@/services/replication/unsentWork';
import { CONFLICT_SETTLED_EVENT } from '@/features/replication-conflicts/conflictEvents';

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
  // A held conflict settled (Keep my change / Keep the other change): its change leaves the count.
  CONFLICT_SETTLED_EVENT,
] as const;

/** Tell every count that the list changed the dead letters (Try again, Remove). */
export function announceUnsentChanged(): void {
  window.dispatchEvent(new CustomEvent('replication:unsent-changed'));
}

/**
 * - `loading`: the first read has not finished; nothing is known yet.
 * - `known`: the last read succeeded.
 * - `failed`: the last read failed; `work` is the last known value (or empty), not the truth.
 */
export type UnsentWorkReadStatus = 'loading' | 'known' | 'failed';

export interface UnsentWorkState {
  work: UnsentWork;
  status: UnsentWorkReadStatus;
}

/**
 * The real unsent work on this device: waiting AND refused, in scores (MYK9-2011). Reads
 * IndexedDB on mount, on every replication event, and on a slow interval backstop. This is
 * the source of truth for every "not sent yet" count; never fabricate it.
 *
 * `status` lets a surface that says "every score is sent" (MYK9-2013) wait for a real read:
 * an empty value before the first read, or after a failed one, is not "nothing unsent".
 */
export function useUnsentWorkState(pollMs = 15000): UnsentWorkState {
  const [state, setState] = useState<UnsentWorkState>({
    work: EMPTY_UNSENT_WORK,
    status: 'loading',
  });

  useEffect(() => {
    let cancelled = false;
    // Reads overlap (an event during a slow read); only the newest one may set the state, so an
    // older read that finishes last can never put back a count from before a save or a send.
    let latest = 0;
    const refresh = () => {
      const request = ++latest;
      const current = () => !cancelled && request === latest;
      readDeviceUnsentWork()
        .then(next => {
          if (current()) setState({ work: next, status: 'known' });
        })
        .catch(() => {
          // Keep the last known value for the counts, but it is no longer known.
          if (current()) setState(prev => ({ work: prev.work, status: 'failed' }));
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

  return state;
}

/** The unsent work counts alone (the last known value while a read is pending or failed). */
export function useUnsentWork(pollMs = 15000): UnsentWork {
  return useUnsentWorkState(pollMs).work;
}
