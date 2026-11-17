import { useMemo } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { getEntriesByShowFromReplication } from '@/services/database/entries';
import { getTrialsByShow } from '@/services/database/trials';
import {
  replicatedDogRegistrationsTable,
  replicatedDogsTable,
  replicatedEntriesTable,
  replicatedTrialsTable,
} from '@/services/replication';
import { cacheStrategies, queryKeys } from '@/lib/queryClient';
import type { ReportDbEntry } from '@/lib/reports/types';
import type { DbClass, DbTrial } from '@/types/database-mappings';
import { hydrateReportEntries, overlayReportHydration } from './reportEntryHydration';
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
 * Two reads, because they change at different rates:
 * - the replica rows (entries, trials), re-read on entries, dogs and trials notices;
 * - the hydration (`hydrateReportEntries`, the function Reports runs: junior profile, catalog
 *   profile, registrations, which can hit the network), keyed by the sorted dog and handler ids
 *   and re-run only on dogs and dog-registrations notices, so a score never refetches it.
 * Rows show unhydrated until the hydration lands (no "not loaded" gate: a brief wrong answer
 * corrects itself). Notices are debounced and never cancel a fetch already in flight.
 * `networkMode: 'always'` so a cold offline load still reads the device copy.
 */
export function usePrintedSheetEntries(showId: string) {
  const queryClient = useQueryClient();
  // Stable arrays, built on first render (not at import) so a test that mocks the replication
  // module without these tables fails only if it renders this hook.
  const rowNoticeSources = useMemo(
    () => [replicatedEntriesTable, replicatedDogsTable, replicatedTrialsTable],
    []
  );
  const hydrationNoticeSources = useMemo(
    () => [replicatedDogsTable, replicatedDogRegistrationsTable],
    []
  );
  const enabled = Boolean(showId);
  const rowsKey = queryKeys.printedSheetEntries(showId);
  const hydrationKey = queryKeys.printedSheetHydration(showId);

  useReplicaNotices(
    enabled,
    rowNoticeSources,
    () => {
      void queryClient.invalidateQueries({ queryKey: rowsKey }, { cancelRefetch: false });
      void queryClient.invalidateQueries(
        { queryKey: queryKeys.showTrials(showId) },
        { cancelRefetch: false }
      );
    },
    NOTICE_DEBOUNCE_MS
  );
  useReplicaNotices(
    enabled,
    hydrationNoticeSources,
    () => void queryClient.invalidateQueries({ queryKey: hydrationKey }, { cancelRefetch: false }),
    NOTICE_DEBOUNCE_MS
  );
  useHandlerPeopleRevisionChange(() => {
    if (!enabled) return;
    void queryClient.invalidateQueries({ queryKey: rowsKey }, { cancelRefetch: false });
    void queryClient.invalidateQueries({ queryKey: hydrationKey }, { cancelRefetch: false });
  });

  const rowsQuery = useQuery({
    queryKey: rowsKey,
    queryFn: async () => {
      const { data, error } = await getEntriesByShowFromReplication(showId);
      if (error) throw error;
      return (data ?? []) as ReportDbEntry[];
    },
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

  const rows = rowsQuery.data;
  const idsKey = useMemo(() => {
    if (!rows) return '';
    const dogs = new Set<string>();
    const handlers = new Set<string>();
    for (const row of rows) {
      if (row.dog_id) dogs.add(row.dog_id);
      const handlerId = (row as { handler_id?: string | null }).handler_id;
      if (handlerId) handlers.add(handlerId);
    }
    return `${[...dogs].sort().join(',')}|${[...handlers].sort().join(',')}`;
  }, [rows]);

  const hydrationQuery = useQuery({
    queryKey: [...hydrationKey, idsKey],
    queryFn: () => hydrateReportEntries(rows ?? []),
    enabled: enabled && rows !== undefined,
    placeholderData: keepPreviousData,
    ...READ_OPTIONS,
  });

  const data = useMemo<PrintedSheetData | undefined>(() => {
    if (!rows || !trialsQuery.data || !classesQuery.data) return undefined;
    return {
      entries: hydrationQuery.data
        ? overlayReportHydration(rows, hydrationQuery.data.entries)
        : rows,
      trials: trialsQuery.data as unknown as DbTrial[],
      classes: classesQuery.data as unknown as DbClass[],
      registrationsReadComplete: hydrationQuery.data?.registrationsReadComplete ?? true,
    };
  }, [classesQuery.data, hydrationQuery.data, rows, trialsQuery.data]);

  return {
    data,
    isError: rowsQuery.isError || trialsQuery.isError || classesQuery.isError,
    isFetching: rowsQuery.isFetching || hydrationQuery.isFetching,
  };
}
