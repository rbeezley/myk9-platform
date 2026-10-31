/**
 * The Results tab's reads, gathered in one place (MYK9-1031).
 *
 * This hook assembles nothing itself. Every part is a shared builder:
 *  - the schedule: the replicated trial store (`useShowDeskScheduleRead`, Overview);
 *  - release stamps: `results_released_at` on the same full class rows the paperwork fingerprints
 *    use (`useShowClassRows`, replication-backed). That read is CRITICAL: a failed or unsettled
 *    one is never "nothing is released", and a class with no row is unknown, not unreleased;
 *  - the dogs, scores and handler names: `useSecretaryShowEntriesQuery`, the cache the class page's
 *    staff run sheet reads, whose rows carry the canonical `handler_identity`;
 *  - print state: `useShowClassPaperwork`, the class rows Reports fingerprints plus the replicated
 *    confirmations.
 *
 * `combineReads` folds every sub-read into ONE state, so a failed read is never an empty one
 * (LESSONS `disabled-query false zero`) and Retry refetches all of them.
 */
import { useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';

import { combineReads, type CombinedReadState } from '@/features/_shared/combineReads';
import { useSecretaryShowEntriesQuery } from '@/hooks/queries/useEntriesDatabase';
import { queryKeys } from '@/lib/queryClient';
import { replicatedEntriesTable, replicatedShowsTable } from '@/services/replication';
import { getCockpitReportHref } from '@/features/show-map/cockpit/cockpitRoutes';
import { useShowClassPaperwork } from '@/features/show-map/cockpit/useShowClassPaperwork';
import { getShowDeskEntriesAvailability } from '@/pages/secretary/showDeskEntryAvailability';
import { useShowDeskScheduleRead } from '@/pages/secretary/useShowDeskScheduleRead';
import { buildResultsClassRows, type ResultsClassRow } from './buildResultsClassRows';

const NO_ENTRIES: never[] = [];

const showRankingKeyQueryKey = (showId: string) =>
  [...queryKeys.show(showId), 'results-ranking-key'] as const;

export type ResultsTabReadState = CombinedReadState;

export function useResultsTabData(showId: string) {
  const location = useLocation();
  const schedule = useShowDeskScheduleRead();
  const queryClient = useQueryClient();
  // The scores are the replica's, so a local write (an offline Fix) must reach this tab: re-read on
  // mount, and on every replica notice (already debounced by the table). Never on the initial emit.
  const entriesQuery = useSecretaryShowEntriesQuery(showId, Boolean(showId), {
    rereadOnMount: true,
  });
  useEffect(() => {
    if (!showId) return;
    return replicatedEntriesTable.subscribe(
      () => void queryClient.invalidateQueries({ queryKey: queryKeys.showEntries(showId) }),
      { emitCurrent: false }
    );
  }, [queryClient, showId]);
  const { entriesKnown } = getShowDeskEntriesAvailability({
    data: entriesQuery.data,
    isLoading: entriesQuery.isLoading,
    isError: entriesQuery.isError,
    isEnabled: Boolean(showId),
  });
  const returnTo = `${location.pathname}${location.search}`;

  const showTrials = useMemo(
    () => schedule.trials.filter(trial => trial.showId === showId),
    [schedule.trials, showId]
  );
  const trialDates = useMemo(
    () => showTrials.map(trial => ({ id: trial.id, trialDate: trial.trialDate })),
    [showTrials]
  );
  const entries = entriesQuery.data ?? NO_ENTRIES;
  // Schedule classes are the print-link-only fallback while the full class rows load or fail.
  const scheduleClasses = useMemo(
    () =>
      showTrials.flatMap(trial =>
        (schedule.trialClasses[trial.id] ?? []).map(cls => ({ id: cls.id, trialId: trial.id }))
      ),
    [schedule.trialClasses, showTrials]
  );
  const paperwork = useShowClassPaperwork({
    showId,
    trials: trialDates,
    classes: scheduleClasses,
    entries,
    returnTo,
  });

  const releasedAtByClassId = useMemo(
    () =>
      new Map(
        (paperwork.classRows ?? []).map(cls => [cls.id, cls.results_released_at ?? null] as const)
      ),
    [paperwork.classRows]
  );

  // The stored paper check, as the class rows hold it: a HINT that enables Release. The click asks
  // the server (ResultsTab.handleRelease), which is what decides.
  const verifiedByClassId = useMemo(
    () =>
      paperwork.classRows
        ? new Map(
            paperwork.classRows.map(
              cls =>
                [
                  cls.id,
                  { at: cls.results_verified_at ?? null, by: cls.results_verified_by ?? null },
                ] as const
            )
          )
        : undefined,
    [paperwork.classRows]
  );

  const builtRows = useMemo<ResultsClassRow[]>(
    () =>
      buildResultsClassRows({
        trials: showTrials,
        trialClasses: schedule.trialClasses,
        releasedAtByClassId,
        ...(verifiedByClassId ? { verifiedByClassId } : {}),
        entries,
        paperworkByClassId: paperwork.byClassId,
        paperworkAvailable: paperwork.available,
        printHrefFor: (classId, trialId, reportId) =>
          getCockpitReportHref({
            reportId,
            scope: { kind: 'class', showId, trialId, classId },
            returnTo,
          }),
      }),
    [
      entries,
      paperwork.available,
      paperwork.byClassId,
      releasedAtByClassId,
      returnTo,
      schedule.trialClasses,
      showId,
      showTrials,
      verifiedByClassId,
    ]
  );

  // Which key the show ranks by (points at nationals, faults otherwise): the coin flip dialog
  // groups ties on it. Unknown until the replicated show row is read.
  const showQuery = useQuery({
    queryKey: showRankingKeyQueryKey(showId),
    queryFn: () => replicatedShowsTable.getShowById(showId),
    enabled: Boolean(showId),
    // A replica read: it must run offline too (show-day data), like the ringside menu's show read.
    networkMode: 'always',
  });
  const isNationals = showQuery.data ? showQuery.data.isNationals === true : null;
  // The show row is replicated: a later sync (or the row arriving after a first empty read) must
  // repair the cached null. Never on the initial emit.
  useEffect(() => {
    if (!showId) return;
    return replicatedShowsTable.subscribe(
      () => void queryClient.invalidateQueries({ queryKey: showRankingKeyQueryKey(showId) }),
      { emitCurrent: false }
    );
  }, [queryClient, showId]);

  const noTrials = schedule.hasConfirmedSnapshot && showTrials.length === 0;
  const combined = combineReads([
    {
      key: 'schedule',
      critical: true,
      hasData: schedule.hasConfirmedSnapshot,
      isLoading: schedule.readPending,
      isError: schedule.readFailed,
    },
    {
      key: 'scores',
      critical: true,
      hasData: entriesKnown,
      isLoading: entriesQuery.isLoading,
      isError: entriesQuery.isError,
    },
    // Not critical: the tab renders without it. Only the coin flip needs it, and says so.
    {
      key: 'ranking-key',
      critical: false,
      hasData: isNationals !== null,
      isLoading: showQuery.isLoading,
      isError: showQuery.isError,
    },
    ...paperwork.reads,
    // Release state is read from the class rows; without them every class would read unreleased.
    ...paperwork.reads
      .filter(read => read.key === 'class-rows')
      .map(read => ({
        ...read,
        key: 'release-state',
        // The class read is disabled when the show has no trials. A settled schedule with none
        // is a confirmed empty show, not a missing read.
        hasData: read.hasData || noTrials,
        critical: !noTrials,
      })),
  ]);

  return {
    rows: builtRows,
    /** The scores behind the rows, for the nationals leaderboard (MYK9-1516). */
    entries,
    /** The show's first day, which the leaderboard counts competition days from. */
    showStartDate: showQuery.data?.startDate ?? null,
    /** The show ranks by points (nationals); null while the show row is unread. */
    isNationals,
    /** Whether `isNationals` can be trusted: 'unavailable' = the show row could not be read. */
    rankingKeyState: (isNationals !== null
      ? 'ready'
      : combined.unavailableKeys.includes('ranking-key')
        ? 'unavailable'
        : 'loading') as 'ready' | 'loading' | 'unavailable',
    trials: showTrials,
    readState: combined.state,
    /** A background refresh failed but earlier data is still shown. */
    refreshFailed: combined.refreshFailed,
    /** Print status could not be read, so print rows say so instead of vanishing. */
    paperworkAvailable: paperwork.available,
    /** Refetches every sub-read. */
    retry: () => {
      void schedule.retry();
      void entriesQuery.refetch();
      void showQuery.refetch();
      paperwork.refetch();
    },
  };
}
