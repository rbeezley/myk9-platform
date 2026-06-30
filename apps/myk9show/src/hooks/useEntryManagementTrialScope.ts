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
  const { data: rawTrialClasses = [], isLoading: isLoadingClasses } = useClassesByTrialQuery(
    trialParam || '',
    !!trialParam
  );
  const trialClasses = rawTrialClasses as unknown as EntryManagementTrialClass[];
  const trialClassIds = useMemo(
    () => trialClasses.map(trialClass => trialClass.id),
    [trialClasses]
  );

  return { trialClasses, trialClassIds, isLoadingClasses };
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
