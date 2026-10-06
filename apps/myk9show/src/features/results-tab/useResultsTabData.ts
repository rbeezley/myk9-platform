/**
 * The Results tab's reads, gathered in one place (MYK9-1031).
 *
 * Every source here is one the secretary's other surfaces already use, so this
 * adds no new read path (CLAUDE.md, offline-first):
 *  - the schedule: the replicated trial store (`useShowDeskScheduleRead`, Overview);
 *  - release stamps: the replicated class store (`ResultsControlPage`);
 *  - the dogs and their scores: `useSecretaryShowEntriesQuery`, the cache the class
 *    page's staff run sheet reads;
 *  - print confirmations: the replicated paperwork table (`useShowPaperworkPrints`).
 *
 * A read that has not produced data is reported as such. An empty class list from
 * a paused or failed read must never render as "no classes need you" (LESSONS
 * `disabled-query false zero`).
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import { cacheStrategies, queryKeys } from '@/lib/queryClient';
import { getClassesByTrialId } from '@/services/database/classes';

import { useSecretaryShowEntriesQuery } from '@/hooks/queries/useEntriesDatabase';
import { buildClassPaperworkMap } from '@/features/show-map/cockpit/buildClassPaperworkMap';
import { useShowPaperworkPrints } from '@/features/show-map/cockpit/useShowPaperworkPrints';
import { getShowDeskEntriesAvailability } from '@/pages/secretary/showDeskEntryAvailability';
import { useShowDeskScheduleRead } from '@/pages/secretary/useShowDeskScheduleRead';
import { useClassStore } from '@/store/classStore';
import type { DbClass, DbEntry } from '@/types/database-mappings';
import { buildResultsClassRows, type ResultsClassRow } from './buildResultsClassRows';

const NO_ENTRIES: never[] = [];

export type ResultsTabReadState = 'loading' | 'ready' | 'failed' | 'unavailable';

export function useResultsTabData(showId: string) {
  const location = useLocation();
  const schedule = useShowDeskScheduleRead();
  const { classes: storeClasses } = useClassStore();
  const entriesQuery = useSecretaryShowEntriesQuery(showId, Boolean(showId));
  const prints = useShowPaperworkPrints(showId);
  const { entriesKnown, entriesUnavailable } = getShowDeskEntriesAvailability({
    data: entriesQuery.data,
    isLoading: entriesQuery.isLoading,
    isError: entriesQuery.isError,
    isEnabled: Boolean(showId),
  });
  const trialIds = useMemo(
    () => schedule.trials.filter(trial => trial.showId === showId).map(trial => trial.id),
    [schedule.trials, showId]
  );
  const classFactsQuery = useQuery({
    queryKey: [...queryKeys.showClasses(showId), 'results-tab', trialIds],
    queryFn: async () => {
      const results = await Promise.all(trialIds.map(id => getClassesByTrialId(id)));
      const failed = results.find(result => result.error);
      if (failed?.error) throw failed.error;
      return results.flatMap(({ data }) => data ?? []);
    },
    enabled: Boolean(showId) && trialIds.length > 0,
    ...cacheStrategies.moderate,
    networkMode: 'always',
  });
  // Without the class rows the fingerprints cannot be built, so "not printed" is not a finding.
  const printHistoryUnavailable =
    prints.isError || prints.syncFailed || classFactsQuery.data === undefined;
  const returnTo = `${location.pathname}${location.search}`;

  const showTrials = useMemo(
    () => schedule.trials.filter(trial => trial.showId === showId),
    [schedule.trials, showId]
  );

  const releasedAtByClassId = useMemo(
    () => new Map(storeClasses.map(cls => [cls.id, cls.results_released_at ?? null] as const)),
    [storeClasses]
  );

  const rows = useMemo<ResultsClassRow[]>(() => {
    const entries = entriesQuery.data ?? NO_ENTRIES;
    const paperworkByClassId = buildClassPaperworkMap({
      showId,
      // The class rows Reports fingerprints (`getClassesByTrialId`), not a hand-picked subset, so a
      // print confirmed on Reports reads as current here.
      classes: (classFactsQuery.data ?? []) as unknown as DbClass[],
      trials: showTrials.map(trial => ({ id: trial.id, trialDate: trial.trialDate })),
      entries: entries as unknown as DbEntry[],
      records: prints.data ?? [],
      recordsUnavailable: printHistoryUnavailable,
      returnTo,
    });
    return buildResultsClassRows({
      trials: showTrials,
      trialClasses: schedule.trialClasses,
      releasedAtByClassId,
      entries,
      paperworkByClassId,
    });
  }, [
    classFactsQuery.data,
    entriesQuery.data,
    prints.data,
    printHistoryUnavailable,
    releasedAtByClassId,
    returnTo,
    schedule.trialClasses,
    showId,
    showTrials,
  ]);

  // A failed background refresh keeps the confirmed schedule and cached entries on screen with a
  // warning (as ResultsControlPage does); only a read with nothing to show is a full failure.
  const hasSchedule = schedule.hasConfirmedSnapshot;
  const hasEntries = entriesKnown;
  const refreshFailed = (schedule.readFailed || entriesQuery.isError) && hasSchedule && hasEntries;
  const readState: ResultsTabReadState =
    !refreshFailed && (schedule.readFailed || entriesQuery.isError)
      ? 'failed'
      : !hasSchedule && schedule.readPending
        ? 'loading'
        : entriesQuery.isLoading
          ? 'loading'
          : entriesUnavailable || !entriesKnown
            ? 'unavailable'
            : 'ready';

  return {
    rows,
    trials: showTrials,
    readState,
    /** The paperwork history could not be read, so "not printed" is not a finding. */
    printHistoryUnavailable,
    refreshFailed,
    retry: () => {
      void schedule.retry();
      void entriesQuery.refetch();
    },
  };
}
