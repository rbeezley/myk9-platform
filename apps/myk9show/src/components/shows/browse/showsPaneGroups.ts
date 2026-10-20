import type { Show } from '@/types/show-types';
import { getTrialTimezone } from '@/features/registries';
import { calendarDateInTimeZone } from '@/utils/calendarDate';
import { toLocalDateOnly } from '@/utils/date-format';

const GROUP_ORDER = ['managing', 'today', 'upcoming', 'past'] as const;
export type ShowsPaneGroupId = (typeof GROUP_ORDER)[number];
/** Where a show sits on the calendar; `managing` is a viewer-relative section laid over it. */
export type ShowsPaneTimeGroupId = Exclude<ShowsPaneGroupId, 'managing'>;

export interface ShowsPaneGroup<T extends Show = Show> {
  id: ShowsPaneGroupId;
  label: string;
  shows: T[];
}

const GROUP_LABELS: Record<ShowsPaneGroupId, string> = {
  managing: 'Managing',
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
export function showsPaneGroupFor(show: Show, now: Date): ShowsPaneTimeGroupId {
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
 * The Shows list's groups: Managing, Today, Upcoming (soonest first), Past (most recent first).
 * Managing lists every show the viewer manages that is not over, today's first and then upcoming
 * by start date; each show is listed once, so those shows are not repeated in Today or Upcoming.
 * A managed show that is over stays in Past, pinned first there. Empty groups are left out, so
 * `groups[0]` is Managing's first show whenever the viewer has a current one.
 *
 * `isManaged` decides membership; pass `() => false` for a viewer who manages nothing (a site
 * admin manages every show, so the caller passes that too and gets no Managing section).
 */
export function groupShowsForPane<T extends Show>(
  shows: readonly T[],
  isManaged: (show: T) => boolean,
  now: Date = new Date()
): ShowsPaneGroup<T>[] {
  const buckets: Record<ShowsPaneGroupId, T[]> = {
    managing: [],
    today: [],
    upcoming: [],
    past: [],
  };
  // Today before upcoming inside Managing; the date sort then orders each half.
  const managingRank = new Map<T, number>();
  for (const show of shows) {
    const group = showsPaneGroupFor(show, now);
    if (group !== 'past' && isManaged(show)) {
      buckets.managing.push(show);
      managingRank.set(show, group === 'today' ? 0 : 1);
    } else {
      buckets[group].push(show);
    }
  }

  const byDate = (direction: 1 | -1) => (a: T, b: T) => {
    const managed = Number(isManaged(b)) - Number(isManaged(a));
    if (managed !== 0) return managed;
    const date = calendarDay(a.startDate).localeCompare(calendarDay(b.startDate)) * direction;
    return date !== 0 ? date : a.name.localeCompare(b.name);
  };
  buckets.managing.sort(
    (a, b) => (managingRank.get(a) ?? 1) - (managingRank.get(b) ?? 1) || byDate(1)(a, b)
  );
  buckets.today.sort(byDate(1));
  buckets.upcoming.sort(byDate(1));
  buckets.past.sort(byDate(-1));

  return GROUP_ORDER.filter(id => buckets[id].length > 0).map(id => ({
    id,
    label: GROUP_LABELS[id],
    shows: buckets[id],
  }));
}
