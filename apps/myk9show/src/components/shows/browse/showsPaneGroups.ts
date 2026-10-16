import type { Show } from '@/types/show-types';
import { getTrialTimezone } from '@/features/registries';
import { calendarDateInTimeZone } from '@/utils/calendarDate';
import { toLocalDateOnly } from '@/utils/date-format';

const GROUP_ORDER = ['today', 'upcoming', 'past'] as const;
export type ShowsPaneGroupId = (typeof GROUP_ORDER)[number];

export interface ShowsPaneGroup<T extends Show = Show> {
  id: ShowsPaneGroupId;
  label: string;
  shows: T[];
}

const GROUP_LABELS: Record<ShowsPaneGroupId, string> = {
  today: 'Today',
  upcoming: 'Upcoming',
  past: 'Past',
};

/** `YYYY-MM-DD`, or '' when the value carries no usable calendar date. */
function calendarDay(value: string | null | undefined): string {
  if (!value) return '';
  const day = toLocalDateOnly(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : '';
}

/**
 * Which group a show sits in, judged on the calendar day in the SHOW's zone (its first trial's,
 * stamped as `entryWindowTimeZone`), never the viewer's: a Pacific show is still "today" for an
 * Eastern secretary at 11pm Eastern. `startDate`/`endDate` are DATE columns, so they compare as
 * strings against that day. A completed or cancelled show is over even if its dates still cover
 * today (the same rule as `useMyShows`).
 */
export function showsPaneGroupFor(show: Show, now: Date): ShowsPaneGroupId {
  if (show.status === 'completed' || show.status === 'cancelled') return 'past';
  const start = calendarDay(show.startDate);
  if (!start) return 'upcoming';
  const end = calendarDay(show.endDate) || start;
  const today = calendarDateInTimeZone(
    now,
    getTrialTimezone({ timezone: show.entryWindowTimeZone })
  );
  if (today < start) return 'upcoming';
  if (today > end) return 'past';
  return 'today';
}

/**
 * The Shows list's groups: Today, Upcoming (soonest first), Past (most recent first). In each
 * group the shows the viewer manages come first. Empty groups are left out.
 *
 * `isManaged` decides the pinning; pass `() => false` for a viewer who manages nothing.
 */
export function groupShowsForPane<T extends Show>(
  shows: readonly T[],
  isManaged: (show: T) => boolean,
  now: Date = new Date()
): ShowsPaneGroup<T>[] {
  const buckets: Record<ShowsPaneGroupId, T[]> = { today: [], upcoming: [], past: [] };
  for (const show of shows) buckets[showsPaneGroupFor(show, now)].push(show);

  const byDate = (direction: 1 | -1) => (a: T, b: T) => {
    const managed = Number(isManaged(b)) - Number(isManaged(a));
    if (managed !== 0) return managed;
    const date = calendarDay(a.startDate).localeCompare(calendarDay(b.startDate)) * direction;
    return date !== 0 ? date : a.name.localeCompare(b.name);
  };
  buckets.today.sort(byDate(1));
  buckets.upcoming.sort(byDate(1));
  buckets.past.sort(byDate(-1));

  return GROUP_ORDER.filter(id => buckets[id].length > 0).map(id => ({
    id,
    label: GROUP_LABELS[id],
    shows: buckets[id],
  }));
}
