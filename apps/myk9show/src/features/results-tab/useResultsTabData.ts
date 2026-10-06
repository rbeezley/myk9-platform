/**
 * The Results tab's reads, gathered in one place (MYK9-1031).
 *
 * This hook assembles nothing itself. Every part is a shared builder:
 *  - the schedule: the replicated trial store (`useShowDeskScheduleRead`, Overview);
 *  - release stamps: the replicated class store (`ResultsControlPage`). The store reports no read
 *    status of its own, so it cannot contribute a failure here;
 *  - the dogs, scores and handler names: `useSecretaryShowEntriesQuery`, the cache the class page's
 *    staff run sheet reads, whose rows carry the canonical `handler_identity`;
 *  - print state: `useShowClassPaperwork`, the class rows Reports fingerprints plus the replicated
 *    confirmations.
 *
 * `combineReads` folds every sub-read into ONE state, so a failed read is never an empty one
 * (LESSONS `disabled-query false zero`) and Retry refetches all of them.
 */
import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';

import { combineReads, type CombinedReadState } from '@/features/_shared/combineReads';
import { useSecretaryShowEntriesQuery } from '@/hooks/queries/useEntriesDatabase';
import { getCockpitReportHref } from '@/features/show-map/cockpit/cockpitRoutes';
import { useShowClassPaperwork } from '@/features/show-map/cockpit/useShowClassPaperwork';
import { getShowDeskEntriesAvailability } from '@/pages/secretary/showDeskEntryAvailability';
import { useShowDeskScheduleRead } from '@/pages/secretary/useShowDeskScheduleRead';
import { useClassStore } from '@/store/classStore';
import { buildResultsClassRows, type ResultsClassRow } from './buildResultsClassRows';

const NO_ENTRIES: never[] = [];

export type ResultsTabReadState = CombinedReadState;

export function useResultsTabData(showId: string) {
  const location = useLocation();
  const schedule = useShowDeskScheduleRead();
  const { classes: storeClasses } = useClassStore();
  const entriesQuery = useSecretaryShowEntriesQuery(showId, Boolean(showId));
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
  const paperwork = useShowClassPaperwork({ showId, trials: trialDates, entries, returnTo });

  const releasedAtByClassId = useMemo(
    () => new Map(storeClasses.map(cls => [cls.id, cls.results_released_at ?? null] as const)),
    [storeClasses]
  );

  const rows = useMemo<ResultsClassRow[]>(
    () =>
      buildResultsClassRows({
        trials: showTrials,
        trialClasses: schedule.trialClasses,
        releasedAtByClassId,
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
    ]
  );

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
    ...paperwork.reads,
  ]);

  return {
    rows,
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
      paperwork.refetch();
    },
  };
}
