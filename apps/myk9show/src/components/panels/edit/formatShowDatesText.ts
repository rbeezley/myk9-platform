import { formatDateRange } from '@/utils/date-format';

/** One day once, or "first to last"; each day in the show's existing date format. */
export function formatShowDatesText(startDate: string, endDate: string): string {
  if (!startDate) return 'No dates yet';
  const start = formatDateRange(startDate, startDate);
  const end = endDate ? formatDateRange(endDate, endDate) : start;
  return start === end ? start : `${start} to ${end}`;
}
