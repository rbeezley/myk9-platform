import { formatShowDate, resolveDisplayDate } from '@/features/_shared/landing/calendarDate';
/**
 * Date formatting helpers for Poster surfaces. Mirrors the Banner /
 * Monogram / Heritage helpers — kept as a sibling rather than imported
 * across feature boundaries so the Poster feature stays self-contained.
 *
 * Poster also exposes an UPPERCASE-month variant (`monthDayUpper`) for
 * mono-strip and section labels where the design calls for "JUN 12—14".
 */

export function formatDateInTimezone(
  iso: string,
  timezone: string,
  format: 'short' | 'long' | 'time' | 'monthDay' | 'monthDayUpper'
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
    if (format === 'monthDayUpper') {
      return date
        .toLocaleDateString('en-US', { ...opts, month: 'short', day: 'numeric' })
        .toUpperCase();
    }
    return '';
  } catch {
    return iso;
  }
}

export function formatDateRange(
  startIso: string | null,
  endIso: string | null,
  timezone: string,
  uppercase: boolean = false
): string {
  if (!startIso) return '';
  // formatShowDate applies the timezone only to real instants. Building
  // `new Date(iso)` here and passing `{ timeZone }` unconditionally showed the
  // previous day west of UTC — the same bug as formatDateInTimezone, in a
  // second function that the per-variant audit table missed.
  const startMonth = formatShowDate(startIso, timezone, { month: 'short' });
  const startDay = formatShowDate(startIso, timezone, { day: 'numeric' });
  if (!startMonth) return '';

  const end = endIso ? new Date(endIso) : null;
  const apply = (s: string) => (uppercase ? s.toUpperCase() : s);

  if (!end || isNaN(end.getTime()) || endIso === startIso) {
    return apply(`${startMonth} ${startDay}`);
  }

  const endMonth = formatShowDate(endIso, timezone, { month: 'short' });
  const endDay = formatShowDate(endIso, timezone, { day: 'numeric' });

  if (startMonth === endMonth) {
    return apply(`${startMonth} ${startDay}—${endDay}`);
  }
  return apply(`${startMonth} ${startDay} – ${endMonth} ${endDay}`);
}

/** Pad a trial number as zero-padded 2-digit "01", "02", … */
export function padTrialNumber(n: number | string): string {
  const num = typeof n === 'number' ? n : parseInt(String(n), 10);
  if (isNaN(num)) return String(n);
  return num.toString().padStart(2, '0');
}
