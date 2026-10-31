/** Clock and calendar helpers for the cockpit model, in a Trial's timezone. */

import { formatClockTime, parseStoredClockTime } from '@myk9/core';

export function dateKeyInTimeZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function minuteOfDayInTimeZone(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return Number(values.hour) * 60 + Number(values.minute);
}

export function operationalMinutes(
  value: string | null | undefined,
  timeZone: string
): number | null {
  if (value?.includes('T')) {
    const instant = new Date(value);
    if (!Number.isNaN(instant.getTime())) return minuteOfDayInTimeZone(instant, timeZone);
  }
  return parseStoredClockTime(value);
}

export function formatClock(value: string | null | undefined, timeZone: string): string | null {
  if (!value) return null;
  if (value.includes('T')) {
    const instant = new Date(value);
    if (!Number.isNaN(instant.getTime())) {
      return new Intl.DateTimeFormat('en-US', {
        timeZone,
        hour: 'numeric',
        minute: '2-digit',
      })
        .format(instant)
        .replace(/\u202f/g, ' ');
    }
  }
  const minutes = parseStoredClockTime(value);
  return minutes === null ? value : formatClockTime(minutes);
}

export function formatTrialDate(date: string): string {
  const parsed = new Date(`${date}T12:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return date;
  return new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric' }).format(parsed);
}
