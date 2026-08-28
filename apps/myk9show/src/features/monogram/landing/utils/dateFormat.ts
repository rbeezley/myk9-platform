import { resolveDisplayDate } from '@/features/_shared/landing/calendarDate';
/**
 * Date formatting helpers for Monogram surfaces.
 * All formatting respects the trial's IANA timezone.
 *
 * Mirrors features/heritage/landing/utils/dateFormat.ts verbatim — kept as a
 * sibling rather than imported across feature boundaries to keep Monogram
 * self-contained for future style-level refactors.
 */

// UPDATE: the guard that used to live here was right in intent and dead in
// practice. These are `timestamptz` columns (migration 035), so they arrive as
// "2026-09-01T00:00:00+00:00" and never matched a bare YYYY-MM-DD -- so this
// variant rendered the wrong day too, having copied heritage's dead fix. The
// rule now lives in _shared/landing/calendarDate.ts, matching both forms.
function parseAsCalendarOrInstant(iso: string): { date: Date; isDateOnly: boolean } {
  const { date, isCalendarDay } = resolveDisplayDate(iso);
  return { date, isDateOnly: isCalendarDay };
}

export function formatDateInTimezone(
  iso: string,
  timezone: string,
  format: 'short' | 'long' | 'time' | 'monthDay'
): string {
  try {
    const { date, isDateOnly } = parseAsCalendarOrInstant(iso);
    if (isNaN(date.getTime())) return '';

    // A date-only value has no meaningful timezone to convert through —
    // format it as the calendar date it is. Only a real timestamp gets the
    // trial's IANA timezone applied.
    const opts: Intl.DateTimeFormatOptions = isDateOnly ? {} : { timeZone: timezone };

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
      if (isDateOnly) return ''; // a calendar date has no time-of-day to show
      return date.toLocaleTimeString('en-US', {
        ...opts,
        hour: 'numeric',
        minute: '2-digit',
        timeZoneName: 'short',
      });
    }
    if (format === 'monthDay') {
      return date.toLocaleDateString('en-US', {
        ...opts,
        month: 'short',
        day: 'numeric',
      });
    }
    return '';
  } catch {
    return iso;
  }
}

/** Format a range like "Jun 12–14" when both dates fall in one month, or
 *  "Jun 30 – Jul 2" when they span months. Returns just the start date if end
 *  is missing or equal. */
export function formatDateRange(
  startIso: string | null,
  endIso: string | null,
  timezone: string
): string {
  if (!startIso) return '';
  const { date: start, isDateOnly: startIsDateOnly } = parseAsCalendarOrInstant(startIso);
  if (isNaN(start.getTime())) return '';
  const startOpts: Intl.DateTimeFormatOptions = startIsDateOnly ? {} : { timeZone: timezone };

  const startMonth = start.toLocaleDateString('en-US', { ...startOpts, month: 'short' });
  const startDay = start.toLocaleDateString('en-US', { ...startOpts, day: 'numeric' });

  if (!endIso || endIso === startIso) {
    return `${startMonth} ${startDay}`;
  }

  const { date: end, isDateOnly: endIsDateOnly } = parseAsCalendarOrInstant(endIso);
  if (isNaN(end.getTime())) {
    return `${startMonth} ${startDay}`;
  }
  const endOpts: Intl.DateTimeFormatOptions = endIsDateOnly ? {} : { timeZone: timezone };

  const endMonth = end.toLocaleDateString('en-US', { ...endOpts, month: 'short' });
  const endDay = end.toLocaleDateString('en-US', { ...endOpts, day: 'numeric' });

  if (startMonth === endMonth) {
    return `${startMonth} ${startDay}–${endDay}`;
  }
  return `${startMonth} ${startDay} – ${endMonth} ${endDay}`;
}
