import { useRef } from 'react';

import { ListAppliedFilters, ListFilterMenu, ListResultLine } from '@/components/list-toolkit';
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
 * both in one URL write. Once anything is ticked, "Showing 3 of 11 classes." says how much the
 * schedule now hides, the way Entry Forms does (MYK9-1727).
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
  const filtered = statuses.length > 0 || (!days.allDays && days.days.length > 0);
  const shown = model.trialGroups.reduce((total, group) => total + group.classes.length, 0);

  return (
    <div className="space-y-2" data-testid="cockpit-filter">
      <div className="flex flex-wrap items-center gap-2">
        <ListFilterMenu fields={fields} triggerRef={filterButtonRef} />
      </div>
      <ListAppliedFilters
        fields={fields}
        onClearAll={onClearAll}
        focusTargetRef={filterButtonRef}
      />
      <ListResultLine
        shown={shown}
        total={snapshot.classes.length}
        noun={['class', 'classes']}
        filtered={filtered}
        onShowAll={onClearAll}
        quietWhenUnfiltered
      />
    </div>
  );
}
