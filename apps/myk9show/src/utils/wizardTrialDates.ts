import { addDays, differenceInCalendarDays, format, startOfDay } from 'date-fns';
import { parseLocalDateString } from '@/utils/dateLocal';
import { toLocalDateOnly } from '@/utils/date-format';

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

/** A calendar day stored at midnight UTC, in either separator style Postgres returns. */
const STORED_UTC_MIDNIGHT = /^(\d{4}-\d{2}-\d{2})[T ]00:00:00(?:\.0+)?(?:Z|\+00(?::?00)?)$/;

/**
 * A stored show day (`shows.start_date`, `end_date`, entry dates) as the wizard's
 * value, which every wizard reader parses with `Date` (MYK9-2284). The columns are
 * timestamptz holding the calendar day at midnight UTC, which west of UTC reads
 * as the previous evening, so the day is taken from the string and returned as
 * local midnight of that day. A value already in the wizard's own form (the
 * picker's local day, still in the store right after a create) keeps its local day.
 */
export function toWizardShowDay(value: string | undefined | null): string {
  if (!value) return '';
  const day = STORED_UTC_MIDNIGHT.exec(value)?.[1] ?? toLocalDateOnly(value);
  return parseWizardDateTime(day)?.toISOString() ?? value;
}

interface DatedTrial {
  trialDate: string;
}

/**
 * Realign draft trials to the final show dates (MYK9-884). The wizard draft is
 * persisted and trials are not derived from the show dates, so a trial added
 * against an earlier date would otherwise keep it.
 * - Every dated trial inside [start, end]: nothing changes.
 * - Every dated trial outside it (the show moved wholesale): all shift by
 *   (new start - earliest trial day), keeping the relative day
 *   structure, then clamp into the range.
 * - A mix: only the out-of-range trials are clamped; trials already inside the
 *   range stay exactly where the secretary put them.
 * Undated trials are left alone. An empty or inverted end leaves the range open.
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
  const isInside = (day: Date) => day >= newStart && (!newEnd || day <= newEnd);

  const dated = trials.flatMap(trial => {
    const at = parseWizardDateTime(trial.trialDate);
    return at ? [{ trial, at, day: startOfDay(at) }] : [];
  });
  if (dated.length === 0 || dated.every(({ day }) => isInside(day))) return trials;

  const allOutside = dated.every(({ day }) => !isInside(day));
  const earliest = dated.reduce((min, { day }) => (day < min ? day : min), dated[0]!.day);
  const delta = allOutside ? differenceInCalendarDays(newStart, earliest) : 0;
  const byTrial = new Map(dated.map(entry => [entry.trial, entry]));

  return trials.map(trial => {
    const entry = byTrial.get(trial);
    if (!entry || isInside(entry.day)) return trial;
    let target = addDays(entry.day, delta);
    if (target < newStart) target = newStart;
    if (newEnd && target > newEnd) target = newEnd;
    const trialDate = format(target, 'yyyy-MM-dd');
    return trialDate === trial.trialDate ? trial : { ...trial, trialDate };
  });
}
