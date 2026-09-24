import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { onlineManager, useQuery, useQueryClient } from '@tanstack/react-query';
import { getTrialsByShow } from '@/services/database/trials';
import { getClassesByTrialId } from '@/services/database/classes';
import {
  getEntriesByClass,
  getEntriesByShowFromReplication,
  getEntriesByTrial,
} from '@/services/database/entries';
import { queryKeys, cacheStrategies } from '@/lib/queryClient';
import type { Show } from '@/types/show-types';
import { loadDogRegistrations } from '@/services/database/dogs/reads';
import { loadJuniorHandlerProfiles } from '@/services/database/users/juniorHandlerProfiles';
import { refreshShowEntriesForRead } from '@/services/database/entries/refreshShowEntriesForRead';
import type { ReportDbEntry } from '@/lib/reports/types';
import {
  getHandlerPeopleHydrationRevision,
  subscribeHandlerPeopleHydration,
} from '@/services/database/entries/handlerHydration';
import {
  replicatedClassesTable,
  replicatedDogsTable,
  replicatedEntriesTable,
  replicatedTrialsTable,
} from '@/services/replication';
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

function subscribeToHandlerPeopleRevision(onStoreChange: () => void): () => void {
  return subscribeHandlerPeopleHydration(() => onStoreChange());
}

interface HydratedReportEntries {
  entries: ReportDbEntry[];
  registrationsReadComplete: boolean;
}

/**
 * MYK9-570: hydrate each entry with its handler's junior handler columns.
 *
 * The replica carries `entries.handler_id` but nothing from `people`, so the
 * catalog cannot know a handler's date of birth without asking. Deliberately
 * ANCILLARY — a failed read leaves `handler_person` undefined, which the mapper
 * reads as "unknown", so the catalog prints without junior marks instead of
 * refusing to print.
 */
async function hydrateHandlerJuniorProfiles(entries: ReportDbEntry[]): Promise<ReportDbEntry[]> {
  const handlerIds = [
    ...new Set(
      entries
        .map(entry => (entry as { handler_id?: string | null }).handler_id)
        .filter((id): id is string => Boolean(id))
    ),
  ];
  if (handlerIds.length === 0) return entries;

  const { byPersonId, readComplete } = await loadJuniorHandlerProfiles(handlerIds);
  // A partial read is NOT a partial answer here. An entry whose handler happened
  // to fall in a failed batch would come back with no `handler_person` and print
  // as an ordinary adult, so the catalog would mark some juniors and silently
  // miss others with nothing on the page to say so. Marking none of them is the
  // honest outcome, and it is what an offline secretary already gets.
  if (!readComplete || byPersonId.size === 0) return entries;

  return entries.map(entry => {
    const handlerId = (entry as { handler_id?: string | null }).handler_id;
    const profile = handlerId ? byPersonId.get(handlerId) : undefined;
    if (!profile) return entry;
    return {
      ...entry,
      handler_person: {
        first_name: profile.firstName,
        last_name: profile.lastName,
        date_of_birth: profile.dateOfBirth,
        junior_handler_numbers: profile.juniorHandlerNumbers,
      },
    };
  });
}

/**
 * The hydration hop, exported for its own test. It is the step that turns
 * `entries.handler_id` into `handler_person`, and it is invisible to every
 * catalog test (they all inject `handler_person` directly), so without a handle
 * on it the feature could go inert with the suite still green.
 */
export const hydrateHandlerJuniorProfilesForTest = hydrateHandlerJuniorProfiles;

async function hydrateEntryRegistrations(entries: ReportDbEntry[]): Promise<HydratedReportEntries> {
  const withHandlers = await hydrateHandlerJuniorProfiles(entries);
  const dogIds = [
    ...new Set(withHandlers.map(entry => entry.dog_id).filter((id): id is string => Boolean(id))),
  ];
  if (dogIds.length === 0) {
    return { entries: withHandlers, registrationsReadComplete: true };
  }

  const { byDog, registrationsReadComplete } = await loadDogRegistrations(dogIds);

  return {
    entries: withHandlers.map(entry => {
      if (!entry.dog_id) return entry;
      const dog = entry.dog ?? { id: entry.dog_id };
      return {
        ...entry,
        dog: {
          ...dog,
          registrations: byDog.get(entry.dog_id) ?? [],
        },
      };
    }),
    registrationsReadComplete,
  };
}

/**
 * Fetches trials, classes, and entries for report generation.
 * Show data comes from the store (already loaded via replication).
 */
export function useReportData({ show, trialId, classId }: UseReportDataOptions) {
  const showId = show?.id ?? '';
  const queryClient = useQueryClient();
  const handlerPeopleRevision = useSyncExternalStore(
    subscribeToHandlerPeopleRevision,
    getHandlerPeopleHydrationRevision,
    getHandlerPeopleHydrationRevision
  );
  const previousHandlerPeopleRevision = useRef(handlerPeopleRevision);
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
  useEffect(() => {
    if (!showId) return;
    const invalidate = () => {
      replicaNoticedRef.current = true;
      for (const queryKey of [
        queryKeys.showTrials(showId),
        queryKeys.showClasses(showId),
        ['reports', showId],
      ]) {
        void queryClient.invalidateQueries({ queryKey });
      }
    };
    const unsubscribes = [
      replicatedTrialsTable.subscribe(invalidate, { emitCurrent: false }),
      replicatedClassesTable.subscribe(invalidate, { emitCurrent: false }),
      replicatedEntriesTable.subscribe(invalidate, { emitCurrent: false }),
      replicatedDogsTable.subscribe(invalidate, { emitCurrent: false }),
    ];
    return () => unsubscribes.forEach(unsubscribe => unsubscribe());
  }, [queryClient, showId]);

  useEffect(() => {
    if (previousHandlerPeopleRevision.current === handlerPeopleRevision) return;
    previousHandlerPeopleRevision.current = handlerPeopleRevision;
    if (showId) {
      void queryClient.invalidateQueries({ queryKey: reportQueryKey });
    }
  }, [handlerPeopleRevision, queryClient, reportQueryKey, showId]);

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
      ? show.trials.map(trial => ({
          id: trial.id,
          show_id: showId,
          name: trial.name,
          date: trial.date,
          trial_number: Number(trial.trialNumber) || 0,
          timezone: trial.timezone ?? null,
          registry_id: trial.registryId ?? null,
        }))
      : undefined;
  const selectedTrialIsInShow =
    trialId === 'all' ||
    (reportTrials !== undefined && reportTrials.some(trial => trial.id === trialId));

  const classesQuery = useQuery({
    queryKey: [
      ...queryKeys.showClasses(showId),
      trialId,
      trialId === 'all'
        ? ((reportTrials ?? []) as Array<{ id: string }>).map(trial => trial.id)
        : [],
    ],
    queryFn: async () => {
      if (trialId === 'all') {
        const trials = (reportTrials ?? []) as Array<{ id: string }>;
        const results = await Promise.all(trials.map(trial => getClassesByTrialId(trial.id)));
        const failedResult = results.find(result => result.error);
        if (failedResult?.error) throw failedResult.error;
        return results.flatMap(({ data }) => data ?? []);
      }
      const { data, error } = await getClassesByTrialId(trialId);
      if (error) throw error;
      return data ?? [];
    },
    enabled: selectedTrialIsInShow && (trialsQuery.isSuccess || reportTrials !== undefined),
    ...REPLICA_READ_OPTIONS,
  });

  const entriesQuery = useQuery({
    queryKey: reportQueryKey,
    queryFn: async () => {
      const readEntries = async (): Promise<HydratedReportEntries> => {
        if (classId !== 'all') {
          const { data, error } = await getEntriesByClass(classId);
          if (error) throw error;
          return hydrateEntryRegistrations((data ?? []) as ReportDbEntry[]);
        }
        // Staff reports use the same replication-backed scoped reads as class
        // reports. The exhibitor show read resolves release visibility online and
        // must mask raw cached scores when that optional request is unavailable.
        // Retain the bounded refresh that show reports used before selecting
        // scoped reads, so an online partial cache still has a chance to fill.
        // Skipped when a replica notice asked for this read (see the
        // subscription) and offline, where it can only fail -- or stall for its
        // full deadline -- while Print waits on this read.
        if (!replicaNoticed && onlineManager.isOnline()) await refreshShowEntriesForRead(showId);
        if (trialId === 'all') {
          const { data, error } = await getEntriesByShowFromReplication(showId);
          if (error) throw error;
          return hydrateEntryRegistrations((data ?? []) as ReportDbEntry[]);
        }
        const { data, error } = await getEntriesByTrial(trialId);
        if (error) throw error;
        return hydrateEntryRegistrations((data ?? []) as ReportDbEntry[]);
      };

      const replicaNoticed = replicaNoticedRef.current;
      replicaNoticedRef.current = false;
      let revision = getHandlerPeopleHydrationRevision();
      let data = await readEntries();
      // React Query can ignore invalidation while the first fetch has no cached
      // data yet. If people completed during that fetch, replay the scoped read
      // now; the authoritative person rows are already persisted locally.
      while (getHandlerPeopleHydrationRevision() > revision) {
        revision = getHandlerPeopleHydrationRevision();
        data = await readEntries();
      }
      return data;
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
    dataState,
    /** True only when every row backing this report is present and current. */
    isReady: dataState === 'ready',
    isLoading: dataState === 'loading' || dataState === 'stale',
    isError: dataState === 'error',
    refetch,
  };
}
