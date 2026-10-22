/**
 * Pure formatters for the My Shows show header.
 *
 * These are CALENDAR dates (MYK9-384): `shows.start_date` / `end_date` are
 * DATE columns that `parseShowDate` already turned into LOCAL-midnight `Date`
 * objects. So every reading here goes through the local getters, and nothing
 * re-parses an ISO string or formats the instant in another zone — either one
 * shifts the day across midnight for western-hemisphere viewers.
 *
 * @module MyEntriesPage/modules/myShowHeaderFormat
 */

const WEEKDAY_MONTH_DAY: Intl.DateTimeFormatOptions = {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
};

function isRenderable(date: Date | undefined): date is Date {
  return date instanceof Date && !Number.isNaN(date.getTime());
}

function sameCalendarDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * The show header's date line.
 *
 * - one day, or no end date: `"Sat, Oct 24"`
 * - two days in one month: `"Sat–Sun, Oct 24–25"`
 * - spanning a month boundary: `"Sat, Oct 31 – Sun, Nov 1"`
 *
 * The compact same-month form is what the canvas specifies; the crossing form
 * spells both months out because "Oct 31–1" reads as a typo. Returns `''` when
 * the start date is missing or unparseable — the caller owns the placeholder.
 */
export function formatShowHeaderDateRange(showDate: Date | undefined, showEndDate?: Date): string {
  if (!isRenderable(showDate)) return '';
  const start = showDate.toLocaleDateString('en-US', WEEKDAY_MONTH_DAY);

  if (!isRenderable(showEndDate) || sameCalendarDay(showDate, showEndDate)) return start;
  // A malformed row with the end before the start reads as a single day
  // rather than printing a backwards range.
  if (showEndDate.getTime() < showDate.getTime()) return start;

  if (
    showDate.getFullYear() === showEndDate.getFullYear() &&
    showDate.getMonth() === showEndDate.getMonth()
  ) {
    const startWeekday = showDate.toLocaleDateString('en-US', { weekday: 'short' });
    const endWeekday = showEndDate.toLocaleDateString('en-US', { weekday: 'short' });
    const month = showDate.toLocaleDateString('en-US', { month: 'short' });
    return `${startWeekday}–${endWeekday}, ${month} ${showDate.getDate()}–${showEndDate.getDate()}`;
  }

  return `${start} – ${showEndDate.toLocaleDateString('en-US', WEEKDAY_MONTH_DAY)}`;
}

/**
 * "Scout's entry" / "Scout and Juni's entries" / "Scout, Juni and Willow's
 * entries" — the subject of a money strip's head line.
 *
 * Kept pure and separate from the strip because the possessive is the part
 * that reads wrong most easily, and it is worth pinning in a test.
 */
export function formatDogNamesPossessive(names: string[], maxNamed = 3): string {
  const list = names.filter(name => name.trim().length > 0);
  if (list.length === 0) return '';
  if (list.length === 1) return `${list[0]}'s`;
  // A show entered through dozens of orders would otherwise open its strip
  // with a paragraph of names (the seeded exhibitor has 63 at one show).
  // Name a few, count the rest, and keep the possessive on the group.
  if (list.length > maxNamed) {
    const rest = list.length - maxNamed;
    return `${list.slice(0, maxNamed).join(', ')} and ${rest} more ${rest === 1 ? "dog's" : "dogs'"}`;
  }
  return `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}'s`;
}
