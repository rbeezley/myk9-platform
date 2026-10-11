import { parseClassTime } from '@myk9/ringside';
import { formatTime } from '@/lib/format/dates';

export function formatAtShowClassTime(value: string | null | undefined, timeZone: string): string {
  if (!value) return '';
  if (value.includes('T')) return formatTime(value, timeZone);
  const parsed = parseClassTime(value);
  if (parsed?.kind !== 'clock') return value;
  const hour12 = parsed.hour24 % 12 || 12;
  return `${hour12}:${String(parsed.minute).padStart(2, '0')} ${parsed.hour24 >= 12 ? 'PM' : 'AM'}`;
}
