import type { HeritageLandingData } from '@/features/heritage/landing/types';
import { TO_BE_ANNOUNCED_LABEL } from '@/lib/format/fallbackLabels';
import { formatDateInTimezone } from '@/features/heritage/landing/utils/dateFormat';

const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function formatDateOnly(iso: string): string | null {
  const match = DATE_ONLY_RE.exec(iso);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return date.toLocaleDateString('en-US', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function shortDate(iso: string | null, timezone: string): string {
  if (!iso) return TO_BE_ANNOUNCED_LABEL;
  const dateOnly = formatDateOnly(iso);
  if (dateOnly) return dateOnly;
  return formatDateInTimezone(iso, timezone, 'short');
}

export function formatDateRange(data: HeritageLandingData): string {
  if (!data.trialStartDate) return 'Dates to be announced';
  const start = shortDate(data.trialStartDate, data.timezone);
  if (!data.trialEndDate || data.trialEndDate === data.trialStartDate) return start;
  const end = shortDate(data.trialEndDate, data.timezone);
  return `${start} – ${end}`;
}
