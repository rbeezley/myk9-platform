/**
 * Trial / element / level narrowing for the Podium tab, and the pending-classes list (MYK9-1512).
 * Everything here runs on rows the viewer already loaded: podium classes from the public results
 * view and entries from the authenticated view. Pending classes come from the latter, so an
 * exhibitor sees pending classes for the entries they may see and no more.
 */
import type { ListFilterOption } from '@/components/list-toolkit';
import {
  trialLabel,
  type ShowStatsFilterKey,
  type ShowStatsFilters,
} from '@/components/analytics/analytics-filters';
import { isScored, type StatsEntry } from '@/components/analytics/analytics-utils';

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

export interface PendingClass extends ClassLike {
  scoredCount: number;
  entryCount: number;
}

export function filterClasses<T extends ClassLike>(items: readonly T[], filters: ShowStatsFilters) {
  return items.filter(
    item =>
      (filters.trial === null || item.trialId === filters.trial) &&
      (filters.element === null || item.element === filters.element) &&
      (filters.level === null || item.level === filters.level)
  );
}

/** Classes that have entries but no podium to show yet, in element/level order. */
export function derivePendingClasses(
  entries: readonly StatsEntry[],
  podiumClassIds: ReadonlySet<string>
): PendingClass[] {
  const byClass = new Map<string, PendingClass>();
  for (const entry of entries) {
    if (podiumClassIds.has(entry.classId)) continue;
    // Released with no placement 1-4 (e.g. all NQ): nothing pending, nothing to show.
    if (entry.classResultsReleasedAt) continue;
    const row = byClass.get(entry.classId) ?? {
      classId: entry.classId,
      className: entry.className,
      trialId: entry.trialId ?? '',
      element: entry.classElement ?? '',
      level: entry.classLevel ?? '',
      scoredCount: 0,
      entryCount: 0,
    };
    row.entryCount++;
    // A scored result withheld from this viewer maps to 'pending' but is still scored.
    if (isScored(entry) || entry.resultWithheld) row.scoredCount++;
    byClass.set(entry.classId, row);
  }
  return [...byClass.values()].sort(
    (a, b) =>
      a.element.localeCompare(b.element) ||
      a.level.localeCompare(b.level) ||
      a.className.localeCompare(b.className)
  );
}

export function deriveClassFilterOptions(
  classes: readonly ClassLike[],
  entries: readonly StatsEntry[]
): Record<(typeof RESULTS_FILTER_KEYS)[number], ListFilterOption[]> {
  const labels = new Map<string, string>();
  for (const entry of entries) {
    if (entry.trialId && !labels.has(entry.trialId)) labels.set(entry.trialId, trialLabel(entry));
  }
  const trialIds = [...new Set(classes.map(c => c.trialId).filter(Boolean))];
  const distinct = (pick: (c: ClassLike) => string) =>
    [...new Set(classes.map(pick).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b))
      .map(value => ({ value, label: value }));

  return {
    trial: trialIds
      .map((id, i) => ({ value: id, label: labels.get(id) ?? `Trial ${i + 1}` }))
      .sort((a, b) => a.label.localeCompare(b.label)),
    element: distinct(c => c.element),
    level: distinct(c => c.level),
  };
}
