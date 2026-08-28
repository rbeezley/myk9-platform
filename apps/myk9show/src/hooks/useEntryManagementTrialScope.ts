import { useMemo } from 'react';
import { useClassesByTrialQuery } from '@/hooks/queries/useClassesDatabase';
import { useShowTrials } from '@/hooks/queries/useShowTrials';

export interface EntryManagementTrialClass {
  id: string;
  name: string | null;
}

export interface EntryManagementTrial {
  id: string;
  name: string | null;
  date: string | null;
  trial_number: string | number | null;
}

interface TrialScopeInput {
  selectedShowId: string | null;
}

export function useEntryManagementTrialClasses(trialParam: string | null) {
  const {
    data: rawTrialClasses,
    isLoading: isLoadingClasses,
    isSuccess,
    refetch: refetchTrialClasses,
  } = useClassesByTrialQuery(trialParam || '', !!trialParam);
  const trialClasses = (rawTrialClasses ?? []) as unknown as EntryManagementTrialClass[];

  /**
   * The trial's class ids, or `undefined` when they are NOT KNOWN.
   *
   * This distinction is the whole point. `trialClassIds` is used as an
   * allowlist: the queue keeps a registration only if one of its entries is in
   * a class on this list. Defaulting an unread list to `[]` therefore does not
   * mean "no filter" — it means "match nothing", and the page confidently
   * reports zero registrations, zero queue counts and "No matching
   * registrations" while every entry sits in IndexedDB.
   *
   * That is not a rare state. This query has no `networkMode`, so it inherits
   * React Query's `'online'` default and PAUSES when offline — and a paused
   * query reports `isLoading: false` with `data: undefined`, i.e. it looks
   * exactly like a settled empty result. The same collapse happens on an error
   * and, briefly, on every normal trial pick.
   *
   * Callers must treat `undefined` as "scope unknown" and refuse to scope,
   * rather than scoping to nothing.
   */
  const trialClassIds = useMemo(
    () => (isSuccess ? trialClasses.map(trialClass => trialClass.id) : undefined),
    [isSuccess, trialClasses]
  );

  /** A trial is selected but we could not read which classes it contains. */
  const trialClassesUnknown = Boolean(trialParam) && !isLoadingClasses && !isSuccess;

  return {
    trialClasses,
    trialClassIds,
    isLoadingClasses,
    trialClassesUnknown,
    refetchTrialClasses,
  };
}

export function useEntryManagementTrialScope({ selectedShowId }: TrialScopeInput) {
  const { data: rawTrials = [], isLoading: isLoadingTrials } = useShowTrials(selectedShowId);
  const trials = rawTrials as unknown as EntryManagementTrial[];

  return {
    trials,
    isLoadingTrials,
  };
}
