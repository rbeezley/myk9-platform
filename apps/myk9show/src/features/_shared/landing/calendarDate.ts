/**
 * The single rule for "is this show date a calendar DAY, or a real instant?"
 *
 * Every landing variant needs this and each had its own copy, so the bug below
 * was live in all eight at once through three different code shapes.
 *
 * `shows.start_date`, `end_date`, `entry_open_date` and `entry_close_date` name
 * calendar days — but they are `timestamptz` columns (migration 035 converted
 * them from DATE), so PostgREST serializes them as `2026-09-01T00:00:00+00:00`
 * and `showMappers` passes that through raw. Formatting that instant in any zone
 * behind UTC rolls the displayed date back a day: a show closing September 1
 * renders "Aug 31" in Chicago and New York alike.
 *
 * Heritage diagnosed this, documented it in a ten-line comment, and gated its
 * fix on `/^\d{4}-\d{2}-\d{2}$/` — a bare date, which these columns have not
 * produced since migration 035. So the corrected branch was DEAD CODE, heritage
 * rendered the wrong day too, monogram inherited the dead fix by copy, headline
 * falls back to heritage's formatter, and the other five never had a guard at
 * all. Three shapes, one wrong answer.
 *
 * Hence: match the midnight-UTC form as well as the bare form, and keep the rule
 * in exactly one place.
 *
 * Note this deliberately does NOT reuse `utils/date-format.ts#toLocalDateOnly`.
 * That helper maps EVERY instant to a calendar date, which would silently widen
 * a genuine mid-day cutoff into a whole day. Only exact midnight UTC means "a
 * day"; anything else is a real moment and must stay one.
 */

/** A bare `YYYY-MM-DD`, or that same day serialized as midnight UTC. */
const CALENDAR_DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})(?:T00:00:00(?:\.0+)?(?:Z|\+00:?00))?$/;

export interface CalendarDayParts {
  year: number;
  month: number;
  day: number;
}

/**
 * Returns the calendar day a show-date value names, or `null` when the value is
 * a genuine instant (or unparseable). Callers format the day WITHOUT a timezone
 * conversion — a calendar date has no zone to convert through — and pass only a
 * real instant through `timeZone`.
 */
export function getCalendarDayParts(iso: string | null | undefined): CalendarDayParts | null {
  if (!iso) return null;
  const match = CALENDAR_DAY_PATTERN.exec(iso);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  // Reject impossible days ("2026-02-31") rather than letting Date roll them over.
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    return null;
  }

  return { year, month, day };
}

/**
 * Builds a local `Date` carrying the named calendar day, with no UTC or timezone
 * conversion, so `toLocaleDateString` without a `timeZone` renders that exact day.
 */
export function toLocalCalendarDate(parts: CalendarDayParts): Date {
  return new Date(parts.year, parts.month - 1, parts.day);
}

/**
 * Resolves a show-date string for display.
 *
 * Returns the `Date` to format and whether a `timeZone` option should be applied.
 * A calendar day must be formatted WITHOUT one; a real instant must be formatted
 * WITH one.
 */
export function resolveDisplayDate(iso: string): { date: Date; isCalendarDay: boolean } {
  const parts = getCalendarDayParts(iso);
  if (parts) {
    return { date: toLocalCalendarDate(parts), isCalendarDay: true };
  }
  return { date: new Date(iso), isCalendarDay: false };
}

/**
 * Formats a show-date string, applying the show's timezone ONLY when the value
 * is a real instant.
 *
 * Use this anywhere a landing renders a stored show date. Building
 * `new Date(iso)` and passing `{ timeZone }` unconditionally is exactly the bug
 * this module exists to stop: it silently shows the previous day to every viewer
 * west of UTC, because these columns arrive as midnight UTC.
 */
export function formatShowDate(
  iso: string | null | undefined,
  timezone: string,
  options: Intl.DateTimeFormatOptions
): string {
  if (!iso) return '';
  const { date, isCalendarDay } = resolveDisplayDate(iso);
  if (isNaN(date.getTime())) return '';
  return date.toLocaleDateString(
    'en-US',
    isCalendarDay ? options : { ...options, timeZone: timezone }
  );
}
