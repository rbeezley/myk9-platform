import { formatClockTime } from '@myk9/core/clock-time';
import { parseClassTime } from '@myk9/ringside/run-queue';
import { formatTime } from '@/lib/format/dates';

export function formatAtShowClassTime(value: string | null | undefined, timeZone: string): string {
  if (!value) return '';
  if (value.includes('T')) return formatTime(value, timeZone);
  const parsed = parseClassTime(value);
  if (parsed?.kind !== 'clock') return value;
  return formatClockTime(parsed.minutes);
}
