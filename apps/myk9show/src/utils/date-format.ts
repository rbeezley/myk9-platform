/** Parse a YYYY-MM-DD or ISO timestamp as local midnight to avoid UTC-offset surprises. */
export function toLocalDate(isoStr: string): Date {
  const dateOnly = isoStr.split('T')[0] ?? isoStr;
  return new Date(dateOnly + 'T00:00:00');
}

export type ShowDateRangeStatus = 'upcoming' | 'active' | 'past';

/**
 * Classify a show's DATE-typed range as upcoming / active / past in the user's
 * local timezone.
 *
 * `shows.start_date` / `shows.end_date` arrive as "YYYY-MM-DD" (or timestamptz
 * midnight-UTC). A raw `new Date("2026-05-15")` parses as UTC midnight — the
 * evening of May 14 for any US user — which flips a show to "past" up to a day
 * early. Parsing via `toLocalDate` and treating `endDate` as inclusive through
 * 23:59:59.999 local keeps the show active through the whole of its final day.
 * Mirrors the entry-window handling in `entryStatusUtils.ts`.
 */
export function showDateRangeStatus(
  startDate: string,
  endDate: string,
  now: Date = new Date()
): ShowDateRangeStatus {
  // Missing dates can't be classified — treat as not-yet-started, matching the
  // guard in the (now-deleted) calculateShowStatus this helper supersedes.
  if (!startDate || !endDate) return 'upcoming';

  const start = toLocalDate(startDate);
  const endOfDay = toLocalDate(endDate);
  endOfDay.setHours(23, 59, 59, 999);

  if (now < start) return 'upcoming';
  if (now > endOfDay) return 'past';
  return 'active';
}

/**
 * Extract a YYYY-MM-DD string in the user's local timezone from an ISO datetime.
 *
 * Use this for `DATE`-typed columns (start_date, end_date, entry_open_date,
 * entry_close_date) so a picker emitting "May 14 11:59 PM CDT"
 * (= "2026-05-15T04:59Z") doesn't get cast to May 15 by Postgres `::date`.
 */
export function toLocalDateOnly(isoStr: string): string {
  if (!isoStr) return isoStr;
  if (!isoStr.includes('T')) return isoStr;
  // A DATE column can round-trip as UTC midnight ("2026-05-15T00:00:00+00:00").
  // The intended date is the one in the string; local getters would misread it
  // as the prior day west of UTC. Preserve the calendar date directly.
  if (/T00:00:00(\.0+)?(Z|\+00:?00)$/.test(isoStr)) return isoStr.split('T')[0];
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return isoStr;
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Formats a date range for display. Used by SPA components.
 * Note: API functions (api/og-show.ts, api/og-show-image.tsx) duplicate this function
 * because Vercel serverless functions cannot import from src/.
 */
export function formatDateRange(
  startDate: string,
  endDate: string,
  monthFormat: 'long' | 'short' = 'short',
  showYear = true
): string {
  // Handle both date-only ("2026-03-14") and timestamptz ("2026-03-14T00:00:00+00:00") formats
  const startDateOnly = startDate.split('T')[0];
  const endDateOnly = endDate.split('T')[0];
  const start = new Date(startDateOnly + 'T00:00:00');
  const end = new Date(endDateOnly + 'T00:00:00');
  const opts: Intl.DateTimeFormatOptions = { month: monthFormat, day: 'numeric' };
  if (showYear) opts.year = 'numeric';

  if (startDateOnly === endDateOnly) {
    return start.toLocaleDateString('en-US', opts);
  }
  if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
    const suffix = showYear ? `, ${end.getFullYear()}` : '';
    return `${start.toLocaleDateString('en-US', { month: monthFormat, day: 'numeric' })}–${end.getDate()}${suffix}`;
  }
  return `${start.toLocaleDateString('en-US', opts)} – ${end.toLocaleDateString('en-US', opts)}`;
}
