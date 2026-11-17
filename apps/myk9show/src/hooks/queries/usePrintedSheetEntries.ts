import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getTrialsByShow } from '@/services/database/trials';
import {
  replicatedArmbandsTable,
  replicatedClassesTable,
  replicatedDogRegistrationsTable,
  replicatedDogsTable,
  replicatedEntriesTable,
  replicatedTrialsTable,
} from '@/services/replication';
import { cacheStrategies, queryKeys } from '@/lib/queryClient';
import type { ReportDbEntry } from '@/lib/reports/types';
import type { DbClass, DbTrial } from '@/types/database-mappings';
import { readReportEntries } from './readReportEntries';
import { useHandlerPeopleRevisionChange, useReplicaNotices } from './useReplicaNotices';
import { useShowClassRows } from './useShowClassRows';

/** A burst of notices (one score writes several tables) becomes one refetch. */
const NOTICE_DEBOUNCE_MS = 500;

const READ_OPTIONS = { ...cacheStrategies.moderate, networkMode: 'always' } as const;

export interface PrintedSheetData {
  entries: ReportDbEntry[];
  trials: DbTrial[];
  classes: DbClass[];
  /** False when the registrations read did not complete; the numbers are then unknown, not empty. */
  registrationsReadComplete: boolean;
}

/**
 * The show's entries, trials and classes as the printed sheets (check-in sheet, scoresheet) read
 * them, so the class card's "changed since printing" fingerprint and the PDF are built from one
 * set of rows (MYK9-2103).
 *
 * One query, and its function is Reports' own (`readReportEntries`: replica read, then
 * `hydrateReportEntries`, with the handler-people replay), invalidated by the same notices
 * (entries, dogs, trials, classes, armbands) and the same handler-people revision as
 * `useReportData`. The only difference is a debounce on replica notices, so a burst (one score
 * writes several tables) while Show Desk is open becomes one re-read. Parity holds by
 * construction, not by cache keys. The read never runs the network refresh (Show Desk's own sync
 * keeps the replica current), and `networkMode: 'always'` lets a cold offline load read the
 * device copy.
 */
export function usePrintedSheetEntries(showId: string) {
  const queryClient = useQueryClient();
  // Stable array, built on first render (not at import) so a test that mocks the replication
  // module without these tables fails only if it renders this hook.
  const noticeSources = useMemo(
    () => [
      replicatedTrialsTable,
      replicatedClassesTable,
      replicatedEntriesTable,
      replicatedDogsTable,
      replicatedDogRegistrationsTable,
      replicatedArmbandsTable,
    ],
    []
  );
  const enabled = Boolean(showId);
  const entriesKey = queryKeys.printedSheetEntries(showId);
  // A replica notice waiting out its debounce: the rows below are about to be re-read.
  const [noticePending, setNoticePending] = useState(false);

  useReplicaNotices(
    enabled,
    noticeSources,
    () => {
      for (const queryKey of [
        queryKeys.showTrials(showId),
        queryKeys.showClasses(showId),
        entriesKey,
      ]) {
        void queryClient.invalidateQueries({ queryKey });
      }
    },
    NOTICE_DEBOUNCE_MS,
    setNoticePending
  );
  useHandlerPeopleRevisionChange(() => {
    if (enabled) void queryClient.invalidateQueries({ queryKey: entriesKey });
  });

  const entriesQuery = useQuery({
    queryKey: entriesKey,
    queryFn: () =>
      readReportEntries({ showId, trialId: 'all', classId: 'all', replicaNoticed: true }),
    enabled,
    ...READ_OPTIONS,
  });

  const trialsQuery = useQuery({
    queryKey: queryKeys.showTrials(showId),
    queryFn: async () => {
      const { data, error } = await getTrialsByShow(showId);
      if (error) throw error;
      return data ?? [];
    },
    enabled,
    ...READ_OPTIONS,
  });
  const trialIds = useMemo(
    () => ((trialsQuery.data ?? []) as Array<{ id: string }>).map(trial => trial.id),
    [trialsQuery.data]
  );
  const classesQuery = useShowClassRows({
    showId,
    trialId: 'all',
    trialIds,
    enabled: trialsQuery.isSuccess,
  });

  const read = entriesQuery.data;
  const data = useMemo<PrintedSheetData | undefined>(() => {
    if (!read || !trialsQuery.data || !classesQuery.data) return undefined;
    return {
      entries: read.entries,
      trials: trialsQuery.data as unknown as DbTrial[],
      classes: classesQuery.data as unknown as DbClass[],
      registrationsReadComplete: read.registrationsReadComplete,
    };
  }, [classesQuery.data, read, trialsQuery.data]);

  return {
    data,
    isError: entriesQuery.isError || trialsQuery.isError || classesQuery.isError,
    /** Any of the three reads is in flight. */
    isFetching: entriesQuery.isFetching || trialsQuery.isFetching || classesQuery.isFetching,
    /**
     * A replica notice has arrived and its re-read has not started. A print must not be confirmed
     * against these rows in that window (MYK9-2103).
     */
    noticePending,
  };
}
