/**
 * The Show Desk day filter (MYK9-1719): which show days are ticked, how that rides in the URL, and
 * the Filter-menu field built from it. An empty list means every day. The URL keeps its `day`
 * param: a lone `day=YYYY-MM-DD` (every older link) and `day=a,b` (several ticks) both read here.
 */

import type { ListMultiOptionsFilterField } from '@/components/list-toolkit/types';
import { formatMonthDay, formatWeekdayShort } from '@/lib/format/dates';

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

/** Valid, de-duplicated, sorted day keys from a `day` param; anything else is dropped. */
export function parseCockpitDays(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const days = raw
    .split(',')
    .map(part => part.trim())
    .filter(part => DAY_KEY.test(part));
  return [...new Set(days)].sort();
}

/** The `day` param value for these ticks, or null when every day is shown. */
export function serializeCockpitDays(days: readonly string[] | undefined): string | null {
  const valid = parseCockpitDays((days ?? []).join(','));
  return valid.length > 0 ? valid.join(',') : null;
}

/** A stable key for the ticked set, for re-keying and reset-on-change. */
export function cockpitDaysKey(days: readonly string[]): string {
  return days.length === 0 ? 'all' : days.join(',');
}

export function buildCockpitDayField({
  available,
  selected,
  classCountByDay,
  onChange,
}: {
  available: readonly string[];
  selected: readonly string[];
  classCountByDay: ReadonlyMap<string, number>;
  onChange: (days: string[]) => void;
}): ListMultiOptionsFilterField {
  return {
    kind: 'multiOptions',
    key: 'day',
    label: 'Day',
    options: available.map(day => ({
      value: day,
      // No comma inside a day ("Mon Dec 7"): the applied line joins days with ", ", and
      // "Mon, Dec 7, Tue, Dec 8" would not read as two days.
      label: `${formatWeekdayShort(day)} ${formatMonthDay(day)}`,
      count: classCountByDay.get(day) ?? 0,
    })),
    values: [...selected],
    onChange: days => onChange([...days].sort()),
  };
}
