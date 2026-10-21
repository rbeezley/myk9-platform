import type { Show } from '@/types/show-types';
import { ALL_MONTHS_KEY, monthKeyOf } from './monthScrubber.helpers';
import { showsPaneGroupFor } from './showsPaneGroups';

export interface PastShowsSummary {
  count: number;
  /** `YYYY-MM` of the most recent past show, the month the strip should open. */
  monthKey: string;
}

/**
 * The past shows among `shows` (MYK9-1283), or null when there are none. Past shows with no
 * parseable start date have no month to open, so they leave the summary null.
 */
export function summarizePastShows(shows: Show[], now: Date): PastShowsSummary | null {
  const past = shows.filter(show => showsPaneGroupFor(show, now) === 'past');
  let monthKey: string | null = null;
  for (const show of past) {
    const key = monthKeyOf(show.startDate);
    if (key && (monthKey === null || key > monthKey)) monthKey = key;
  }
  return monthKey === null ? null : { count: past.length, monthKey };
}

/** "October 2026" from a `YYYY-MM` key. */
export function monthKeyLabel(monthKey: string): string {
  return new Date(`${monthKey}-01T00:00:00`).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });
}

/**
 * What the empty Browse Shows list shows about past shows: only for the unfiltered "upcoming"
 * view (month 'all') that came up empty while past shows exist. `monthKey` is the month the
 * page opens when the viewer follows the link.
 */
export function pastEmptyStateProps({
  summary,
  month,
  hasActiveFilters,
  isEmpty,
}: {
  summary: PastShowsSummary | null;
  month: string;
  hasActiveFilters: boolean;
  isEmpty: boolean;
}): { past: { count: number; monthLabel: string }; monthKey: string } | null {
  if (!summary || !isEmpty || hasActiveFilters || month !== ALL_MONTHS_KEY) return null;
  return {
    past: { count: summary.count, monthLabel: monthKeyLabel(summary.monthKey) },
    monthKey: summary.monthKey,
  };
}
