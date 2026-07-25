/**
 * Date-only (calendar day) parsing/formatting for Health records.
 *
 * Health date columns (date_given, expiration_date, visit_date, start_date,
 * discovered_date, test_date, etc.) are `YYYY-MM-DD` strings with no time
 * component. `new Date('YYYY-MM-DD')` parses that as UTC midnight, which
 * displays the previous calendar day in any negative UTC offset timezone
 * (e.g. America/Chicago). Reuses the existing local-component parser from
 * `@/utils/dateLocal` instead of a string-concatenation workaround.
 */
import { parseLocalDateString } from '@/utils/dateLocal';

/**
 * Parse a Health `YYYY-MM-DD` calendar date into a local Date built from its
 * year/month/day components (never through UTC). Malformed input returns an
 * Invalid Date rather than throwing, so callers can guard with `isNaN`.
 */
export function parseHealthDate(dateOnly: string): Date {
  return parseLocalDateString(dateOnly) ?? new Date(NaN);
}

/** Format a Health `YYYY-MM-DD` calendar date for display without a day shift. */
export function formatHealthDate(dateOnly: string, locale = 'en-US'): string {
  const date = parseHealthDate(dateOnly);
  if (isNaN(date.getTime())) return '';
  return date.toLocaleDateString(locale);
}

/** Calendar year of a Health `YYYY-MM-DD` date, or null for malformed input. */
export function healthDateYear(dateOnly: string): number | null {
  const date = parseHealthDate(dateOnly);
  return isNaN(date.getTime()) ? null : date.getFullYear();
}
