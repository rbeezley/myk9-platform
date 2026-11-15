/**
 * "Today" / "Tomorrow" / "In N days" for a show's header, reckoned in each
 * trial's own time zone (never the browser's). Nothing for a show that is
 * over, or whose entered classes carry no usable date.
 *
 * @module MyEntriesPage/modules/myShowCountdown
 */

import { calendarDayInZone, calendarDayOf } from './showPastInZones';
import type { MyShowDog } from './groupEntriesByShow';

const DEFAULT_TIMEZONE = 'America/New_York';

/** Whole days between two `YYYY-MM-DD`-comparable calendar days. */
function daysBetween(fromDay: string | number, toDay: string | number): number {
  const toUtc = (day: string | number) => {
    const text = String(day);
    const match = /^(\d{4})-?(\d{2})-?(\d{2})$/.exec(text);
    return match ? Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : NaN;
  };
  return Math.round((toUtc(toDay) - toUtc(fromDay)) / 86_400_000);
}

export function formatCountdown(daysAhead: number): string | null {
  if (!Number.isFinite(daysAhead) || daysAhead < 0) return null;
  if (daysAhead === 0) return 'Today';
  if (daysAhead === 1) return 'Tomorrow';
  return `In ${daysAhead} days`;
}

/**
 * Days until the earliest upcoming (or current) day an entered class runs.
 * A past trial day is skipped, so a show mid-run counts to its next day.
 */
export function deriveShowCountdown(dogs: readonly MyShowDog[], now: Date): string | null {
  let soonest: number | null = null;
  for (const dog of dogs) {
    for (const cls of dog.classes) {
      if (cls.status !== 'entered') continue;
      if (!cls.trialDate || Number.isNaN(cls.trialDate.getTime())) continue;
      const today = calendarDayInZone(now, cls.trialTimezone || DEFAULT_TIMEZONE);
      const days = daysBetween(today, calendarDayOf(cls.trialDate));
      if (Number.isNaN(days) || days < 0) continue;
      if (soonest === null || days < soonest) soonest = days;
    }
  }
  return soonest === null ? null : formatCountdown(soonest);
}
