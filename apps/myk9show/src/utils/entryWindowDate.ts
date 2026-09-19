import { getTrialTimezone } from '@/features/registries';
import { formatDateLocal, parseLocalDateString } from '@/utils/dateLocal';
import { calendarDateInTimeZone } from '@/utils/calendarDate';

export interface EntryWindowTrial {
  id?: string | null | undefined;
  date?: string | null | undefined;
  timezone?: string | null | undefined;
}

function parseCalendarDate(value?: string | null): Date | undefined {
  if (!value) return undefined;
  return parseLocalDateString(value.split('T')[0] ?? value);
}

function compareTrialOrder(a: EntryWindowTrial, b: EntryWindowTrial): number {
  const aDate = a.date ?? null;
  const bDate = b.date ?? null;
  if (aDate && bDate && aDate !== bDate) return aDate.localeCompare(bDate);
  if (aDate && !bDate) return -1;
  if (!aDate && bDate) return 1;
  return (a.id ?? '').localeCompare(b.id ?? '');
}

export function getEntryWindowTimezone(trials?: readonly EntryWindowTrial[] | null): string {
  if (!trials || trials.length === 0) return getTrialTimezone(undefined);
  const primaryTrial = [...trials].sort(compareTrialOrder)[0];
  return getTrialTimezone(primaryTrial);
}

export function currentEntryWindowDate(
  today: string | undefined,
  timeZone: string | undefined
): Date | undefined {
  if (today) return parseCalendarDate(today);
  const dateOnly = timeZone
    ? calendarDateInTimeZone(new Date(), timeZone)
    : formatDateLocal(new Date());
  return parseCalendarDate(dateOnly);
}
