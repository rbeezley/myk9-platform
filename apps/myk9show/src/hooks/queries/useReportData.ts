import { useQuery } from '@tanstack/react-query';
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

/**
 * Why the report data cannot be described by `isLoading` / `isError` alone.
 *
 * - `loading`     -- a fetch is genuinely in flight.
 * - `unavailable` -- no connectivity, so the question was never asked. Distinct
 *                    from an empty answer, and the distinction is the whole
 *                    point: an empty answer prints as a blank roster.
 * - `stale`       -- rows are present but belong to the PREVIOUS selection.
 * - `error`       -- the request was made and failed.
 * - `ready`       -- every row is present and current.
 */
export type ReportDataState = 'loading' | 'unavailable' | 'stale' | 'error' | 'ready';

export interface UseReportDataOptions {
  show: Show | null;
  trialId: string | 'all';
  classId: string | 'all';
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

  const trialsQuery = useQuery({
    queryKey: queryKeys.showTrials(showId),
    queryFn: async () => {
      const { data, error } = await getTrialsByShow(showId);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!showId,
    ...cacheStrategies.moderate,
  });

  // A show detail can already carry its replicated trials while this scoped
  // query is paused or its local trial read is still cold. Keep one resolved
  // trial set for every downstream consumer so controls cannot advertise a
  // trial that previews/classes did not load.
  const hasCurrentReportTrials =
    Boolean(trialsQuery.data?.length) && !trialsQuery.isPlaceholderData;
  const reportTrials =
    hasCurrentReportTrials || !show?.trials?.length
      ? trialsQuery.data
      : show.trials.map(trial => ({
          id: trial.id,
          show_id: showId,
          name: trial.name,
          date: trial.date,
          trial_number: Number(trial.trialNumber) || 0,
          timezone: trial.timezone ?? null,
          registry_id: trial.registryId ?? null,
        }));

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
    enabled: trialsQuery.isSuccess || reportTrials !== undefined,
    ...cacheStrategies.moderate,
  });

  const entriesQuery = useQuery({
    queryKey: queryKeys.reportData(showId, trialId, classId),
    queryFn: async () => {
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
      await refreshShowEntriesForRead(showId);
      if (trialId === 'all') {
        const { data, error } = await getEntriesByShowFromReplication(showId);
        if (error) throw error;
        return hydrateEntryRegistrations((data ?? []) as ReportDbEntry[]);
      }
      const { data, error } = await getEntriesByTrial(trialId);
      if (error) throw error;
      return hydrateEntryRegistrations((data ?? []) as ReportDbEntry[]);
    },
    enabled: classesQuery.isSuccess,
    ...cacheStrategies.moderate,
  });

  const entries = entriesQuery.data?.entries;
  // INTENT: registration hydration is ancillary to the cached show/trial/
  // class/entry rows needed by check-in sheets and scoresheets. Keep those
  // reports printable when registration reads are incomplete; the emergency
  // packet gates on this flag at its own safety boundary.
  const registrationsReadComplete = entriesQuery.data?.registrationsReadComplete ?? true;
  const queries = [trialsQuery, classesQuery, entriesQuery];

  // Why this is an enum and not two booleans: every report on this page can end
  // up as PAPER, and three separate React Query states all present as
  // "not loading, not erroring, no data" -- which `(entries ?? [])` then reads
  // as "this class has no dogs".
  //
  //  - PAUSED. The client runs networkMode:'online' (lib/queryClient.ts), so a
  //    query with no connectivity settles at isPending && !isFetching, and
  //    `isLoading` is false. The secretary is in a rented hall on venue wifi;
  //    this is the normal case here, not the exotic one.
  //  - DISABLED-UPSTREAM. classes waits on trials and entries waits on classes,
  //    so a paused trials query leaves both downstream queries idle, which is
  //    also not "loading".
  //  - PLACEHOLDER. `placeholderData: previousData => previousData` is the
  //    configured default on the application client (lib/queryClient.ts), and
  //    changing the Trial select changes the classes and entries
  //    keys. React Query then reports status:'success' while serving the
  //    PREVIOUS trial's rows, so the old trial's dogs would render under the
  //    new trial's header until the fetch lands.
  //
  // Callers must not be able to reach a print or a PDF download without having
  // answered which of these they are in, so the state is one value they have to
  // read rather than a condition they can forget to add.
  // Paused only matters when the rows are MISSING. A background refetch that
  // pauses on a query already holding complete data leaves that data intact and
  // correct for the current selection -- it is a warm cache, not an unanswered
  // question, and treating it as unavailable would take the whole page away
  // from a secretary standing in a hall whose wifi just dropped. That is the
  // case this page most needs to survive, so it must stay printable.
  //
  // Placeholder is checked BEFORE that, because placeholder rows are complete
  // but belong to the PREVIOUS selection -- present, and wrong.
  const hasEveryRowSet =
    reportTrials !== undefined &&
    classesQuery.data !== undefined &&
    entriesQuery.data !== undefined;

  const dataState: ReportDataState = queries.some(q => q.isError)
    ? 'error'
    : queries.some(q => q.isPlaceholderData)
      ? 'stale'
      : hasEveryRowSet
        ? 'ready'
        : queries.some(q => q.fetchStatus === 'paused')
          ? 'unavailable'
          : 'loading';

  const refetch = () => {
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
