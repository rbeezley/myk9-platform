import { parseLocalDateString } from '@/utils/dateLocal';

interface PendingResultEntry {
  hasResult: boolean;
  result?: unknown;
  trialDate: string;
}

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
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
  return isPastTrialDate(entry.trialDate, now) ? 'Awaiting results' : 'Upcoming';
}
