import { resolveDisplayDate } from '@/features/_shared/landing/calendarDate';
/**
 * Date formatting helpers for Heritage surfaces.
 * All formatting respects the trial's IANA timezone.
 */

// exhibitor-ux-remediation (date-formatting delta): `shows.start_date` /
// `entry_close_date` are DATE-only columns ("2026-08-01", no time component).
// `new Date('2026-08-01')` parses that as UTC midnight, and formatting a UTC
// instant in a timezone behind UTC (e.g. America/Chicago for a Tulsa, OK show)
// rolls the displayed date back a day — "Aug 1" became "Jul 31" on the
// landing page while the shows list (which doesn't run the string through a
// timezone conversion) correctly showed "Aug 1". A date-only value is a
// calendar date, not an instant — it must never be converted through a
// timezone at all, only a genuine timestamp (with a time component) should be.
// UPDATE: the guard here was right in intent and dead in practice. These are
// `timestamptz` columns (migration 035), so they arrive as
// "2026-09-01T00:00:00+00:00" and never matched a bare YYYY-MM-DD -- so this
// variant rendered the wrong day too. The rule now lives in
// _shared/landing/calendarDate.ts, which matches both forms.

export function formatDateInTimezone(
  iso: string,
  timezone: string,
  format: 'short' | 'long' | 'time'
): string {
  try {
    const { date, isCalendarDay: isDateOnly } = resolveDisplayDate(iso);
    if (isNaN(date.getTime())) return '';

    // A date-only value has no meaningful timezone to convert through — format
    // it as the calendar date it is. Only a real timestamp gets the trial's
    // IANA timezone applied.
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
    return '';
  } catch {
    return iso;
  }
}

/** Format an ISO date as a journey step label, e.g. "15 Apr". */
export function formatJourneyDate(iso: string, timezone: string): string {
  try {
    const { date, isCalendarDay: isDateOnly } = resolveDisplayDate(iso);
    if (isNaN(date.getTime())) return '';
    return date.toLocaleDateString('en-US', {
      ...(isDateOnly ? {} : { timeZone: timezone }),
      day: 'numeric',
      month: 'short',
    });
  } catch {
    return iso;
  }
}
