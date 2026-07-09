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
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Build a local `Date` from a "YYYY-MM-DD" string's own Y/M/D — no UTC/timezone
 * conversion. Callers gate on DATE_ONLY_PATTERN first, so all three parts exist;
 * `Number(...)` (which accepts `undefined`) keeps this compiling cleanly even
 * under `noUncheckedIndexedAccess`, where the split parts type as
 * `string | undefined`.
 */
function parseDateOnlyAsLocalCalendarDate(dateOnly: string): Date {
  const parts = dateOnly.split('-');
  return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
}

export function formatDateInTimezone(
  iso: string,
  timezone: string,
  format: 'short' | 'long' | 'time'
): string {
  try {
    const isDateOnly = DATE_ONLY_PATTERN.test(iso);
    const date = isDateOnly ? parseDateOnlyAsLocalCalendarDate(iso) : new Date(iso);
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
    const isDateOnly = DATE_ONLY_PATTERN.test(iso);
    const date = isDateOnly ? parseDateOnlyAsLocalCalendarDate(iso) : new Date(iso);
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
