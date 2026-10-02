import { format } from 'date-fns';
import { parseLocalDateString } from '@/utils/dateLocal';

/** Parse "9:05 AM" / "09:05 pm" into 24-hour parts, or null when it is not a time. */
export function parseTimeOfDay(text: string): { hours: number; minutes: number } | null {
  const match = text.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM|am|pm)?$/);
  if (!match) return null;
  let hours = parseInt(match[1] ?? '', 10);
  const minutes = parseInt(match[2] ?? '', 10);
  const period = match[3]?.toUpperCase();
  if (period === 'PM' && hours !== 12) hours += 12;
  if (period === 'AM' && hours === 12) hours = 0;
  if (hours > 23 || minutes > 59) return null;
  return { hours, minutes };
}

/** One spelling for a time of day: "9:05 AM". Unparseable text comes back trimmed, untouched. */
export function normalizeTimeOfDay(text: string): string {
  const parts = parseTimeOfDay(text);
  if (!parts) return text.trim();
  const date = new Date(2000, 0, 1, parts.hours, parts.minutes);
  return format(date, 'h:mm a');
}

/**
 * The trial's date (`yyyy-MM-dd`) and start time ("9:00 AM") as ONE value for the
 * shared date-time field. A date with no time yet reads as midnight.
 */
export function composeTrialDateTime(trialDate: string, startTime: string): Date | undefined {
  const day = trialDate ? parseLocalDateString(trialDate) : undefined;
  if (!day) return undefined;
  const parts = parseTimeOfDay(startTime);
  const composed = new Date(day);
  composed.setHours(parts?.hours ?? 0, parts?.minutes ?? 0, 0, 0);
  return composed;
}

/** The inverse of `composeTrialDateTime`: the two stored strings. */
export function splitTrialDateTime(value: Date): { trialDate: string; plannedStartTime: string } {
  return { trialDate: format(value, 'yyyy-MM-dd'), plannedStartTime: format(value, 'hh:mm a') };
}
