/**
 * Phase 1a — myK9Show host implementation of ringside's `EntryListActions`
 * (the 8-method entry-mutation bag the ringside EntryList page consumes).
 *
 * Modeled on myK9Q's `useEntryListActions` (pattern, not copy). myK9Show
 * carries the show-day flow in the dedicated `check_in_status` column, so all
 * status mutations write through the shared replicated check-in status writer
 * — offline-first, queued for sync.
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
import { logger } from '@/utils/logger';
import { updateReplicatedCheckInStatus } from '@/services/show-day/checkInStatus';
import { replicatedEntriesTable } from '@/services/replication';

export interface UseAtShowEntryListActionsDeps {
  /** Refresh callback from the data hook; awaited after a successful mutation. */
  refresh: (forceSync?: boolean) => Promise<void>;
}

/** Write a check-in status to an entry through the replicated writer. */
async function writeCheckInStatus(entryId: string, status: EntryStatus): Promise<void> {
  await updateReplicatedCheckInStatus(entryId, status);
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

  const handleResetScore = useCallback<EntryListActions['handleResetScore']>(
    async entryId => {
      // Clear the scored fields back to an unscored/pending state. There is no
      // `protect_scored_entries` trigger (verified absent), so no unlock step is
      // needed — the same pattern the secretary paper scoresheet uses
      // (usePaperScoring.clearEntry). All cleared columns are ringside-
      // whitelisted, so updateEntry auto-routes through ringside_update_entry,
      // letting an assigned judge reset as well as a manager. The scoring-state
      // trigger clears any stale placement automatically.
      await runMutation(async () => {
        await replicatedEntriesTable.updateEntry(entryId, {
          // Use the nullable (camel finalPlacement / snake scoring_completed_at /
          // disqualification_reason) field variants so clears persist as NULL.
          isScored: false,
          is_scored: false,
          resultStatus: 'pending',
          result_status: 'pending',
          searchTimeSeconds: 0,
          search_time_seconds: 0,
          totalFaults: 0,
          total_faults: 0,
          finalPlacement: null,
          scoringCompletedAt: null,
          scoring_completed_at: null,
          disqualification_reason: null,
        });
        await refresh();
      });
    },
    [runMutation, refresh]
  );

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
