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
import { useLocation } from 'react-router-dom';
import { CLASS_STATUS } from '@myk9/core';

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
      // The shape Overview feeds this builder, so a print confirmed there reads as current here.
      classes: showTrials.flatMap(trial =>
        (schedule.trialClasses[trial.id] ?? []).map(cls => ({
          id: cls.id,
          trial_id: trial.id,
          trialId: trial.id,
          element: cls.element,
          level: cls.level,
          section: cls.section,
          status: cls.status || CLASS_STATUS.SCHEDULED,
        }))
      ) as unknown as DbClass[],
      trials: showTrials.map(trial => ({ id: trial.id, trialDate: trial.trialDate })),
      entries: entries as unknown as DbEntry[],
      records: prints.data ?? [],
      recordsUnavailable: prints.isError || prints.syncFailed,
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
    entriesQuery.data,
    prints.data,
    prints.isError,
    prints.syncFailed,
    releasedAtByClassId,
    returnTo,
    schedule.trialClasses,
    showId,
    showTrials,
  ]);

  const readState: ResultsTabReadState = schedule.readFailed
    ? 'failed'
    : entriesQuery.isError
      ? 'failed'
      : !schedule.hasConfirmedSnapshot && schedule.readPending
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
    printHistoryUnavailable: prints.isError || prints.syncFailed,
    retry: () => {
      void schedule.retry();
      void entriesQuery.refetch();
    },
  };
}
