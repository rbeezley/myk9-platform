// Deno-free (colocated vitest). The show's time zone and "today" in it, for the
// edge functions that price and gate entries.
//
// MYK9-1198 (owner decision 2026-10-15): "show day" is decided in the SHOW's
// time zone, the same for every exhibitor whatever their device zone. The show's
// zone is its FIRST trial's, chosen exactly as `submit_show_entries` chooses it:
// `ORDER BY t.date NULLS LAST, t.id LIMIT 1`, then COALESCE to America/New_York,
// then an unrecognised zone also falls back to America/New_York. The client's
// Finish Payment recovery (`cartStore.recovery.ts`) applies the same rule.

export const DEFAULT_SHOW_TIME_ZONE = 'America/New_York';

/** The trial columns the rule reads. Embed as `trials(id, date, timezone)`. */
export interface ShowTrialZoneRow {
  id: string;
  date: string | null;
  timezone: string | null;
}

function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** A zone `Intl` accepts, or America/New_York for a missing or invalid one. */
export function resolveShowTimeZone(timeZone: string | null | undefined): string {
  return timeZone && isValidTimeZone(timeZone) ? timeZone : DEFAULT_SHOW_TIME_ZONE;
}

/** The show's zone from its trials: the first by date (undated last), then id. */
export function showTimeZoneFromTrials(
  trials: readonly ShowTrialZoneRow[] | null | undefined
): string {
  const [first] = [...(trials ?? [])].sort((a, b) => {
    if (a.date !== b.date) {
      if (a.date == null) return 1;
      if (b.date == null) return -1;
      return a.date < b.date ? -1 : 1;
    }
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  return resolveShowTimeZone(first?.timezone);
}

/** The calendar date (`YYYY-MM-DD`) of `instant` in `timeZone`. */
export function calendarDateInTimeZone(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
}
