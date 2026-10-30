/**
 * Re-read a page's data when the exhibitor comes back to it (MYK9-1523).
 *
 * INTENT: the exhibitor knows where their dog stands without asking. They
 * glance at the phone between runs: a returning window focus or a tab becoming
 * visible is that moment, so the page re-reads then instead of listening to
 * the replica (whose per-show snapshot cannot stand in for the account read).
 *
 * Throttled to one per window. A read never starts while a local write is in
 * flight; the return is remembered and runs once the write settles. A write that
 * overlaps a read may have been overwritten by it, so one corrective re-read
 * follows once both are done.
 */

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';

/** At most one return-triggered refresh per window. */
export const REFRESH_ON_RETURN_MIN_INTERVAL_MS = 30_000;

export function useRefreshOnReturn(refresh: () => Promise<void> | void, enabled = true): void {
  const refreshRef = useRef(refresh);
  const lastRefreshAtRef = useRef(0);
  const queryClient = useQueryClient();

  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  // Arriving on the page is a read; the first return counts from here.
  useEffect(() => {
    lastRefreshAtRef.current = Date.now();
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let reading = false;
    // A refresh is owed once no write is in flight and no read is running.
    let owed = false;
    let disposed = false;

    // Read at event time: a mutation count held in React state lags the write.
    const writing = () => queryClient.isMutating() > 0;

    const flush = () => {
      if (disposed || !owed || reading || writing()) return;
      owed = false;
      reading = true;
      lastRefreshAtRef.current = Date.now();
      void Promise.resolve(refreshRef.current()).finally(() => {
        reading = false;
        flush();
      });
    };

    const onReturn = () => {
      if (document.visibilityState === 'hidden') return;
      if (Date.now() - lastRefreshAtRef.current < REFRESH_ON_RETURN_MIN_INTERVAL_MS) return;
      owed = true;
      flush();
    };

    const unsubscribeMutations = queryClient.getMutationCache().subscribe(() => {
      // A write that lands during a read may be overwritten by that read.
      if (writing() && reading) owed = true;
      flush();
    });
    window.addEventListener('focus', onReturn);
    document.addEventListener('visibilitychange', onReturn);
    return () => {
      disposed = true;
      unsubscribeMutations();
      window.removeEventListener('focus', onReturn);
      document.removeEventListener('visibilitychange', onReturn);
    };
  }, [enabled, queryClient]);
}
