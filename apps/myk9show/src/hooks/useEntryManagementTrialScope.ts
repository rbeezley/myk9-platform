import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { classesByTrialQueryOptions } from '@/hooks/queries/useClassesDatabase';
import { useShowTrials } from '@/hooks/queries/useShowTrials';

export interface EntryManagementTrialClass {
  id: string;
  /** The trial the class belongs to: class names repeat across trials, so labels carry it. */
  trialId: string;
  name: string | null;
}

export interface EntryManagementTrial {
  id: string;
  name: string | null;
  date: string | null;
  trial_number: string | number | null;
  /** IANA zone; the show's calendar for dates the desk stamps (MYK9-677). */
  timezone?: string | null;
}

interface TrialClassesInput {
  /** Every trial in the show; empty until the trials have loaded. */
  showTrialIds: readonly string[];
  trialsLoaded: boolean;
  /** The trials the Filter menu has picked. */
  selectedTrialIds: readonly string[];
}

interface RawClassRow {
  id: string;
  name?: string | null;
}

/**
 * The classes the Entries Filter menu offers, read per trial (docs/plan-entries-filter-button.md,
 * settled rules 3 and 10). With no trial picked it offers every class in the show; with trials
 * picked, the union of theirs.
 */
export function useEntryManagementTrialClasses({
  showTrialIds,
  trialsLoaded,
  selectedTrialIds,
}: TrialClassesInput) {
  // A deep link's trial is read before the trial list arrives, so the queue can scope early.
  const fetchedTrialIds = useMemo(
    () => [...new Set([...showTrialIds, ...selectedTrialIds])],
    [showTrialIds, selectedTrialIds]
  );
  const results = useQueries({
    queries: fetchedTrialIds.map(trialId => classesByTrialQueryOptions(trialId)),
  });
  // `useQueries` hands back a new array every render; key the derived values on what changed.
  const resultsKey = results
    .map(result => `${result.status}:${result.fetchStatus}:${result.dataUpdatedAt}`)
    .join('|');

  return useMemo(() => {
    const byTrial = new Map(fetchedTrialIds.map((trialId, index) => [trialId, results[index]]));
    const loaded = (trialId: string) => byTrial.get(trialId)?.isSuccess === true;
    const classesOf = (trialId: string): EntryManagementTrialClass[] =>
      ((byTrial.get(trialId)?.data ?? []) as unknown as RawClassRow[]).map(row => ({
        id: row.id,
        trialId,
        name: row.name ?? null,
      }));

    const offeredTrialIds = selectedTrialIds.length > 0 ? selectedTrialIds : showTrialIds;
    const trialClasses = offeredTrialIds.filter(loaded).flatMap(classesOf);
    const classesLoaded =
      (selectedTrialIds.length > 0 || trialsLoaded) && offeredTrialIds.every(loaded);
    const everyShowTrialLoaded = trialsLoaded && showTrialIds.every(loaded);
    const loadedClasses = fetchedTrialIds.filter(loaded).flatMap(classesOf);
    const selectedLoading = selectedTrialIds.some(id => byTrial.get(id)?.isLoading === true);

    return {
      /** Classes offered right now, from the trials whose classes have loaded. */
      trialClasses,
      /** Every offered trial's classes are in; until then the class field reads as loading. */
      classesLoaded,
      /** Every loaded class by id, so a picked class outside the offered trials still has a name. */
      classById: new Map(loadedClasses.map(c => [c.id, c])),
      /** Class to trial for every loaded class, so a trial pick can drop its classes. */
      classTrialById: new Map(loadedClasses.map(c => [c.id, c.trialId])),
      /** Every class id in the show, only once every trial's classes have loaded (URL pruning). */
      knownClassIds: everyShowTrialLoaded
        ? new Set(showTrialIds.flatMap(trialId => classesOf(trialId).map(c => c.id)))
        : undefined,
      /**
       * The selected trials' class ids, or `undefined` when they are NOT KNOWN.
       *
       * This is an allowlist: the queue keeps a registration only if one of its entries is in a
       * class on it, so an unread list defaulted to `[]` would match nothing and the page would
       * report zero registrations as fact. These queries pause offline (React Query's `'online'`
       * mode) and a paused query looks settled and empty, so the ids come back only when EVERY
       * selected trial's read succeeded. Callers treat `undefined` as "scope unknown".
       */
      trialClassIds:
        selectedTrialIds.length > 0 && selectedTrialIds.every(loaded)
          ? selectedTrialIds.flatMap(trialId => classesOf(trialId).map(c => c.id))
          : undefined,
      isLoadingClasses: selectedLoading,
      /** A trial is selected but which classes it holds could not be read. */
      trialClassesUnknown:
        selectedTrialIds.length > 0 && !selectedLoading && !selectedTrialIds.every(loaded),
      refetchTrialClasses: () =>
        selectedTrialIds
          .filter(trialId => !loaded(trialId))
          .forEach(trialId => void byTrial.get(trialId)?.refetch()),
    };
    // `results` is read through `resultsKey`, which changes whenever any read does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchedTrialIds, resultsKey, selectedTrialIds, showTrialIds, trialsLoaded]);
}

export function useEntryManagementTrialScope({ selectedShowId }: { selectedShowId: string | null }) {
  const { data: rawTrials, isLoading: isLoadingTrials, isSuccess } = useShowTrials(selectedShowId);
  const trials = useMemo(
    () => (rawTrials ?? []) as unknown as EntryManagementTrial[],
    [rawTrials]
  );

  return {
    trials,
    isLoadingTrials,
    trialsLoaded: isSuccess,
  };
}
