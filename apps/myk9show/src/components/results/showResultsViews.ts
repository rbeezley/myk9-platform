import { isScored, type StatsEntry } from '@/components/analytics/analytics-utils';

/**
 * Whether the Results tab offers its Show Stats view: only once an entry has a score.
 * The tab and the ringside menu both read this, so the menu cannot link to a view
 * the tab will not render.
 */
export function isShowStatsAvailable(entries: readonly StatsEntry[] | undefined): boolean {
  return (entries ?? []).some(isScored);
}
