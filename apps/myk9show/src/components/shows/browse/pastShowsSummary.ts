import type { Show } from '@/types/show-types';
import { monthKeyOf } from './monthScrubber.helpers';
import { showsPaneGroupFor } from './showsPaneGroups';

export interface PastShowsSummary {
  count: number;
  /** `YYYY-MM` of the most recent past show, the month the strip should open. */
  monthKey: string;
}

/** The past shows among `shows` (MYK9-1283), or null when there are none. */
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
