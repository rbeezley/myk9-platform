/**
 * Formats a date range for display. Used by SPA components.
 * Note: API functions (api/og-show.ts, api/og-show-image.tsx) duplicate this function
 * because Vercel serverless functions cannot import from src/.
 */
export function formatDateRange(startDate: string, endDate: string): string {
  const start = new Date(startDate + 'T00:00:00');
  const end = new Date(endDate + 'T00:00:00');
  const opts: Intl.DateTimeFormatOptions = { month: 'long', day: 'numeric', year: 'numeric' };

  if (startDate === endDate) {
    return start.toLocaleDateString('en-US', opts);
  }
  if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
    return `${start.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}–${end.getDate()}, ${end.getFullYear()}`;
  }
  return `${start.toLocaleDateString('en-US', opts)} – ${end.toLocaleDateString('en-US', opts)}`;
}
