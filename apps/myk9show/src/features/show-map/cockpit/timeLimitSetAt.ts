import { calendarDateInTimeZone } from '@/utils/calendarDate';

/**
 * When a class's time limit was set (MYK9-2120), for the Requirements row: "set 2:14 PM" when
 * it was set today in the show's time zone, "set Nov 16, 2:14 PM" when it was set on another
 * day. Null when the class has no stamp (never set, or set before the column existed) or the
 * value does not parse, so the row shows nothing extra. `timeZone` comes from getTrialTimezone.
 */
export function formatTimeLimitSetAt(
  setAt: string | null | undefined,
  timeZone: string,
  now: Date = new Date()
): string | null {
  if (!setAt) return null;
  const date = new Date(setAt);
  if (!Number.isFinite(date.getTime())) return null;
  const sameDay = calendarDateInTimeZone(date, timeZone) === calendarDateInTimeZone(now, timeZone);
  const text = new Intl.DateTimeFormat('en-US', {
    timeZone,
    ...(sameDay ? {} : { month: 'short', day: 'numeric' }),
    hour: 'numeric',
    minute: '2-digit',
  })
    .formatToParts(date)
    .map(part => (part.type === 'literal' && part.value === ' at ' ? ', ' : part.value))
    .join('');
  // Newer ICU puts a narrow no-break space before AM/PM; plain spaces read and match the same.
  return `set ${text.replace(/\s/g, ' ')}`;
}
