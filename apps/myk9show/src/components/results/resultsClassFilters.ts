/**
 * Trial / element / level narrowing for the Podium tab, and the pending-classes list (MYK9-1512).
 * Podium classes come from the public results view, which owns release and visibility. Pending
 * classes come from class rows (server-kept `scored_count` / `results_released_at`), never from
 * counting entries here.
 */
import type { ListFilterOption } from '@/components/list-toolkit';
import {
  trialLabel,
  type ShowStatsFilterKey,
  type ShowStatsFilters,
} from '@/components/analytics/analytics-filters';
import type { ShowClassProgress } from '@/hooks/queries/useShowClassProgress';

export const RESULTS_FILTER_KEYS = [
  'trial',
  'element',
  'level',
] as const satisfies readonly ShowStatsFilterKey[];

export interface ClassLike {
  classId: string;
  className: string;
  trialId: string;
  element: string;
  level: string;
}

export type PendingClass = ShowClassProgress;

export function filterClasses<T extends ClassLike>(items: readonly T[], filters: ShowStatsFilters) {
  return items.filter(
    item =>
      (filters.trial === null || item.trialId === filters.trial) &&
      (filters.element === null || item.element === filters.element) &&
      (filters.level === null || item.level === filters.level)
  );
}

/** Classes whose results are not released yet, in element/level order. */
export function derivePendingClasses(classes: readonly ShowClassProgress[]): PendingClass[] {
  return classes
    .filter(cls => !cls.resultsReleasedAt)
    .sort(
      (a, b) =>
        a.element.localeCompare(b.element) ||
        a.level.localeCompare(b.level) ||
        a.className.localeCompare(b.className)
    );
}

export function deriveClassFilterOptions(
  classes: readonly ClassLike[],
  progress: readonly ShowClassProgress[]
): Record<(typeof RESULTS_FILTER_KEYS)[number], ListFilterOption[]> {
  // Labels come from the public class rows, so they are the same for everyone and stable as
  // classes are released. A trial with no metadata is named plainly, never by list position.
  const labels = new Map<string, string>();
  for (const cls of progress) {
    if (cls.trialId && !labels.has(cls.trialId)) labels.set(cls.trialId, trialLabel(cls));
  }
  const trialIds = [...new Set(classes.map(c => c.trialId).filter(Boolean))];
  const distinct = (pick: (c: ClassLike) => string) =>
    [...new Set(classes.map(pick).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b))
      .map(value => ({ value, label: value }));

  return {
    trial: trialIds
      .map(id => ({ value: id, label: labels.get(id) ?? 'Trial' }))
      .sort((a, b) => a.label.localeCompare(b.label)),
    element: distinct(c => c.element),
    level: distinct(c => c.level),
  };
}
