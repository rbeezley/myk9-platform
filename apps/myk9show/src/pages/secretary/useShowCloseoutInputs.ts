import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useFastShowDetails } from '@/hooks/useFastShowDetails';
import { useSecretaryShowEntriesQuery } from '@/hooks/queries/useEntriesDatabase';
import { useResultSubmissions } from '@/hooks/mutations/useResultSubmission';
import {
  listShowIncidentCloseout,
  showIncidentCloseoutQueryKey,
} from '@/services/database/show-incidents';
import { summarizeShowIncidents } from '@/features/show-workbench/showIncidents';
import type {
  CloseoutClassSummary,
  CloseoutTrialSummary,
} from '@/features/show-workbench/showCloseOutShow';
import type { ShowDayReconciliationEntry } from '@/features/show-workbench/showDayReconciliationSummary';
import { CLASS_STATUS } from '@myk9/core';
import {
  EMPTY_ENTRIES,
  getShowDeskEntriesAvailability,
  tallyEntriesByClass,
} from './showDeskEntryAvailability';
import { useShowDeskCollectionWindow } from './useShowDeskCollectionWindow';
import { useShowDeskScheduleRead } from './useShowDeskScheduleRead';

const EMPTY_INCIDENTS: Awaited<ReturnType<typeof listShowIncidentCloseout>> = [];
const EMPTY_SUBMISSIONS: NonNullable<ReturnType<typeof useResultSubmissions>['data']> = [];

/**
 * Everything "Close the show" (Results step 3, MYK9-954) needs, read from the
 * same sources Show Day's closeout tool read: the show, the trial store's
 * schedule, the show-scoped entries query, incidents and result submissions.
 *
 * Counts follow Show Day's rule: when the entries read has not produced data,
 * per-class counts are `null` (unknown), never 0.
 */
export function useShowCloseoutInputs(showId: string | undefined) {
  const { show, isLoading: showLoading } = useFastShowDetails(showId);
  const schedule = useShowDeskScheduleRead();
  const entriesQuery = useSecretaryShowEntriesQuery(showId ?? '', Boolean(showId));
  const submissionsQuery = useResultSubmissions(showId ?? '');
  const incidentsQuery = useQuery({
    queryKey: showIncidentCloseoutQueryKey(showId ?? ''),
    queryFn: () => listShowIncidentCloseout(showId ?? ''),
    enabled: Boolean(showId),
  });
  const incidentsData = incidentsQuery.data;
  const submissions = submissionsQuery.data ?? EMPTY_SUBMISSIONS;
  // The readiness check reads an empty incident list as "nothing reportable"
  // and an empty submissions list as "nothing submitted", so the close action
  // waits until both have actually been read.
  const closeoutChecks: 'read' | 'pending' | 'failed' =
    incidentsData !== undefined && submissionsQuery.data !== undefined
      ? 'read'
      : incidentsQuery.isError || submissionsQuery.isError
        ? 'failed'
        : 'pending';
  const retryCloseoutChecks = () => {
    void incidentsQuery.refetch();
    void submissionsQuery.refetch();
  };

  const showEntries = entriesQuery.data ?? EMPTY_ENTRIES;
  // No cast: SecretaryEntry must carry every field the closeout card reads.
  const entries: ShowDayReconciliationEntry[] = showEntries;
  const { entriesKnown, entriesUnavailable } = getShowDeskEntriesAvailability({
    data: entriesQuery.data,
    isLoading: entriesQuery.isLoading,
    isError: entriesQuery.isError,
    isEnabled: Boolean(showId),
  });

  const showTrials = useMemo(
    () => (showId ? schedule.trials.filter(trial => trial.showId === showId) : []),
    [schedule.trials, showId]
  );
  const trials = useMemo<CloseoutTrialSummary[]>(
    () => showTrials.map(trial => ({ id: trial.id, status: trial.status })),
    [showTrials]
  );
  const entryTallies = useMemo(() => tallyEntriesByClass(showEntries), [showEntries]);
  const classes = useMemo<CloseoutClassSummary[]>(
    () =>
      showTrials.flatMap(trial =>
        (schedule.trialClasses[trial.id] ?? []).map(cls => ({
          id: cls.id,
          status: cls.status || CLASS_STATUS.SCHEDULED,
          entryCount: entriesKnown ? (entryTallies.get(cls.id)?.total ?? 0) : null,
          scoredCount: entriesKnown ? (entryTallies.get(cls.id)?.scored ?? 0) : null,
        }))
      ),
    [entriesKnown, entryTallies, schedule.trialClasses, showTrials]
  );
  const incidents = useMemo(
    () => summarizeShowIncidents(incidentsData ?? EMPTY_INCIDENTS),
    [incidentsData]
  );
  const deskWindow = useShowDeskCollectionWindow(show?.startDate, show?.endDate, showTrials);

  return {
    show,
    showLoading,
    schedule,
    entries,
    entriesLoading: entriesQuery.isLoading,
    entriesFailed: entriesQuery.isError && entries.length === 0,
    entriesUnavailable,
    retryEntries: () => void entriesQuery.refetch(),
    trials,
    classes,
    incidents,
    submissions,
    closeoutChecks,
    retryCloseoutChecks,
    deskWindow,
  };
}
