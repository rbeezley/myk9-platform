import { useRef } from 'react';
import {
  ListAppliedFilters,
  ListFilterMenu,
  type ListOptionsFilterField,
} from '@/components/list-toolkit';
import type { ShowStatsFilterKey, ShowStatsFilters, StatsFilterOptions } from './analytics-filters';

const FIELD_LABELS: Record<ShowStatsFilterKey, string> = {
  breed: 'Breed',
  judge: 'Judge',
  date: 'Date',
  trial: 'Trial',
  element: 'Element',
  level: 'Level',
};

interface ShowStatsFilterBarProps {
  keys: readonly ShowStatsFilterKey[];
  filters: ShowStatsFilters;
  options: StatsFilterOptions;
  onChange: (key: ShowStatsFilterKey, value: string | null) => void;
  onClearAll: () => void;
}

/** The Filter button plus what is applied, shared by Show Stats and Podium (list toolkit). */
export function ShowStatsFilterBar({
  keys,
  filters,
  options,
  onChange,
  onClearAll,
}: ShowStatsFilterBarProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const fields: ListOptionsFilterField[] = keys.map(key => ({
    key,
    kind: 'options',
    label: FIELD_LABELS[key],
    options: options[key],
    value: filters[key],
    onChange: value => onChange(key, value),
  }));

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <ListFilterMenu fields={fields} triggerRef={triggerRef} />
      <ListAppliedFilters fields={fields} onClearAll={onClearAll} focusTargetRef={triggerRef} />
    </div>
  );
}
