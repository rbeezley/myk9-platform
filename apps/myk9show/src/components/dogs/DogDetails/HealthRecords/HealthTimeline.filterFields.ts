/**
 * `ListFilterBar` field definitions for the Health Timeline (MYK9-796) —
 * replaces the native type `<select>`. (The Year filter was cut by MYK9-906: the timeline already groups by year.) Type is omitted entirely (not
 * merely disabled) in `vaccinationsOnly` mode, matching the old select's
 * `!vaccinationsOnly` guard.
 */
import type { ListFilterField } from '@/components/list-toolkit';
import type { HealthTimelineFilters } from './HealthTimeline.filters';

export interface HealthEventTypeOption {
  value: string;
  label: string;
}

export interface BuildHealthTimelineFilterFieldsOptions {
  filters: HealthTimelineFilters;
  eventTypeOptions: readonly HealthEventTypeOption[];
  vaccinationsOnly: boolean;
  onChange: (patch: Partial<HealthTimelineFilters>) => void;
}

export function buildHealthTimelineFilterFields({
  filters,
  eventTypeOptions,
  vaccinationsOnly,
  onChange,
}: BuildHealthTimelineFilterFieldsOptions): ListFilterField[] {
  const fields: ListFilterField[] = [];

  if (!vaccinationsOnly) {
    fields.push({
      kind: 'options',
      key: 'type',
      label: 'Type',
      value: filters.filterType === 'all' ? null : filters.filterType,
      onChange: value => onChange({ filterType: value ?? 'all' }),
      options: eventTypeOptions.map(option => ({ value: option.value, label: option.label })),
    });
  }

  return fields;
}
