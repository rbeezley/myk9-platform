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
