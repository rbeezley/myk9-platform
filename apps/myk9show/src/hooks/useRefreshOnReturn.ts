/**
 * Re-read a page's data when the exhibitor comes back to it (MYK9-1523).
 *
 * INTENT: the exhibitor knows where their dog stands without asking. They
 * glance at the phone between runs: a returning window focus or a tab becoming
 * visible is that moment, so the page re-reads then instead of listening to
 * the replica (whose per-show snapshot cannot stand in for the account read).
 *
 * Every return refreshes. A return while a refresh is running coalesces into
 * exactly one follow-up. A read never starts while the page's own write
 * (`isWriting`) is in flight; the return is remembered and runs once the write
 * settles. A write that overlaps a read may have been overwritten by it, so one
 * corrective re-read follows once both are done.
 */

import { useEffect, useRef } from 'react';

export function useRefreshOnReturn(
  refresh: () => Promise<void> | void,
  enabled = true,
  isWriting = false
): void {
  const refreshRef = useRef(refresh);
  const writingRef = useRef(isWriting);
  const syncRef = useRef<() => void>(() => {});
  const overlapRef = useRef<() => void>(() => {});

  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  useEffect(() => {
    writingRef.current = isWriting;
    if (isWriting) overlapRef.current();
    else syncRef.current();
  }, [isWriting]);

  useEffect(() => {
    if (!enabled) return;
    let reading = false;
    let owed = false;
    let disposed = false;

    const flush = () => {
      if (disposed || !owed || reading || writingRef.current) return;
      owed = false;
      reading = true;
      void Promise.resolve(refreshRef.current()).finally(() => {
        reading = false;
        flush();
      });
    };

    const onReturn = () => {
      if (document.visibilityState === 'hidden') return;
      owed = true;
      flush();
    };

    syncRef.current = flush;
    // A write that lands during a read may be overwritten by that read.
    overlapRef.current = () => {
      if (reading) owed = true;
    };
    window.addEventListener('focus', onReturn);
    document.addEventListener('visibilitychange', onReturn);
    return () => {
      disposed = true;
      syncRef.current = () => {};
      overlapRef.current = () => {};
      window.removeEventListener('focus', onReturn);
      document.removeEventListener('visibilitychange', onReturn);
    };
  }, [enabled]);
}
