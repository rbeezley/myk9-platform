/**
 * Where an exhibitor's link about a class they entered should land (MYK9-2134).
 *
 * One home per class: Ringside ("Your dogs today") carries the show day, My
 * Shows carries every other day. Neither is the class page, which is for a
 * class's released results. The day is the TRIAL's calendar day in the TRIAL's
 * own time zone (`getTrialTimezone`), the same rule My Shows uses for "Where
 * to be today".
 *
 * Anything that cannot be placed on the day (no date, no resolved zone) goes to
 * My Shows, which makes no show-day claim and itself links to Ringside once the
 * day is known.
 */
// The same day rule as My Shows' `trialDayState` (dayCheckIn.ts), read from its dependency-free
// module: this helper runs in the alert monitor, which ships in the entry chunk.
import {
  calendarDayInZone,
  calendarDayOf,
  hasUsableDate,
} from '@/pages/MyEntriesPage/modules/showPastInZones';
import { parseLocalDateString } from '@/utils/dateLocal';

/** My Shows, the exhibitor's home before and after a trial day. */
export const MY_SHOWS_PATH = '/exhibitor/entries';

/** Ringside for a show; an exhibitor-only account lands on "Your dogs today". */
export function ringsideShowPath(showId: string): string {
  return `/at-show/${showId}`;
}

export interface ExhibitorShowDayLinkInput {
  showId: string;
  /** The trial's calendar day, `YYYY-MM-DD` (a time suffix is ignored); empty when unknown. */
  trialDate: string | null | undefined;
  /** The trial's resolved IANA zone, from `getTrialTimezone`; undefined while the trial is unknown. */
  timezone: string | undefined;
  now?: Date;
}

export function exhibitorShowDayHref({
  showId,
  trialDate,
  timezone,
  now = new Date(),
}: ExhibitorShowDayLinkInput): string {
  if (!timezone || !trialDate) return MY_SHOWS_PATH;
  const day = parseLocalDateString(trialDate.split('T')[0]);
  const isToday = hasUsableDate(day) && calendarDayOf(day) === calendarDayInZone(now, timezone);
  return isToday ? ringsideShowPath(showId) : MY_SHOWS_PATH;
}
