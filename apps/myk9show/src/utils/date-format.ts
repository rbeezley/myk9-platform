/** Parse a YYYY-MM-DD or ISO timestamp as local midnight to avoid UTC-offset surprises. */
export function toLocalDate(isoStr: string): Date {
  const dateOnly = isoStr.split('T')[0] ?? isoStr;
  return new Date(dateOnly + 'T00:00:00');
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
  monthFormat: 'long' | 'short' = 'long',
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
