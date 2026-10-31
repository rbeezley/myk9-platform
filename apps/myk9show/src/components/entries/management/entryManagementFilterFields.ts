/**
 * The Entries tab's Filter menu fields (docs/plan-entries-filter-button.md): Status, Trial and
 * Class, each a multi-select with form counts. Status is the registration queues (Needs review,
 * Missing info, Payment due); none picked lists every form (MYK9-1594, which folded the Show:
 * menu into this one).
 */
import { formatTrialLabel } from '@myk9/core';
import type { ListMultiOptionsFilterField } from '@/components/list-toolkit';
import type {
  EntryManagementTrial,
  EntryManagementTrialClass,
} from '@/hooks/useEntryManagementTrialScope';
import type { EntryManagementCockpitState } from './entryManagementCockpitParams';
import type { EntryManagementFilterCounts } from './entryManagementFilterCounts';
import { SHOW_REGISTRATION_QUEUE_LABELS } from './entryManagementViews';
import type {
  ShowRegistrationQueue,
  ShowRegistrationQueueCounts,
} from './showRegistrationProjection';

/** The queues Status offers; All is "no status filter", so it is not a choice. */
const STATUS_QUEUES = ['needs-review', 'missing-information', 'payment-due'] as const;

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
  classTrialById: ReadonlyMap<string, string>;
  /** Null until the entries have loaded. */
  counts: EntryManagementFilterCounts | null;
  /** One URL write for both lists (settled rule 4). */
  onScopeChange: (trialIds: string[], classIds: string[]) => void;
  /** Forms per queue. Several queues overlap (one form can need review and have payment due). */
  queueCounts: ShowRegistrationQueueCounts;
  /** An empty list means no status filter (All). */
  onQueuesChange: (queues: ShowRegistrationQueue[]) => void;
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
  classTrialById,
  counts,
  onScopeChange,
  queueCounts,
  onQueuesChange,
}: BuildEntryManagementFilterFieldsOptions): ListMultiOptionsFilterField[] {
  const trialById = new Map(trials.map(trial => [trial.id, trial]));
  // Class names repeat across trials ("Interior Novice B" in Trial 1 and Trial 2), so with more
  // than one trial each class names its own (settled rule 5).
  const classLabel = (entryClass: EntryManagementTrialClass) => {
    const name = entryClass.name ?? 'Unnamed class';
    const trial = trialById.get(entryClass.trialId);
    return trials.length > 1 && trial ? `${shortTrialLabel(trial)} · ${name}` : name;
  };

  return [
    {
      kind: 'multiOptions',
      key: 'status',
      label: 'Status',
      values: state.queues.filter(queue => queue !== 'all'),
      onChange: queues => onQueuesChange(queues as ShowRegistrationQueue[]),
      options: STATUS_QUEUES.map(queue => ({
        value: queue,
        label: SHOW_REGISTRATION_QUEUE_LABELS[queue],
        count: queueCounts[queue],
      })),
    },
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
      loading: !classesLoaded,
      onChange: classIds => onScopeChange(state.trialIds, classIds),
      options: trialClasses.map(entryClass => ({
        value: entryClass.id,
        label: classLabel(entryClass),
        ...withCount(counts ? (counts.byClass.get(entryClass.id) ?? 0) : undefined),
      })),
    },
  ];
}
