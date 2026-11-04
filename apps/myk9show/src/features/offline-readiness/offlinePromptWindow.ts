import { calendarDateInTimeZone } from '@/utils/calendarDate';

/**
 * MYK9-1621: saving an offline copy only matters on the device that will run the show, close to
 * show day. The amber "not saved on this device" prompt shows from this many calendar days
 * before the show's first day until the show's last day ends.
 */
export const OFFLINE_PROMPT_LEAD_DAYS = 3;

const DATE_PREFIX = /^(\d{4})-(\d{2})-(\d{2})/;

function dayNumber(date: string | null | undefined): number | null {
  const match = date ? DATE_PREFIX.exec(date) : null;
  if (!match) return null;
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / 86_400_000;
}

/**
 * True from 00:00 on (first show day - 3 days) through the end of the last show day, on the
 * show's own calendar. Fails toward showing the prompt: unreadable dates or an unusable
 * timezone are "in the window", because hiding the prompt on a show-day device is the costly
 * mistake.
 */
export function isInOfflinePromptWindow(input: {
  firstDay: string | null | undefined;
  lastDay?: string | null | undefined;
  timeZone: string | null | undefined;
  now: Date;
}): boolean {
  const first = dayNumber(input.firstDay);
  if (first === null || !input.timeZone) return true;
  const last = dayNumber(input.lastDay) ?? first;
  let today: number | null;
  try {
    today = dayNumber(calendarDateInTimeZone(input.now, input.timeZone));
  } catch {
    return true;
  }
  if (today === null) return true;
  return today >= first - OFFLINE_PROMPT_LEAD_DAYS && today <= Math.max(first, last);
}
