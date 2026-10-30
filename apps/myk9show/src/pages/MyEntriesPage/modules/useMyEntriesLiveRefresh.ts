/**
 * Keeps My Shows current while it is open (MYK9-1523).
 *
 * INTENT: the exhibitor knows where their dog stands without asking. A steward's
 * check-in or a class moving to the gate or into the ring lands in the replica
 * (realtime online, local apply offline); that notice re-reads the page once.
 */

import { useEffect, useRef } from 'react';
import { getUserEntriesFromReplica } from '@/services/database/entries';
import { logger } from '@/services/LoggingService';
import {
  replicatedClassesTable,
  replicatedDogsTable,
  replicatedEntriesTable,
} from '@/services/replication';

/** A sync applies rows in bursts; one re-read covers the burst. */
export const MY_ENTRIES_LIVE_REFRESH_DEBOUNCE_MS = 750;

interface LiveRefreshOptions {
  /** `user::person` key the page is showing; null disables the refresh. */
  identity: string | null;
  personId: string | null | undefined;
  /** Receives the replica rows; must ignore them when `identity` is no longer current. */
  applyRows: (rows: Record<string, unknown>[], identity: string) => void;
}

/**
 * Re-reads the REPLICA (never the server view, which would overwrite a pending
 * local write with the old value) after a debounced replica notice. Never fires
 * on the initial emit, never logs an audit event, never touches loading, error,
 * source or balance state: only the page's own loads do that.
 */
export function useMyEntriesLiveRefresh({
  identity,
  personId,
  applyRows,
}: LiveRefreshOptions): void {
  const applyRef = useRef(applyRows);
  useEffect(() => {
    applyRef.current = applyRows;
  }, [applyRows]);

  useEffect(() => {
    if (!identity || !personId) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;
    const refresh = async () => {
      try {
        const rows = await getUserEntriesFromReplica(personId);
        if (!cancelled && rows) applyRef.current(rows, identity);
      } catch (error) {
        logger.warn('My Shows live refresh failed', 'pages', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    };
    const onNotice = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void refresh(), MY_ENTRIES_LIVE_REFRESH_DEBOUNCE_MS);
    };
    const unsubscribes = [
      replicatedEntriesTable.subscribe(onNotice, { emitCurrent: false }),
      replicatedDogsTable.subscribe(onNotice, { emitCurrent: false }),
      replicatedClassesTable.subscribe(onNotice, { emitCurrent: false }),
    ];
    return () => {
      cancelled = true;
      clearTimeout(timer);
      unsubscribes.forEach(unsubscribe => unsubscribe());
    };
  }, [identity, personId]);
}
