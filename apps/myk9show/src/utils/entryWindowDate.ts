import { getTrialTimezone } from '@/features/registries';
import { formatDateLocal, parseLocalDateString } from '@/utils/dateLocal';

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

function formatDateInTimeZone(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find(part => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function currentEntryWindowDate(
  today: string | undefined,
  timeZone: string | undefined
): Date | undefined {
  if (today) return parseCalendarDate(today);
  const dateOnly = timeZone
    ? formatDateInTimeZone(new Date(), timeZone)
    : formatDateLocal(new Date());
  return parseCalendarDate(dateOnly);
}
