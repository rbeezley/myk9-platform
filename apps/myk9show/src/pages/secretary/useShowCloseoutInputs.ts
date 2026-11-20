import { useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useFastShowDetails } from '@/hooks/useFastShowDetails';
import { useSecretaryShowEntriesQuery } from '@/hooks/queries/useEntriesDatabase';
import { useResultsSentCheck } from '@/features/show-closeout/useResultsSentCheck';
import { useCloseoutFlaggedPulls } from '@/features/show-closeout/useCloseoutFlaggedPulls';
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
import { queryKeys } from '@/lib/queryClient';
import { replicatedEntriesTable } from '@/services/replication';
import {
  EMPTY_ENTRIES,
  getShowDeskEntriesAvailability,
  tallyEntriesByClass,
} from './showDeskEntryAvailability';
import { useShowDeskCollectionWindow } from './useShowDeskCollectionWindow';
import { useShowDeskScheduleRead } from './useShowDeskScheduleRead';

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
  // MYK9-2145: the Check-in desk writes the replica (offline too), so a pull confirmed there must
  // reach this step: re-read on mount, and on every replica notice, as the Results tab does
  // (`useResultsTabData`). Never on the initial emit.
  const queryClient = useQueryClient();
  const entriesQuery = useSecretaryShowEntriesQuery(showId ?? '', Boolean(showId), {
    rereadOnMount: true,
  });
  useEffect(() => {
    if (!showId) return;
    return replicatedEntriesTable.subscribe(
      () => void queryClient.invalidateQueries({ queryKey: queryKeys.showEntries(showId) }),
      { emitCurrent: false }
    );
  }, [queryClient, showId]);
  // MYK9-2180: the close step's one flag read (card, close action and its confirmation), derived
  // from this same entries query, as the Results tab's Finish list derives its own.
  const flaggedPulls = useCloseoutFlaggedPulls(entriesQuery);
  const incidentsQuery = useQuery({
    queryKey: showIncidentCloseoutQueryKey(showId ?? ''),
    queryFn: () => listShowIncidentCloseout(showId ?? ''),
    enabled: Boolean(showId),
  });

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
    () =>
      showTrials.map(trial => ({
        id: trial.id,
        status: trial.status,
        registryId: trial.registryId,
      })),
    [showTrials]
  );
  const entryTallies = useMemo(() => tallyEntriesByClass(showEntries), [showEntries]);
  const classes = useMemo<CloseoutClassSummary[]>(
    () =>
      showTrials.flatMap(trial =>
        (schedule.trialClasses[trial.id] ?? []).map(cls => ({
          id: cls.id,
          trialId: trial.id,
          status: cls.status || CLASS_STATUS.SCHEDULED,
          entryCount: entriesKnown ? (entryTallies.get(cls.id)?.total ?? 0) : null,
          scoredCount: entriesKnown ? (entryTallies.get(cls.id)?.scored ?? 0) : null,
          pendingCount: entriesKnown ? (entryTallies.get(cls.id)?.pending ?? 0) : null,
        }))
      ),
    [entriesKnown, entryTallies, schedule.trialClasses, showTrials]
  );
  // The same read the Finish the show list makes, so the two cannot disagree (MYK9-2078).
  // `submissions` is `null` when not read (loading, failed or paused offline): the readiness check
  // lists that as its own concern rather than reading it as "none".
  const { submissions, scoreChanges } = useResultsSentCheck(
    showId ?? '',
    schedule.hasConfirmedSnapshot ? classes : null
  );
  const incidentsData = incidentsQuery.data;
  const incidents = useMemo(
    () => (incidentsData ? summarizeShowIncidents(incidentsData) : null),
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
    scoreChanges,
    deskWindow,
    flaggedPulls,
  };
}
