import { isScored, type StatsEntry } from '@/components/analytics/analytics-utils';

/** Whether the Results tab offers its Show Stats view: only once an entry has a score. */
export function isShowStatsAvailable(entries: readonly StatsEntry[] | undefined): boolean {
  return (entries ?? []).some(isScored);
}
