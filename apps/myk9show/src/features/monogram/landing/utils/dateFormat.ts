/**
 * Date formatting helpers for Monogram surfaces.
 * All formatting respects the trial's IANA timezone.
 *
 * Mirrors features/heritage/landing/utils/dateFormat.ts verbatim — kept as a
 * sibling rather than imported across feature boundaries to keep Monogram
 * self-contained for future style-level refactors.
 */

// exhibitor-ux-remediation (date-formatting delta): `shows.start_date` /
// `end_date` / `entry_close_date` are DATE-only columns ("2026-08-01", no time
// component). `new Date('2026-08-01')` parses that as UTC midnight, and
// formatting a UTC instant in a timezone behind UTC (e.g. America/Chicago for
// a Tulsa, OK show) rolls the displayed date back a day — the audit walk saw
// "Jul 31 – Aug 2" here while the shows list correctly showed "Aug 1–3" for
// the same show. A date-only value is a calendar date, not an instant — it
// must never be converted through a timezone, only a genuine timestamp
// (with a time component) should be.
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Build a local `Date` from a "YYYY-MM-DD" string's own Y/M/D — no UTC/timezone conversion. */
function parseDateOnlyAsLocalCalendarDate(dateOnly: string): Date {
  const [year, month, day] = dateOnly.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function parseAsCalendarOrInstant(iso: string): { date: Date; isDateOnly: boolean } {
  const isDateOnly = DATE_ONLY_PATTERN.test(iso);
  return { date: isDateOnly ? parseDateOnlyAsLocalCalendarDate(iso) : new Date(iso), isDateOnly };
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
