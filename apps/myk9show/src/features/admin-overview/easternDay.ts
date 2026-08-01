/**
 * Eastern day boundaries for the admin overview.
 *
 * INTENT: "today" on this platform means the Eastern day, because show schedules
 * do. A UTC day boundary would roll "entries today" over at 8pm Eastern — the
 * exact hours a secretary is still taking entries the evening before a show.
 * The UI says the timezone out loud for the same reason.
 */

const EASTERN = 'America/New_York';

/**
 * Milliseconds to add to a UTC instant to get the wall-clock time in `tz`.
 * Derived from Intl rather than hardcoded, so DST is handled without a table.
 */
function tzOffsetMs(utcMs: number, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(utcMs));

  const at = (type: string) => Number(parts.find(p => p.type === type)?.value ?? '0');
  // `hour` comes back as 24 at midnight under hour12:false in some engines.
  const asIfUtc = Date.UTC(
    at('year'),
    at('month') - 1,
    at('day'),
    at('hour') % 24,
    at('minute'),
    at('second')
  );
  return asIfUtc - utcMs;
}

/**
 * The UTC instant at which the current Eastern day began.
 *
 * On the two DST changeover days the offset before and after local midnight
 * differ by an hour, so this can be off by that hour on those two days a year.
 * That is a deliberate trade: the alternative is a timezone library for a
 * boundary that feeds four counters.
 */
export function easternDayStartMs(now: number): number {
  const offset = tzOffsetMs(now, EASTERN);
  const local = new Date(now + offset);
  const localMidnight = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  return localMidnight - offset;
}

/** ISO string for the start of the current Eastern day — a PostgREST bound. */
export function easternDayStartIso(now: number): string {
  return new Date(easternDayStartMs(now)).toISOString();
}

/** `YYYY-MM-DD` for the current Eastern day — for comparing against date columns. */
export function easternDateKey(now: number): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: EASTERN,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(now));
}
