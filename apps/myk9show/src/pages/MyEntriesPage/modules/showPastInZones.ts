/**
 * The one "is this show over?" rule, reckoned in the trials' own timezones.
 *
 * Shared by the My Shows check-in gate and sections (`dayCheckIn`) and the
 * Upcoming / Completed filter (`myEntriesStats.helpers.isCompletedEntry`), so
 * near device midnight they can never disagree (MYK9-1586). Lives in its own
 * leaf module because `dayCheckIn` already imports the stats helpers.
 *
 * @module MyEntriesPage/modules/showPastInZones
 */

/** The calendar day (`YYYY-MM-DD`) a local-midnight `Date` stands for. */
export function calendarDayOf(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** The calendar day (`YYYY-MM-DD`) an INSTANT falls on, in the given zone. */
export function calendarDayInZone(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find(part => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/**
 * UTC-12: the last place on earth to reach any given calendar day. POSIX
 * inverts the sign in these names, so `Etc/GMT+12` IS UTC-12.
 */
export const LAST_ZONE_TO_ROLL_OVER = 'Etc/GMT+12';

/** Is this a usable trial date? An undefined or invalid one means the trial has not replicated. */
export function hasUsableDate(date: Date | undefined): date is Date {
  return !!date && !Number.isNaN(date.getTime());
}

/**
 * Is the show's last day behind `now` in EVERY given zone? With no zone the
 * answer is "only once every zone agrees" (UTC-12). An undated show is never
 * past.
 */
export function isLastDayPastInZones(
  lastDay: Date | undefined,
  zones: Iterable<string>,
  now: Date
): boolean {
  if (!hasUsableDate(lastDay)) return false;
  const lastDayKey = calendarDayOf(lastDay);
  const zoneList = [...new Set(zones)];
  if (zoneList.length === 0) return calendarDayInZone(now, LAST_ZONE_TO_ROLL_OVER) > lastDayKey;
  return zoneList.every(zone => calendarDayInZone(now, zone) > lastDayKey);
}
