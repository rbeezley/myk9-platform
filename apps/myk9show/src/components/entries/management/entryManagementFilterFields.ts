/**
 * The Entries tab's Filter menu fields (docs/plan-entries-filter-button.md): Trial and Class,
 * each a multi-select with whole-show form counts. The Payment status field was cut by MYK9-906:
 * the "Payment due" queue covers it.
 */
import { formatTrialLabel } from '@myk9/core';
import type { ListMultiOptionsFilterField } from '@/components/list-toolkit';
import type {
  EntryManagementTrial,
  EntryManagementTrialClass,
} from '@/hooks/useEntryManagementTrialScope';
import type { EntryManagementCockpitState } from './entryManagementCockpitParams';
import type { EntryManagementFilterCounts } from './entryManagementFilterCounts';

function shortTrialLabel(trial: EntryManagementTrial): string {
  return formatTrialLabel({ name: trial.name, trialNumber: trial.trial_number });
}

function formatTrialOptionLabel(trial: EntryManagementTrial): string {
  const label = shortTrialLabel(trial);
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
  trialsLoaded: boolean;
  /** The classes on offer: the picked trials', or the whole show's before a trial is picked. */
  trialClasses: readonly EntryManagementTrialClass[];
  classesLoaded: boolean;
  /** Every loaded class, so a picked class from a trial not on offer is named, not shown as an id. */
  classById: ReadonlyMap<string, EntryManagementTrialClass>;
  /** Every trial's classes have loaded, so a picked id still unknown is stale (and gets pruned). */
  allClassesLoaded: boolean;
  classTrialById: ReadonlyMap<string, string>;
  /** Null until the entries have loaded. */
  counts: EntryManagementFilterCounts | null;
  /** One URL write for both lists (settled rule 4). */
  onScopeChange: (trialIds: string[], classIds: string[]) => void;
}

function withCount(count: number | undefined) {
  return count === undefined ? {} : { count };
}

export function buildEntryManagementFilterFields({
  state,
  trials,
  trialsLoaded,
  trialClasses,
  classesLoaded,
  classById,
  allClassesLoaded,
  classTrialById,
  counts,
  onScopeChange,
}: BuildEntryManagementFilterFieldsOptions): ListMultiOptionsFilterField[] {
  const trialById = new Map(trials.map(trial => [trial.id, trial]));
  // Class names repeat across trials ("Interior Novice B" in Trial 1 and Trial 2), so with more
  // than one trial each class names its own (settled rule 5).
  const classLabel = (entryClass: EntryManagementTrialClass) => {
    const name = entryClass.name ?? 'Unnamed class';
    const trial = trialById.get(entryClass.trialId);
    return trials.length > 1 && trial ? `${shortTrialLabel(trial)} · ${name}` : name;
  };
  // A picked class outside the offered trials (a hand-edited link) is still listed, so its chip
  // and its menu row carry its name; one not loaded yet keeps the field loading, never an id.
  const offeredIds = new Set(trialClasses.map(entryClass => entryClass.id));
  const pickedElsewhere = state.classIds.filter(id => !offeredIds.has(id));
  const classOptions = [
    ...trialClasses,
    ...pickedElsewhere.flatMap(id => classById.get(id) ?? []),
  ];
  const pickedUnnamed = pickedElsewhere.some(id => !classById.has(id)) && !allClassesLoaded;

  return [
    {
      kind: 'multiOptions',
      key: 'trial',
      label: 'Trial',
      values: state.trialIds,
      loading: !trialsLoaded,
      // Choosing trials drops the classes they no longer offer, in the same write. A class
      // whose trial is not known yet is kept: dropping it would erase a link's `class=`.
      onChange: trialIds => {
        const classIds = state.classIds.filter(classId => {
          const trialId = classTrialById.get(classId);
          return trialIds.length === 0 || trialId === undefined || trialIds.includes(trialId);
        });
        onScopeChange(trialIds, classIds);
      },
      options: trials.map(trial => ({
        value: trial.id,
        label: formatTrialOptionLabel(trial),
        ...withCount(counts?.byTrial ? (counts.byTrial.get(trial.id) ?? 0) : undefined),
      })),
    },
    {
      kind: 'multiOptions',
      key: 'class',
      label: 'Class',
      values: state.classIds,
      loading: !classesLoaded || pickedUnnamed,
      onChange: classIds => onScopeChange(state.trialIds, classIds),
      options: classOptions.map(entryClass => ({
        value: entryClass.id,
        label: classLabel(entryClass),
        ...withCount(counts ? (counts.byClass.get(entryClass.id) ?? 0) : undefined),
      })),
    },
  ];
}
