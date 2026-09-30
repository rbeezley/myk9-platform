import { addDays, differenceInCalendarDays, format, startOfDay } from 'date-fns';
import { parseLocalDateString } from '@/utils/dateLocal';

/**
 * Parse a wizard date string. Date-only strings are read as local; full ISO
 * datetimes (the show-dates picker stores `toISOString()`) go through `Date`
 * so the viewer's local day wins, not the UTC day embedded in the string.
 */
export function parseWizardDateTime(str: string | undefined): Date | undefined {
  if (!str) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return parseLocalDateString(str);
  const parsed = new Date(str);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

export function parseWizardDay(str: string | undefined): Date | undefined {
  const parsed = parseWizardDateTime(str);
  return parsed ? startOfDay(parsed) : undefined;
}

interface DatedTrial {
  dateTime: string;
}

/**
 * Realign draft trials to the final show dates (MYK9-884). The wizard draft is
 * persisted and trials are not derived from the show dates, so a trial added
 * against an earlier date would otherwise keep it. If every dated trial is
 * already inside [start, end] nothing changes. Otherwise ALL dated trials shift
 * by (new start - earliest trial day), keeping time of day and the relative day
 * structure, and each is clamped into the range. Undated trials are left alone.
 */
export function realignTrialsToShowDates<T extends DatedTrial>(
  trials: T[],
  newStartDate: string | undefined,
  newEndDate: string | undefined
): T[] {
  const newStart = parseWizardDay(newStartDate);
  if (!newStart) return trials;
  const parsedEnd = parseWizardDay(newEndDate);
  const newEnd = parsedEnd && parsedEnd >= newStart ? parsedEnd : undefined;

  const dated = trials.flatMap(trial => {
    const at = parseWizardDateTime(trial.dateTime);
    return at ? [{ trial, at, day: startOfDay(at) }] : [];
  });
  if (dated.length === 0) return trials;
  if (dated.every(({ day }) => day >= newStart && (!newEnd || day <= newEnd))) return trials;

  const earliest = dated.reduce((min, { day }) => (day < min ? day : min), dated[0]!.day);
  const delta = differenceInCalendarDays(newStart, earliest);
  const byTrial = new Map(dated.map(entry => [entry.trial, entry]));

  return trials.map(trial => {
    const entry = byTrial.get(trial);
    if (!entry) return trial;
    let target = addDays(entry.day, delta);
    if (target < newStart) target = newStart;
    if (newEnd && target > newEnd) target = newEnd;
    const { at } = entry;
    const moved = new Date(
      target.getFullYear(),
      target.getMonth(),
      target.getDate(),
      at.getHours(),
      at.getMinutes(),
      at.getSeconds()
    );
    const dateTime = format(moved, "yyyy-MM-dd'T'HH:mm:ss");
    return dateTime === trial.dateTime ? trial : { ...trial, dateTime };
  });
}
