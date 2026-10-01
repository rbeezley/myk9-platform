/**
 * `ListFilterBar` field definitions for the registration-queue views
 * (MYK9-795) — replaces `TrialClassFilters` (trial + class). The standalone
 * Payment status field was cut by MYK9-906: the "Payment due" view covers it.
 */
import { formatTrialLabel } from '@myk9/core';
import type { ListFilterField } from '@/components/list-toolkit';
import type {
  EntryManagementTrial,
  EntryManagementTrialClass,
} from '@/hooks/useEntryManagementTrialScope';
import type { EntryManagementCockpitState } from './entryManagementCockpitParams';

function formatTrialOptionLabel(trial: EntryManagementTrial): string {
  const label = formatTrialLabel({ name: trial.name, trialNumber: trial.trial_number });
  if (!trial.date) return label;
  const date = new Date(`${trial.date}T00:00:00`);
  const formatted = date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  return `${label} · ${formatted}`;
}

export interface BuildEntryManagementFilterFieldsOptions {
  state: EntryManagementCockpitState;
  trials: readonly EntryManagementTrial[];
  trialClasses: readonly EntryManagementTrialClass[];
  onScopeChange: (trialId: string | null, classId?: string | null) => void;
}

export function buildEntryManagementFilterFields({
  state,
  trials,
  trialClasses,
  onScopeChange,
}: BuildEntryManagementFilterFieldsOptions): ListFilterField[] {
  return [
    {
      kind: 'options',
      key: 'trial',
      label: 'Trial',
      allLabel: 'All trials',
      value: state.trialId,
      onChange: trialId => onScopeChange(trialId, null),
      options: trials.map(trial => ({ value: trial.id, label: formatTrialOptionLabel(trial) })),
    },
    {
      kind: 'options',
      key: 'class',
      label: 'Class',
      allLabel: 'All classes',
      // `trialClasses` is already scoped to `state.trialId` by
      // `useEntryManagementTrialClasses` (empty when no trial is selected), so
      // this field naturally has nothing to offer until a trial is picked —
      // the same effective gating `TrialClassFilters`' `disabled` prop gave,
      // without the list-toolkit needing a per-field disabled concept.
      value: state.classId,
      onChange: classId => onScopeChange(state.trialId, classId),
      options: trialClasses.map(entryClass => ({
        value: entryClass.id,
        label: entryClass.name ?? 'Unnamed class',
      })),
    },
  ];
}
