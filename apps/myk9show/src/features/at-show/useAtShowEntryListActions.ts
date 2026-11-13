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
 *  - reset score → REAL: clears the score fields (and a `completed` check-in
 *    status) in one replicated write, routed through `ringside_update_entry`.
 */

import { useCallback, useRef, useState } from 'react';
import type { EntryListActions, EntryStatusCheckIn } from '@myk9/ringside';
import type { EntryStatus } from '@myk9/core';
import { logger } from '@/utils/logger';
import { SelfCheckinRefusedError, isSelfCheckinRefusal } from './entryStatusAccess';
import { usePendingMutationCount } from '@/hooks/usePendingMutationCount';
import {
  updateReplicatedCheckInStatus,
  updateSelfCheckInStatus,
  isStaleCheckIn,
  type CheckInWriter,
} from '@/services/show-day/checkInStatus';
import { replicatedEntriesTable } from '@/services/replication';
import {
  SCORE_DETAIL_CLEAR_FIELDS,
  scoreResetCheckInFields,
} from '@/services/replication/scoreResetFields';

export interface UseAtShowEntryListActionsDeps {
  /** Refresh callback from the data hook; awaited after a successful mutation. */
  refresh: (forceSync?: boolean) => Promise<void>;
  /**
   * Which authorization path check-in writes take. Staff (admin / judge /
   * steward) use the `'replicated'` writer (`ringside_update_entry`, authorized
   * by staff role). An exhibitor-role account — including an admin who entered
   * an exhibitor passcode — must use `'self-checkin-rpc'` (`self_checkin_entry`,
   * authorized by dog ownership), because the replicated path's RLS admits only
   * managers/judges/stewards and would silently reject an exhibitor's write on
   * sync. Defaults to `'replicated'` to preserve staff behavior.
   */
  writer?: CheckInWriter | undefined;
}

/**
 * Write a check-in status to an entry through the writer that matches the
 * caller's authority. Exhibitor self-check-in is online-only by design (the
 * `self_checkin_entry` RPC has no offline queue), consistent with every other
 * exhibitor self-check-in surface.
 *
 * Coupling note: the `'self-checkin-rpc'` path only accepts the ownership-
 * allowed statuses (`checked-in | conflict | pulled | at-gate | no-status`).
 * The `in-ring` / `completed` statuses emitted by handleMark{InRing,Completed}
 * / handleToggleInRing are staff-only — `self_checkin_entry` RAISEs on them.
 * That's unreachable for exhibitors today (`canScore=false` hides those
 * affordances), and if it ever leaks the RPC fails loud → `hasError`, never a
 * silent stuck optimistic update (the exact regression this writer-branch fixed).
 */
async function writeCheckInStatus(
  entryId: string,
  status: EntryStatus,
  writer: CheckInWriter
): Promise<number | undefined> {
  if (writer === 'self-checkin-rpc') {
    try {
      return await updateSelfCheckInStatus(entryId, status);
    } catch (error) {
      // Only the write's own refusal is an answer; a refresh failure after it stays a failure.
      throw isSelfCheckinRefusal(error) ? new SelfCheckinRefusedError(error) : error;
    }
  }
  await updateReplicatedCheckInStatus(entryId, status);
  return undefined;
}

export function useAtShowEntryListActions(deps: UseAtShowEntryListActionsDeps): EntryListActions & {
  writer: CheckInWriter;
  handleUndoPull: (
    entryId: string,
    prior: EntryStatusCheckIn,
    pullVersion?: number
  ) => Promise<void>;
  /** The `entries.version` the exhibitor's latest write to this entry produced, if any. */
  lastWriteVersion: (entryId: string) => number | undefined;
} {
  const { refresh } = deps;
  const writer: CheckInWriter = deps.writer ?? 'replicated';
  const [isSyncing, setIsSyncing] = useState(false);
  const [hasError, setHasError] = useState(false);
  // Real count of queued-but-unsynced writes — powers the header's "N waiting to
  // sync" signal so a judge can tell whether it's safe to close the iPad.
  const pendingCount = usePendingMutationCount();
  // Tracks concurrent in-flight mutations so `isSyncing` only clears when the
  // last one settles (useState lags within a sync burst).
  const inFlight = useRef(0);
  // The version each exhibitor write produced, so a Pull's Undo can name the Pull it undoes.
  const writeVersions = useRef(new Map<string, number>());

  const runMutation = useCallback(async (fn: () => Promise<void>): Promise<void> => {
    inFlight.current += 1;
    setIsSyncing(true);
    try {
      await fn();
      setHasError(false);
    } catch (error) {
      // A refusal by `self_checkin_entry` is an answer, not a failure to send: the change is not
      // queued and nothing is waiting to sync, so it must not light the "could not be sent" pill.
      // The caller words the refusal for the exhibitor (MYK9-1807).
      if (!(error instanceof SelfCheckinRefusedError)) setHasError(true);
      logger.error('[at-show] entry mutation failed', 'at-show', { error: String(error) });
      throw error;
    } finally {
      inFlight.current -= 1;
      if (inFlight.current === 0) setIsSyncing(false);
    }
  }, []);

  const handleStatusChange = useCallback<EntryListActions['handleStatusChange']>(
    async (entryId, newStatus) => {
      await runMutation(async () => {
        const version = await writeCheckInStatus(entryId, newStatus, writer);
        if (version === undefined) writeVersions.current.delete(entryId);
        else writeVersions.current.set(entryId, version);
        await refresh();
      });
    },
    [runMutation, refresh, writer]
  );
  const lastWriteVersion = useCallback((entryId: string) => writeVersions.current.get(entryId), []);

  // MYK9-1911: an exhibitor's Pull Undo expects the dog to still be pulled by the exhibitor, so a
  // replay after a newer status refuses instead of overwriting it. Staff Undo (replicated writer)
  // is guarded client-side and goes through the ordinary path. A refusal refreshes the list so it
  // shows the newer truth, then rethrows for the caller's notice.
  const handleUndoPull = useCallback(
    async (entryId: string, prior: EntryStatusCheckIn, pullVersion?: number): Promise<void> => {
      if (writer !== 'self-checkin-rpc') return handleStatusChange(entryId, prior);
      try {
        await runMutation(async () => {
          await updateSelfCheckInStatus(entryId, prior, {
            status: 'pulled',
            pullSource: 'exhibitor',
            ...(pullVersion !== undefined && { version: pullVersion }),
          });
          await refresh();
        });
      } catch (error) {
        if (isStaleCheckIn(error)) await refresh();
        throw error;
      }
    },
    [writer, handleStatusChange, runMutation, refresh]
  );

  const handleToggleInRing = useCallback<EntryListActions['handleToggleInRing']>(
    async (entryId, currentInRing) => {
      await runMutation(async () => {
        await writeCheckInStatus(entryId, currentInRing ? 'no-status' : 'in-ring', writer);
        await refresh();
      });
    },
    [runMutation, refresh, writer]
  );

  const handleMarkInRing = useCallback<EntryListActions['handleMarkInRing']>(
    async entryId => {
      await runMutation(async () => {
        await writeCheckInStatus(entryId, 'in-ring', writer);
        await refresh();
      });
    },
    [runMutation, refresh, writer]
  );

  const handleMarkCompleted = useCallback<EntryListActions['handleMarkCompleted']>(
    async entryId => {
      await runMutation(async () => {
        await writeCheckInStatus(entryId, 'completed', writer);
        await refresh();
      });
    },
    [runMutation, refresh, writer]
  );

  const handleBatchStatusUpdate = useCallback<EntryListActions['handleBatchStatusUpdate']>(
    async (entryIds, newStatus) => {
      await runMutation(async () => {
        await Promise.all(entryIds.map(id => writeCheckInStatus(id, newStatus, writer)));
        await refresh();
      });
    },
    [runMutation, refresh, writer]
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
        await replicatedEntriesTable.updateEntryWith(entryId, current => ({
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
          ...SCORE_DETAIL_CLEAR_FIELDS,
          ...scoreResetCheckInFields(current),
        }));
        await refresh();
      });
    },
    [runMutation, refresh]
  );

  return {
    handleStatusChange,
    handleUndoPull,
    lastWriteVersion,
    handleResetScore,
    handleToggleInRing,
    handleMarkInRing,
    handleMarkCompleted,
    handleBatchStatusUpdate,
    isSyncing,
    hasError,
    pendingCount,
    // Lets a caller tell which authority wrote, e.g. whether Undo can restore a staff-set status.
    writer,
  };
}
