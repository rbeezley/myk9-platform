import type { HeritageLandingData } from '@/features/heritage/landing/types';
import { formatDateInTimezone } from '@/features/heritage/landing/utils/dateFormat';

export function shortDate(iso: string | null, timezone: string): string {
  if (!iso) return 'TBD';
  const stableIso = iso.includes('T') ? iso : `${iso}T12:00:00`;
  return formatDateInTimezone(stableIso, timezone, 'short');
}

export function formatDateRange(data: HeritageLandingData): string {
  if (!data.trialStartDate) return 'Dates TBD';
  const start = shortDate(data.trialStartDate, data.timezone);
  if (!data.trialEndDate || data.trialEndDate === data.trialStartDate) return start;
  const end = shortDate(data.trialEndDate, data.timezone);
  return `${start} – ${end}`;
}
