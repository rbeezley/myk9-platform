/**
 * Date formatting helpers for Magazine surfaces.
 *
 * Identical shape to Heritage's `landing/utils/dateFormat.ts`, kept local so
 * the Magazine sections never reach into a sibling style for formatting.
 * All formats respect the trial's IANA timezone.
 */

export function formatDateInTimezone(
  iso: string,
  timezone: string,
  format: 'short' | 'long' | 'time'
): string {
  try {
    const date = new Date(iso);
    if (isNaN(date.getTime())) return '';

    const opts: Intl.DateTimeFormatOptions = { timeZone: timezone };

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
    return '';
  } catch {
    return iso;
  }
}

/** Format an ISO date as a journey step label, e.g. "15 Apr". */
export function formatJourneyDate(iso: string, timezone: string): string {
  try {
    const date = new Date(iso);
    if (isNaN(date.getTime())) return '';
    return date.toLocaleDateString('en-US', {
      timeZone: timezone,
      day: 'numeric',
      month: 'short',
    });
  } catch {
    return iso;
  }
}

/** Format an ISO date as a short editorial range, e.g. "Jun 12". */
export function formatShortDate(iso: string, timezone: string): string {
  try {
    const date = new Date(iso);
    if (isNaN(date.getTime())) return '';
    return date.toLocaleDateString('en-US', {
      timeZone: timezone,
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}

/**
 * Format two ISO dates as a short editorial range:
 *  - same month, different days  → "Jun 12 – 14"
 *  - cross-month                  → "Jun 30 – Jul 2"
 *  - single date / equal endpoints → "Jun 12"
 *  - either side missing          → "" (callers omit the row)
 *
 * Encapsulates the range composition so sections never hand-roll
 * `.split(' ')` / `.replace(',')` on Intl output — that pattern is
 * locale-fragile and silently breaks under future ICU updates. Both
 * inputs are formatted in the trial's IANA timezone.
 */
export function formatEditorialDateRange(
  startIso: string | null,
  endIso: string | null,
  timezone: string
): string {
  if (!startIso) return '';
  const start = new Date(startIso);
  if (isNaN(start.getTime())) return '';
  const opts: Intl.DateTimeFormatOptions = {
    timeZone: timezone,
    month: 'short',
    day: 'numeric',
  };
  const startStr = start.toLocaleDateString('en-US', opts);

  if (!endIso || endIso === startIso) return startStr;
  const end = new Date(endIso);
  if (isNaN(end.getTime())) return startStr;
  const endStr = end.toLocaleDateString('en-US', opts);

  // Same month → drop the month from the end, e.g. "Jun 12 – 14".
  // Cross-month → keep both, e.g. "Jun 30 – Jul 2".
  // Compare month via Intl in the same timezone so DST + cross-midnight
  // edge cases route to the same month bucket the user sees.
  const monthOpts: Intl.DateTimeFormatOptions = { timeZone: timezone, month: 'short' };
  const sameMonth =
    start.toLocaleDateString('en-US', monthOpts) === end.toLocaleDateString('en-US', monthOpts);
  if (sameMonth) {
    const endDay = end.toLocaleDateString('en-US', { timeZone: timezone, day: 'numeric' });
    return `${startStr} – ${endDay}`;
  }
  return `${startStr} – ${endStr}`;
}
