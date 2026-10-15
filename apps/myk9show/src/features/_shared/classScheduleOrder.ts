/**
 * One ordering rule for a dog's class rows: trial calendar day, then class
 * start time. Shared by My Shows (exhibitor) and People at show (secretary)
 * so the two surfaces list a multi-day show in the same order (MYK9-1172).
 *
 * Days are compared as `YYYY-MM-DD` strings, never through `new Date(...)`,
 * so a west-of-UTC device cannot shift a date-only value across midnight.
 * Missing days sort after dated rows; missing or unreadable times sort after
 * timed rows within the same day. `Array.prototype.sort` is stable, so rows
 * that tie keep their incoming order.
 *
 * @module features/_shared/classScheduleOrder
 */

export interface ClassScheduleKey {
  /** `YYYY-MM-DD`, optionally followed by a time part (`T…`); ignored if absent. */
  day?: string | null | undefined;
  /** "9:00 AM", "13:30" or "09:00:00". */
  time?: string | null | undefined;
}

/** The calendar day written in the string, or null when there is none. */
export function calendarDayKey(value: string | null | undefined): string | null {
  return value ? (/^\d{4}-\d{2}-\d{2}/.exec(value)?.[0] ?? null) : null;
}

/** Minutes after midnight for a 12- or 24-hour time string, or null. */
export function parseClassTimeMinutes(value: string | null | undefined): number | null {
  const match = /^\s*(\d{1,2}):(\d{2})(?::\d{2})?\s*([AaPp])?\.?[Mm]?\.?\s*$/.exec(value ?? '');
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const meridiem = match[3]?.toLowerCase();
  if (minutes > 59) return null;
  if (meridiem) {
    if (hours < 1 || hours > 12) return null;
    hours = (hours % 12) + (meridiem === 'p' ? 12 : 0);
  } else if (hours > 23) {
    return null;
  }
  return hours * 60 + minutes;
}

function compareNullable(a: string | number | null, b: string | number | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a < b ? -1 : 1;
}

export function compareClassSchedule(a: ClassScheduleKey, b: ClassScheduleKey): number {
  return (
    compareNullable(calendarDayKey(a.day), calendarDayKey(b.day)) ||
    compareNullable(parseClassTimeMinutes(a.time), parseClassTimeMinutes(b.time))
  );
}
