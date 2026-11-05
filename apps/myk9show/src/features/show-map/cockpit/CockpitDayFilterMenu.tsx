import { useRef } from 'react';

import { ListAppliedFilters, ListFilterMenu } from '@/components/list-toolkit';
import { buildCockpitDayField } from './cockpitDayFilter';
import type { SecretaryCockpitModel, SecretaryCockpitSnapshot } from './secretaryCockpitTypes';

/**
 * One Filter button for the show days, the way Entry Forms filters (MYK9-1719). Only on a
 * multi-day show; ticking none means every day.
 */
export function CockpitDayFilterMenu({
  snapshot,
  days,
  onChange,
}: {
  snapshot: SecretaryCockpitSnapshot;
  days: SecretaryCockpitModel['day'];
  onChange: (days: string[]) => void;
}) {
  const filterButtonRef = useRef<HTMLButtonElement>(null);
  if (days.available.length < 2) return null;

  const dateByTrial = new Map(snapshot.trials.map(trial => [trial.id, trial.date]));
  const classCountByDay = new Map<string, number>();
  for (const classItem of snapshot.classes) {
    const date = dateByTrial.get(classItem.trialId);
    if (date) classCountByDay.set(date, (classCountByDay.get(date) ?? 0) + 1);
  }
  const field = buildCockpitDayField({
    available: days.available,
    selected: days.days,
    classCountByDay,
    onChange,
  });

  return (
    <div className="space-y-2" data-testid="cockpit-day-filter">
      <div className="flex flex-wrap items-center gap-2">
        <ListFilterMenu fields={[field]} triggerRef={filterButtonRef} />
      </div>
      <ListAppliedFilters
        fields={[field]}
        onClearAll={() => onChange([])}
        focusTargetRef={filterButtonRef}
      />
    </div>
  );
}
