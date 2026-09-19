/**
 * The calendar-date primitives, in one dependency-free place.
 *
 * `entryWindowDate.ts` and `features/_shared/isDayOfShowEntry.ts` both need
 * "what calendar day is it, in this zone". `entryWindowDate` cannot be the
 * shared home for it: it imports `@/utils/dateLocal`, which imports
 * `@/services/LoggingService`, and pulling that into `getShowEntryFee`'s import
 * chain breaks registration tests that mock the logging module with a factory.
 * So the primitive lives here, importing nothing, and both modules call it.
 *
 * Two copies of "today in the show's zone" is the exact shape of the bug
 * MYK9-642 is about, so this module exists to keep the count at one.
 */

/**
 * The calendar date at `now` in `timeZone`, as `YYYY-MM-DD`.
 *
 * Throws `RangeError` on an unrecognized IANA zone, exactly as
 * `Intl.DateTimeFormat` does — callers decide what a bad zone means. Prefer
 * `getTrialTimezone` (which validates and reports) over guarding here.
 */
export function calendarDateInTimeZone(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find(candidate => candidate.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

/** The calendar date at `now` in the browser's own zone, as `YYYY-MM-DD`. */
export function calendarDateLocal(now: Date): string {
  const year = String(now.getFullYear()).padStart(4, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
