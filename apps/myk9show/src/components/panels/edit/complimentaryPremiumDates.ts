/**
 * Date-only helpers for the complimentary Premium grant form.
 *
 * The expiration field is a native `<input type="date">`, so its value is a
 * bare `YYYY-MM-DD` calendar date with no timezone. Passing that straight to
 * `new Date(...)` parses it as midnight UTC, which in any negative-offset zone
 * (e.g. America/Chicago) lands on the PREVIOUS calendar day — access would end
 * a day early and history would display the wrong date. We therefore parse it
 * as a LOCAL calendar date (project precedent: `@/utils/dateLocal`) and end the
 * grant at the last instant of that local day.
 */
import { formatDateLocal, parseLocalDateString } from '@/utils/dateLocal';

/** Formats a Date as `YYYY-MM-DD` in LOCAL time for a native date input. */
export function toDateInputValue(date: Date): string {
  return formatDateLocal(date);
}

/**
 * Converts a `YYYY-MM-DD` date-input value to the last instant of that day in
 * the viewer's local timezone. Returns null when the string is not a valid
 * `YYYY-MM-DD` date.
 */
export function endOfLocalDay(dateString: string): Date | null {
  const parsed = parseLocalDateString(dateString);
  if (!parsed) return null;
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate(), 23, 59, 59, 999);
}
