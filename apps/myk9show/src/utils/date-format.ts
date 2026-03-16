/**
 * Formats a date range for display. Used by SPA components.
 * Note: API functions (api/og-show.ts, api/og-show-image.tsx) duplicate this function
 * because Vercel serverless functions cannot import from src/.
 */
export function formatDateRange(
  startDate: string,
  endDate: string,
  monthFormat: 'long' | 'short' = 'long'
): string {
  // Handle both date-only ("2026-03-14") and timestamptz ("2026-03-14T00:00:00+00:00") formats
  const startDateOnly = startDate.split('T')[0];
  const endDateOnly = endDate.split('T')[0];
  const start = new Date(startDateOnly + 'T00:00:00');
  const end = new Date(endDateOnly + 'T00:00:00');
  const opts: Intl.DateTimeFormatOptions = { month: monthFormat, day: 'numeric', year: 'numeric' };

  if (startDateOnly === endDateOnly) {
    return start.toLocaleDateString('en-US', opts);
  }
  if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
    return `${start.toLocaleDateString('en-US', { month: monthFormat, day: 'numeric' })}–${end.getDate()}, ${end.getFullYear()}`;
  }
  return `${start.toLocaleDateString('en-US', opts)} – ${end.toLocaleDateString('en-US', opts)}`;
}
