import { formatShowDate, resolveDisplayDate } from '@/features/_shared/landing/calendarDate';
/**
 * Date formatting helpers for Banner surfaces. Mirrors the Monogram /
 * Heritage helpers — kept as a sibling rather than imported across feature
 * boundaries so the Banner feature stays self-contained.
 */

export function formatDateInTimezone(
  iso: string,
  timezone: string,
  format: 'short' | 'long' | 'time' | 'monthDay'
): string {
  try {
    // A show date names a calendar DAY (stored as midnight-UTC timestamptz).
    // Converting it through a timezone rolls it back a day west of UTC; only a
    // genuine instant gets the zone applied. See _shared/landing/calendarDate.
    const { date, isCalendarDay } = resolveDisplayDate(iso);
    if (isNaN(date.getTime())) return '';
    const opts: Intl.DateTimeFormatOptions = isCalendarDay ? {} : { timeZone: timezone };
    if (format === 'short') {
      return date.toLocaleDateString('en-US', {
        ...opts,
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    }
    if (format === 'long') {
      return date.toLocaleDateString('en-US', {
        ...opts,
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      });
    }
    if (format === 'time') {
      return date.toLocaleTimeString('en-US', {
        ...opts,
        hour: 'numeric',
        minute: '2-digit',
        timeZoneName: 'short',
      });
    }
    if (format === 'monthDay') {
      return date.toLocaleDateString('en-US', { ...opts, month: 'short', day: 'numeric' });
    }
    return '';
  } catch {
    return iso;
  }
}

export function formatDateRange(
  startIso: string | null,
  endIso: string | null,
  timezone: string
): string {
  if (!startIso) return '';
  // formatShowDate applies the timezone only to real instants; these columns
  // arrive as midnight UTC and must render as the day they name.
  const startMonth = formatShowDate(startIso, timezone, { month: 'short' });
  const startDay = formatShowDate(startIso, timezone, { day: 'numeric' });
  if (!startMonth) return '';

  const end = endIso ? new Date(endIso) : null;

  if (!end || isNaN(end.getTime()) || endIso === startIso) {
    return `${startMonth} ${startDay}`;
  }

  const endMonth = formatShowDate(endIso, timezone, { month: 'short' });
  const endDay = formatShowDate(endIso, timezone, { day: 'numeric' });

  if (startMonth === endMonth) {
    return `${startMonth} ${startDay}–${endDay}`;
  }
  return `${startMonth} ${startDay} – ${endMonth} ${endDay}`;
}
