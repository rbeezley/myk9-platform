import { useMemo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getTrialsByShow } from '@/services/database/trials';
import { useShowClassRows } from './useShowClassRows';
import { queryKeys, cacheStrategies } from '@/lib/queryClient';
import type { Show } from '@/types/show-types';
import {
  replicatedArmbandsTable,
  replicatedClassesTable,
  replicatedDogRegistrationsTable,
  replicatedDogsTable,
  replicatedEntriesTable,
  replicatedTrialsTable,
} from '@/services/replication';
import { useHandlerPeopleRevisionChange, useReplicaNotices } from './useReplicaNotices';
import { readReportEntries } from './readReportEntries';
import { readinessOf, resolveReportReadiness, type ReportDataState } from './reportReadiness';

export type { ReportDataState } from './reportReadiness';

export interface UseReportDataOptions {
  show: Show | null;
  trialId: string | 'all';
  classId: string | 'all';
}

/**
 * MYK9-721: all three reads are replica-first -- IndexedDB, with PostgREST only
 * as the cold-store fallback and the empty-result verifier. React Query's
 * default `networkMode: 'online'` PAUSES a query offline without ever calling
 * it, so on a cold offline load the replica was never read and every report
 * was refused although the rows were on the device. 'always' lets the read run;
 * a replica that has never synced still cannot pass for an empty report,
 * because the read services verify an empty local result online and fail when
 * they cannot (`errorOnOnlineVerificationFailure`), which surfaces as `error`.
 * Same shape as useAtShowClassList / useHasAnyEntryForShow.
 */
const REPLICA_READ_OPTIONS = {
  ...cacheStrategies.moderate,
  networkMode: 'always',
} as const;

export { hydrateHandlerJuniorProfilesForTest } from './reportEntryHydration';

/**
 * Fetches trials, classes, and entries for report generation.
 * Show data comes from the store (already loaded via replication).
 */
export function useReportData({ show, trialId, classId }: UseReportDataOptions) {
  const showId = show?.id ?? '';
  const queryClient = useQueryClient();
  const reportQueryKey = useMemo(
    () => queryKeys.reportData(showId, trialId, classId),
    [classId, showId, trialId]
  );

  // Set by a replica notice, consumed by the next entries read. See below.
  const replicaNoticedRef = useRef(false);

  // MYK9-721: the replica is the source of every row here, so a change to it is
  // a change to the report. Re-read on every notice from the tables these reads
  // join (trials, classes, entries, dogs), as useAtShowClassList does, and never
  // on the initial emit. The re-read after a notice skips the network refresh:
  // the replica already holds the change, and a refresh that itself writes rows
  // would notify again and restart the read forever. The refetch is what makes
  // the page read `refreshing`, so Print waits for the fresh rows, offline too.
  // Built on first render, not at import, so mocks of the replication module stay partial.
  const noticeSources = useMemo(
    () =>
      showId
        ? [
            replicatedTrialsTable,
            replicatedClassesTable,
            replicatedEntriesTable,
            replicatedDogsTable,
            replicatedDogRegistrationsTable,
            replicatedArmbandsTable,
          ]
        : [],
    [showId]
  );
  useReplicaNotices(Boolean(showId), noticeSources, () => {
    replicaNoticedRef.current = true;
    for (const queryKey of [
      queryKeys.showTrials(showId),
      queryKeys.showClasses(showId),
      ['reports', showId],
    ]) {
      void queryClient.invalidateQueries({ queryKey });
    }
  });

  useHandlerPeopleRevisionChange(() => {
    if (showId) void queryClient.invalidateQueries({ queryKey: reportQueryKey });
  });

  const trialsQuery = useQuery({
    queryKey: queryKeys.showTrials(showId),
    queryFn: async () => {
      const { data, error } = await getTrialsByShow(showId);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!showId,
    ...REPLICA_READ_OPTIONS,
  });

  // A show detail can already carry its replicated trials while this scoped
  // query is paused or its local trial read is still cold. Keep one resolved
  // trial set for every downstream consumer so controls cannot advertise a
  // trial that previews/classes did not load.
  const hasCurrentReportTrials = trialsQuery.data !== undefined && !trialsQuery.isPlaceholderData;
  const reportTrials = hasCurrentReportTrials
    ? trialsQuery.data
    : show?.trials?.length
      ? show.trials.map((trial, index) => ({
          id: trial.id,
          show_id: showId,
          name: trial.name,
          date: trial.date,
          // `trials.trial_number` is a TEXT column (MYK9-282) -- keep the
          // string as-is. Coercing through `Number(...) || 0` used to silently
          // zero out every non-numeric value (a name/label, an AKC event
          // number) and crashed dayTrialNumber's `.trim()` read (MYK9-827).
          trial_number: trial.trialNumber ?? null,
          timezone: trial.timezone ?? null,
          registry_id: trial.registryId ?? null,
          // MYK9-827: same ordinal source as the warm path (trials.display_order),
          // now carried onto ShowTrial by mapDatabaseToShow / mapReplicatedTrialToRow
          // so buildTrialReportProps's computeDayTrialNumber sorts same-day
          // trials the same way here. Falls back to this array's position
          // (already date-sorted upstream) only for a Show snapshot cached
          // before displayOrder started round-tripping.
          display_order: trial.displayOrder ?? index + 1,
        }))
      : undefined;
  const selectedTrialIsInShow =
    trialId === 'all' ||
    (reportTrials !== undefined && reportTrials.some(trial => trial.id === trialId));

  const classesQuery = useShowClassRows({
    showId,
    trialId,
    trialIds: ((reportTrials ?? []) as Array<{ id: string }>).map(trial => trial.id),
    enabled: selectedTrialIsInShow && (trialsQuery.isSuccess || reportTrials !== undefined),
  });

  const entriesQuery = useQuery({
    queryKey: reportQueryKey,
    queryFn: () => {
      const replicaNoticed = replicaNoticedRef.current;
      replicaNoticedRef.current = false;
      return readReportEntries({ showId, trialId, classId, replicaNoticed });
    },
    enabled:
      selectedTrialIsInShow &&
      classesQuery.isSuccess &&
      (classId === 'all' ||
        Boolean(
          classesQuery.data?.some(
            reportClass =>
              reportClass.id === classId &&
              (trialId === 'all' || reportClass.trial_id === trialId) &&
              reportTrials?.some(trial => trial.id === reportClass.trial_id)
          )
        )),
    ...REPLICA_READ_OPTIONS,
  });

  const entries = entriesQuery.data?.entries;
  // INTENT: registration hydration is ancillary to the cached show/trial/
  // class/entry rows needed by check-in sheets and scoresheets. Keep those
  // reports printable when registration reads are incomplete; the emergency
  // packet gates on this flag at its own safety boundary.
  const registrationsReadComplete = entriesQuery.data?.registrationsReadComplete ?? true;
  const catalogProfilesReadComplete = entriesQuery.data?.catalogProfilesReadComplete ?? true;
  // Why this is an enum and not two booleans: every report on this page can end
  // up as PAPER, and several React Query states all present as "not loading,
  // not erroring, no data" -- which `(entries ?? [])` then reads as "this class
  // has no dogs". DISABLED-UPSTREAM (classes waits on trials, entries on
  // classes) and PLACEHOLDER (`placeholderData: previousData => previousData`
  // on the application client serves the PREVIOUS trial's rows under the new
  // trial's key) are two of them; the rule table in `resolveReportReadiness`
  // names the rest. Callers must not be able to reach a print or a PDF download
  // without having answered which one they are in, so the state is one value
  // they have to read rather than a condition they can forget to add.
  const selectedClassIsInScope =
    classId === 'all' ||
    classesQuery.data === undefined ||
    classesQuery.data.some(
      reportClass =>
        reportClass.id === classId &&
        (trialId === 'all' || reportClass.trial_id === trialId) &&
        reportTrials?.some(trial => trial.id === reportClass.trial_id)
    );
  const dataState: ReportDataState = resolveReportReadiness(
    [
      readinessOf(trialsQuery, {
        // A show detail can provide a complete replicated trial set even when
        // the scoped trial read is pending or failed. That read must not make
        // otherwise complete cached report rows unprintable, so it only counts
        // once it is the source of the trials this report uses.
        hasData: reportTrials !== undefined,
        fetchStatus: hasCurrentReportTrials ? trialsQuery.fetchStatus : 'idle',
        isError: trialsQuery.isError && reportTrials === undefined,
      }),
      readinessOf(classesQuery),
      readinessOf(entriesQuery),
    ],
    { hasInvalidScope: !selectedTrialIsInShow || !selectedClassIsInScope }
  );

  const refetch = () => {
    // An explicit retry asks the network again, even after a replica notice.
    replicaNoticedRef.current = false;
    void trialsQuery.refetch();
    void classesQuery.refetch();
    void entriesQuery.refetch();
  };

  return {
    show,
    trials: reportTrials,
    classes: classesQuery.data,
    entries,
    registrationsReadComplete,
    catalogProfilesReadComplete,
    dataState,
    /** True only when every row backing this report is present and current. */
    isReady: dataState === 'ready',
    isLoading: dataState === 'loading' || dataState === 'stale',
    isError: dataState === 'error',
    refetch,
  };
}
