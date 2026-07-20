import { formatTime } from '@/lib/format/dates';

export function formatAtShowClassTime(value: string | null | undefined, timeZone: string): string {
  if (!value) return '';
  if (value.includes('T')) return formatTime(value, timeZone);
  const match = value.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (!match) return value;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const meridiem = match[3]?.toUpperCase();
  if (meridiem) hour = (hour % 12) + (meridiem === 'PM' ? 12 : 0);
  const hour12 = hour % 12 || 12;
  return `${hour12}:${String(minute).padStart(2, '0')} ${hour >= 12 ? 'PM' : 'AM'}`;
}
