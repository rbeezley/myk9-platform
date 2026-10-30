/**
 * Keeps My Shows current while it is open (MYK9-1523).
 *
 * INTENT: the exhibitor knows where their dog stands without asking. A steward's
 * check-in or a class moving to the gate or into the ring lands in the replica
 * (realtime online, local apply offline); that notice re-reads the page once.
 */

import { useEffect, useRef } from 'react';
import {
  replicatedClassesTable,
  replicatedDogsTable,
  replicatedEntriesTable,
} from '@/services/replication';

/** A sync applies rows in bursts; one re-read covers the burst. */
export const MY_ENTRIES_LIVE_REFRESH_DEBOUNCE_MS = 750;

/**
 * Re-reads through `refresh` (the page's existing read, not a second fetch)
 * after a debounced replica notice. Never fires on the initial emit, and never
 * logs an audit event: only the page's initial-load effect does that.
 */
export function useMyEntriesLiveRefresh(refresh: () => Promise<void>, enabled: boolean): void {
  const refreshRef = useRef(refresh);
  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onNotice = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        void refreshRef.current();
      }, MY_ENTRIES_LIVE_REFRESH_DEBOUNCE_MS);
    };
    const unsubscribes = [
      replicatedEntriesTable.subscribe(onNotice, { emitCurrent: false }),
      replicatedDogsTable.subscribe(onNotice, { emitCurrent: false }),
      replicatedClassesTable.subscribe(onNotice, { emitCurrent: false }),
    ];
    return () => {
      clearTimeout(timer);
      unsubscribes.forEach(unsubscribe => unsubscribe());
    };
  }, [enabled]);
}
