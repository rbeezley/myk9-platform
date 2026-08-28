import { useMemo } from 'react';
import { useClassesByTrialQuery } from '@/hooks/queries/useClassesDatabase';
import { useShowTrials } from '@/hooks/queries/useShowTrials';
import { useTrialEntries, type TrialEntryRow } from '@/hooks/queries/useTrialEntries';
import type { RosterEntry } from '@/components/entries/management/TrialRosterView';

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

interface BreadcrumbInput {
  trialFilter: string | null;
  classFilter: string | null;
  trials: EntryManagementTrial[];
  trialClasses: EntryManagementTrialClass[];
}

interface TrialScopeInput {
  selectedShowId: string | null;
  trialFilter: string | null;
  classFilter: string | null;
  trialClasses: EntryManagementTrialClass[];
}

function formatOwnerName(owner: NonNullable<TrialEntryRow['dog']>['owner']): string | null {
  if (!owner) return null;
  const name = [owner.first_name, owner.last_name].filter(Boolean).join(' ').trim();
  return name;
}

export function buildEntryManagementRosterRows(
  trialEntryRows: TrialEntryRow[],
  classFilter: string | null
): RosterEntry[] {
  const rows = trialEntryRows.map(row => ({
    id: row.id,
    armband: row.armband,
    dogName: row.dog?.call_name || row.dog?.name || 'Unknown Dog',
    breed: row.dog?.breed || null,
    handlerName: row.handler || (formatOwnerName(row.dog?.owner ?? null) ?? 'Unknown'),
    className: row.class?.name || 'Unknown Class',
    classId: row.class_id,
    isScored: row.is_scored === true,
    checkInStatus: row.check_in_status || null,
  }));

  return classFilter ? rows.filter(entry => entry.classId === classFilter) : rows;
}

export function buildEntryManagementBreadcrumbNames({
  trialFilter,
  classFilter,
  trials,
  trialClasses,
}: BreadcrumbInput) {
  const breadcrumbTrial = trialFilter ? trials.find(trial => trial.id === trialFilter) : null;
  const breadcrumbTrialName = breadcrumbTrial
    ? breadcrumbTrial.name || `Trial ${breadcrumbTrial.trial_number}`
    : null;
  const breadcrumbClassName = classFilter
    ? (trialClasses.find(trialClass => trialClass.id === classFilter)?.name ?? null)
    : null;

  return { breadcrumbTrialName, breadcrumbClassName };
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

export function useEntryManagementTrialScope({
  selectedShowId,
  trialFilter,
  classFilter,
  trialClasses,
}: TrialScopeInput) {
  const { data: rawTrials = [], isLoading: isLoadingTrials } = useShowTrials(selectedShowId);
  const trials = rawTrials as unknown as EntryManagementTrial[];
  const { data: trialEntryRows = [], isLoading: isLoadingTrialEntries } = useTrialEntries(
    trialFilter || ''
  );

  const { breadcrumbTrialName, breadcrumbClassName } = useMemo(
    () => buildEntryManagementBreadcrumbNames({ trialFilter, classFilter, trials, trialClasses }),
    [trialFilter, classFilter, trials, trialClasses]
  );

  const rosterEntries = useMemo(
    () => buildEntryManagementRosterRows(trialEntryRows, classFilter),
    [trialEntryRows, classFilter]
  );

  return {
    trials,
    isLoadingTrials,
    breadcrumbTrialName,
    breadcrumbClassName,
    rosterEntries,
    isLoadingTrialEntries,
  };
}
