import { calendarDateInTimeZone } from '@/utils/calendarDate';

/** The longest delay `setTimeout` accepts. */
export const MAX_TIMEOUT_MS = 2 ** 31 - 1;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Milliseconds until the next calendar-day change in `timezone`, found by bisection on
 * `calendarDateInTimeZone` so DST days and odd offsets need no zone arithmetic.
 */
function msUntilNextLocalMidnight(now: Date, timezone: string): number {
  const today = calendarDateInTimeZone(now, timezone);
  let low = 0;
  let high = DAY_MS + 2 * 60 * 60 * 1000; // a local day is never longer than 26 hours
  while (high - low > 1000) {
    const mid = Math.floor((low + high) / 2);
    if (calendarDateInTimeZone(new Date(now.getTime() + mid), timezone) === today) low = mid;
    else high = mid;
  }
  return high;
}

/**
 * The calendar day of an entry-window date, by the rule `getEntryStatus` uses (`toLocalDate`:
 * the part before `T` or a space), so a timestamp counts as its day, not its instant.
 */
function entryWindowDay(value: string | null | undefined): string | null {
  const day = value?.split(/[T ]/)[0];
  return day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
}

/**
 * How long until the next trial-local midnight, while entry status can still change with the
 * day: from now through the first day after the window closes. `getEntryStatus` is purely
 * calendar-day based (opens, closing countdown and closes all move at local midnight), so
 * this is the one boundary every state shares. `null` when the window is unknown or already
 * past its last day, so nothing needs scheduling.
 */
export function msUntilEntryDayBoundary(
  entryOpenDate: string | null | undefined,
  entryCloseDate: string | null | undefined,
  timezone: string,
  now: Date
): number | null {
  // Without both dates the status is `window_unknown`, which never changes with the clock.
  const openDay = entryWindowDay(entryOpenDate);
  const closeDay = entryWindowDay(entryCloseDate);
  if (!openDay || !closeDay) return null;
  if (calendarDateInTimeZone(now, timezone) > closeDay) return null;
  return msUntilNextLocalMidnight(now, timezone);
}
