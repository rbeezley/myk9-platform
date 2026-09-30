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
 * Realign draft trials after the show dates change (MYK9-884). The wizard
 * draft is persisted and trials are not derived from the show dates, so a
 * trial added against an earlier date would otherwise keep it. A trial that
 * falls outside the new range moves by the day-delta between the old and new
 * start (time of day and multi-day structure kept), then is clamped into the
 * range. Trials already inside the range stay put.
 */
export function realignTrialsToShowDates<T extends DatedTrial>(
  trials: T[],
  oldStartDate: string | undefined,
  newStartDate: string | undefined,
  newEndDate: string | undefined
): T[] {
  const newStart = parseWizardDay(newStartDate);
  if (!newStart) return trials;
  const parsedEnd = parseWizardDay(newEndDate);
  const newEnd = parsedEnd && parsedEnd >= newStart ? parsedEnd : undefined;
  const oldStart = parseWizardDay(oldStartDate);
  const delta = oldStart ? differenceInCalendarDays(newStart, oldStart) : 0;

  let changed = false;
  const next = trials.map(trial => {
    const at = parseWizardDateTime(trial.dateTime);
    if (!at) return trial;
    const day = startOfDay(at);
    if (day >= newStart && (!newEnd || day <= newEnd)) return trial;

    let target = addDays(day, delta);
    if (target < newStart) target = newStart;
    if (newEnd && target > newEnd) target = newEnd;
    const moved = new Date(
      target.getFullYear(),
      target.getMonth(),
      target.getDate(),
      at.getHours(),
      at.getMinutes(),
      at.getSeconds()
    );
    const dateTime = format(moved, "yyyy-MM-dd'T'HH:mm:ss");
    if (dateTime === trial.dateTime) return trial;
    changed = true;
    return { ...trial, dateTime };
  });
  return changed ? next : trials;
}
