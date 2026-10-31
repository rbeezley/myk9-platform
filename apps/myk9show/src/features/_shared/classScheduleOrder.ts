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

import { parseStoredClockTime } from '@myk9/core';

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

function compareNullable(a: string | number | null, b: string | number | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a < b ? -1 : 1;
}

export function compareClassSchedule(a: ClassScheduleKey, b: ClassScheduleKey): number {
  return (
    compareNullable(calendarDayKey(a.day), calendarDayKey(b.day)) ||
    compareNullable(parseStoredClockTime(a.time), parseStoredClockTime(b.time))
  );
}
