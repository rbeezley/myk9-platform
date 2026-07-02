import { formatDateRange } from '@/utils/date-format';

export function formatShowsTableDateRange(startDate: string, endDate: string): string {
  return formatDateRange(startDate, endDate, 'short', true);
}
