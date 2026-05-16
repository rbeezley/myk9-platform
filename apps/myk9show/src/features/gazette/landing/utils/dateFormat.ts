/**
 * Date formatting helpers for Gazette surfaces.
 * All formatting respects the trial's IANA timezone.
 *
 * The masthead specifically wants the long-form ALL-CAPS rendering
 * ("FRIDAY, MAY 28, 2026") that doesn't appear elsewhere — see
 * `formatMastheadDate` below.
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

/**
 * Masthead date strip — "FRIDAY, MAY 28, 2026". Upper-cased version of the
 * long format, suitable for the IBM Plex Mono tracked label inside the
 * masthead strip.
 */
export function formatMastheadDate(iso: string | null | undefined, timezone: string): string | null {
  if (!iso) return null;
  const long = formatDateInTimezone(iso, timezone, 'long');
  return long ? long.toUpperCase() : null;
}

/** Format an ISO date as a journey-step label, e.g. "15 Apr". */
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
