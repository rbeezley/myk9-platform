import { useRef } from 'react';

import { ListAppliedFilters, ListFilterMenu } from '@/components/list-toolkit';
import type { ListMultiOptionsFilterField } from '@/components/list-toolkit/types';
import { buildCockpitDayField } from './cockpitDayFilter';
import { buildCockpitStatusField } from './cockpitStatusFilter';
import type {
  CockpitStatus,
  SecretaryCockpitModel,
  SecretaryCockpitSnapshot,
} from './secretaryCockpitTypes';

/**
 * The one Filter button for the schedule (MYK9-1719, MYK9-1727): Day (multi-day shows only) and
 * Status. Ticking none in a field means all; the applied chips cover both and "clear all" clears
 * both in one URL write. The chips sit beside the button on one row (MYK9-1727); the
 * schedule heading says how many classes are showing.
 */
export function CockpitFilterMenu({
  snapshot,
  model,
  statuses,
  onDaysChange,
  onStatusesChange,
  onClearAll,
}: {
  snapshot: SecretaryCockpitSnapshot;
  model: SecretaryCockpitModel;
  statuses: readonly CockpitStatus[];
  onDaysChange: (days: string[]) => void;
  onStatusesChange: (statuses: CockpitStatus[]) => void;
  onClearAll: () => void;
}) {
  const filterButtonRef = useRef<HTMLButtonElement>(null);
  const days = model.day;
  const fields: ListMultiOptionsFilterField[] = [];

  if (days.available.length >= 2) {
    const dateByTrial = new Map(snapshot.trials.map(trial => [trial.id, trial.date]));
    const classCountByDay = new Map<string, number>();
    for (const classItem of snapshot.classes) {
      const date = dateByTrial.get(classItem.trialId);
      if (date) classCountByDay.set(date, (classCountByDay.get(date) ?? 0) + 1);
    }
    fields.push(
      buildCockpitDayField({
        available: days.available,
        selected: days.days,
        classCountByDay,
        onChange: onDaysChange,
      })
    );
  }
  fields.push(buildCockpitStatusField({ model, selected: statuses, onChange: onStatusesChange }));

  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="cockpit-filter">
      <ListFilterMenu fields={fields} triggerRef={filterButtonRef} />
      <ListAppliedFilters
        fields={fields}
        onClearAll={onClearAll}
        focusTargetRef={filterButtonRef}
        // Beside the button while there is room; a narrow screen drops the chips below it.
        className="min-w-[16rem] flex-1"
      />
    </div>
  );
}
