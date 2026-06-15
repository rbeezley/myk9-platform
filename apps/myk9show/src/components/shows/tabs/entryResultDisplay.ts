import { parseLocalDateString } from '@/utils/dateLocal';
import { startOfLocalDay } from '@/pages/MyEntriesPage/modules/myEntriesStats.helpers';

interface PendingResultEntry {
  hasResult: boolean;
  result?: unknown;
  trialDate: string;
}

function parseTrialDate(value: string): Date | undefined {
  const localDate = parseLocalDateString(value);
  if (localDate) return localDate;

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

export function isPastTrialDate(trialDate: string, now = new Date()): boolean {
  const parsed = parseTrialDate(trialDate);
  if (!parsed) return false;

  return startOfLocalDay(parsed).getTime() < startOfLocalDay(now).getTime();
}

export function getPendingResultLabel(entry: PendingResultEntry, now = new Date()): string | null {
  if (entry.hasResult && entry.result) return null;
  // Result rows are class-specific, so use trialDate here instead of whole-show end dates.
  return isPastTrialDate(entry.trialDate, now) ? 'Awaiting results' : 'Upcoming';
}
