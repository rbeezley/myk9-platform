/**
 * The Show Desk status filter (MYK9-1727): which of In progress / Needs attention / Needs wrap-up
 * are ticked, how that rides in the URL, and the Filter-menu field built from it. An empty list
 * means every class; several ticks show a class matching ANY of them. The URL keeps its `filter`
 * param: a lone value (`filter=needs-attention`, every older link) and a comma list both read here;
 * `all`, an unknown word or nothing reads as no ticks.
 *
 * Counts are `model.daySchedule` rows run through `matchesCockpitFilter`, the same predicate
 * `buildTrialGroups` uses for the schedule's rows, so an option's count cannot drift from them.
 */

import type { ListMultiOptionsFilterField } from '@/components/list-toolkit/types';
import { matchesCockpitFilter } from './secretaryCockpitAttention';
import type { CockpitStatus, SecretaryCockpitModel } from './secretaryCockpitTypes';

export const COCKPIT_STATUSES: readonly { id: CockpitStatus; label: string }[] = [
  { id: 'in-progress', label: 'In progress' },
  { id: 'needs-attention', label: 'Needs attention' },
  { id: 'needs-closeout', label: 'Needs wrap-up' },
];

const STATUS_IDS: ReadonlySet<string> = new Set(COCKPIT_STATUSES.map(status => status.id));

/** Valid, de-duplicated, sorted statuses from a `filter` param; anything else is dropped. */
export function parseCockpitStatuses(raw: string | null | undefined): CockpitStatus[] {
  if (!raw) return [];
  const statuses = raw
    .split(',')
    .map(part => part.trim())
    .filter(part => STATUS_IDS.has(part)) as CockpitStatus[];
  return [...new Set(statuses)].sort();
}

/** The `filter` param value for these ticks, or null when every class is shown. */
export function serializeCockpitStatuses(
  statuses: readonly CockpitStatus[] | undefined
): string | null {
  const valid = parseCockpitStatuses((statuses ?? []).join(','));
  return valid.length > 0 ? valid.join(',') : null;
}

export function buildCockpitStatusField({
  model,
  selected,
  onChange,
}: {
  model: SecretaryCockpitModel;
  selected: readonly CockpitStatus[];
  onChange: (statuses: CockpitStatus[]) => void;
}): ListMultiOptionsFilterField {
  return {
    kind: 'multiOptions',
    key: 'status',
    label: 'Status',
    options: COCKPIT_STATUSES.map(status => ({
      value: status.id,
      label: status.label,
      count: model.daySchedule.filter(row =>
        matchesCockpitFilter(
          { lifecycle: row.lifecycle.value, closeout: row.closeout },
          status.id,
          row.attentionCount
        )
      ).length,
    })),
    values: [...selected],
    onChange: values => onChange(parseCockpitStatuses(values.join(','))),
  };
}
