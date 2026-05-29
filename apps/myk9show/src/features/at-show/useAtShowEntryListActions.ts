/**
 * Phase 1a — myK9Show host implementation of ringside's `EntryListActions`
 * (the 8-method entry-mutation bag the ringside EntryList page consumes).
 *
 * Modeled on myK9Q's `useEntryListActions` (pattern, not copy). myK9Show
 * carries the show-day flow in the dedicated `check_in_status` column, so all
 * status mutations write `checkInStatus` (+ snake alias) via
 * `replicatedEntriesTable.updateEntry` — offline-first, queued for sync.
 *
 * Real vs stub (per the Phase 1a service-layer audit + DB checks):
 *  - status change / toggle in-ring / mark in-ring / mark completed / batch →
 *    REAL (write check-in status).
 *  - reset score → STUB: the unified DB has no `unlock_entry_for_edit` RPC /
 *    `protect_scored_entries` trigger, so a faithful score-reset is deferred.
 *    The UI clears optimistically (handler side); this just logs.
 */

import { useCallback, useRef, useState } from 'react';
import type { EntryListActions } from '@myk9/ringside';
import type { EntryStatus } from '@myk9/core';
import { replicatedEntriesTable } from '@/services/replication';
import { logger } from '@/utils/logger';

export interface UseAtShowEntryListActionsDeps {
  /** Refresh callback from the data hook; awaited after a successful mutation. */
  refresh: (forceSync?: boolean) => Promise<void>;
}

/** Write a check-in status to an entry (camel + snake alias for sync compat). */
async function writeCheckInStatus(entryId: string, status: EntryStatus): Promise<void> {
  await replicatedEntriesTable.updateEntry(entryId, {
    checkInStatus: status,
    check_in_status: status,
  });
}

export function useAtShowEntryListActions(deps: UseAtShowEntryListActionsDeps): EntryListActions {
  const { refresh } = deps;
  const [isSyncing, setIsSyncing] = useState(false);
  const [hasError, setHasError] = useState(false);
  // Tracks concurrent in-flight mutations so `isSyncing` only clears when the
  // last one settles (useState lags within a sync burst).
  const inFlight = useRef(0);

  const runMutation = useCallback(
    async (fn: () => Promise<void>): Promise<void> => {
      inFlight.current += 1;
      setIsSyncing(true);
      try {
        await fn();
        setHasError(false);
      } catch (error) {
        setHasError(true);
        logger.error('[at-show] entry mutation failed', 'at-show', { error: String(error) });
        throw error;
      } finally {
        inFlight.current -= 1;
        if (inFlight.current === 0) setIsSyncing(false);
      }
    },
    []
  );

  const handleStatusChange = useCallback<EntryListActions['handleStatusChange']>(
    async (entryId, newStatus) => {
      await runMutation(async () => {
        await writeCheckInStatus(entryId, newStatus);
        await refresh();
      });
    },
    [runMutation, refresh]
  );

  const handleToggleInRing = useCallback<EntryListActions['handleToggleInRing']>(
    async (entryId, currentInRing) => {
      await runMutation(async () => {
        await writeCheckInStatus(entryId, currentInRing ? 'no-status' : 'in-ring');
        await refresh();
      });
    },
    [runMutation, refresh]
  );

  const handleMarkInRing = useCallback<EntryListActions['handleMarkInRing']>(
    async entryId => {
      await runMutation(async () => {
        await writeCheckInStatus(entryId, 'in-ring');
        await refresh();
      });
    },
    [runMutation, refresh]
  );

  const handleMarkCompleted = useCallback<EntryListActions['handleMarkCompleted']>(
    async entryId => {
      await runMutation(async () => {
        await writeCheckInStatus(entryId, 'completed');
        await refresh();
      });
    },
    [runMutation, refresh]
  );

  const handleBatchStatusUpdate = useCallback<EntryListActions['handleBatchStatusUpdate']>(
    async (entryIds, newStatus) => {
      await runMutation(async () => {
        await Promise.all(entryIds.map(id => writeCheckInStatus(id, newStatus)));
        await refresh();
      });
    },
    [runMutation, refresh]
  );

  const handleResetScore = useCallback<EntryListActions['handleResetScore']>(async entryId => {
    // INTENT (Phase 1a spike): score-reset is a STUB. The unified DB lacks the
    // `unlock_entry_for_edit` RPC + `protect_scored_entries` trigger that a
    // faithful reset depends on (verified absent 2026-05-28). Wiring a real
    // reset is a follow-up once the edit-lock model is decided — do NOT
    // silently write a partial reset here (it would bypass scored-entry
    // protection). The handler clears the row optimistically for UX.
    logger.warn(
      `[at-show] resetEntryScore is stubbed for the spike — no DB write for entry ${entryId}`
    );
  }, []);

  return {
    handleStatusChange,
    handleResetScore,
    handleToggleInRing,
    handleMarkInRing,
    handleMarkCompleted,
    handleBatchStatusUpdate,
    isSyncing,
    hasError,
  };
}
