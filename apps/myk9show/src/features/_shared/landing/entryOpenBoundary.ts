import { calendarDateInTimeZone } from '@/utils/calendarDate';
import { getCalendarDayParts } from './calendarDate';

/** The longest delay `setTimeout` accepts. */
const MAX_TIMEOUT_MS = 2 ** 31 - 1;
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
 * How long until the entry window's opening can change what a page should say: the opening
 * instant for a timestamp, or the next trial-local midnight for a calendar day. `null` when
 * the date is missing, unparseable, or already reached, so nothing needs scheduling.
 */
export function msUntilEntryOpenBoundary(
  entryOpenDate: string | null | undefined,
  timezone: string,
  now: Date
): number | null {
  if (!entryOpenDate) return null;
  const day = getCalendarDayParts(entryOpenDate);
  if (day) {
    const open = `${day.year}-${String(day.month).padStart(2, '0')}-${String(day.day).padStart(2, '0')}`;
    if (open <= calendarDateInTimeZone(now, timezone)) return null;
    return Math.min(msUntilNextLocalMidnight(now, timezone), MAX_TIMEOUT_MS);
  }
  const instant = new Date(entryOpenDate).getTime();
  if (Number.isNaN(instant) || instant <= now.getTime()) return null;
  return Math.min(instant - now.getTime(), MAX_TIMEOUT_MS);
}
