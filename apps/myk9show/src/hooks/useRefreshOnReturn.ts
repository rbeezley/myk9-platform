/**
 * Re-read a page's data when the exhibitor comes back to it (MYK9-1523).
 *
 * INTENT: the exhibitor knows where their dog stands without asking. They
 * glance at the phone between runs: a returning window focus or a tab becoming
 * visible is that moment, so the page re-reads then instead of listening to
 * the replica (whose per-show snapshot cannot stand in for the account read).
 * Throttled, and skipped while any local write is in flight, so a read can never
 * land the server's old value over a pending check-in.
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
    const onReturn = () => {
      if (document.visibilityState === 'hidden') return;
      // Read at event time: a mutation count held in React state lags the write.
      if (queryClient.isMutating() > 0) return;
      const now = Date.now();
      if (now - lastRefreshAtRef.current < REFRESH_ON_RETURN_MIN_INTERVAL_MS) return;
      lastRefreshAtRef.current = now;
      void refreshRef.current();
    };
    window.addEventListener('focus', onReturn);
    document.addEventListener('visibilitychange', onReturn);
    return () => {
      window.removeEventListener('focus', onReturn);
      document.removeEventListener('visibilitychange', onReturn);
    };
  }, [enabled, queryClient]);
}
