/**
 * The payout promise to clubs, in one place (MYK9-1956 owner decision, MYK9-1985).
 *
 * A club is told its entry fees are sent "within five business days of your
 * show's last day". This module is the one copy of that arithmetic. The club's
 * Payments tab reads it, and any later server copy (the payout run, an email)
 * must mirror it and pin itself to this module's colocated test, the way
 * payoutLedger.ts mirrors _shared/payoutCalc.ts.
 *
 * Business days are Monday to Friday. Bank holidays are not counted out: the
 * promise is a deadline the owner approves payouts against, not a bank's
 * settlement calendar.
 *
 * NOT the owner's ledger date. payoutLedger.ts computeSettleDate still adds
 * three CALENDAR days to the show's end, because that is when the payout run
 * first picks a show up. That date is the operator's, and is left alone here.
 *
 * Pure: the only import is the dependency-free calendar-date primitive.
 */
import { calendarDateInTimeZone } from '@/utils/calendarDate';

/** The owner's promise: paid within this many business days of the show's last day. */
export const PAYOUT_PROMISE_BUSINESS_DAYS = 5;

const CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Parse `YYYY-MM-DD` as a UTC midnight, or null when it is not a real calendar date. */
function parseCalendarDate(value: string): Date | null {
  const match = CALENDAR_DATE.exec(value);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
    ? date
    : null;
}

/**
 * The calendar day of a stored show date. `shows.end_date` is stored as
 * midnight UTC (MYK9-2131), so its first ten characters are the day itself.
 */
export function showCalendarDay(value: string | null | undefined): string | null {
  if (!value) return null;
  const day = value.slice(0, 10);
  return parseCalendarDate(day) ? day : null;
}

/** `isoDate` plus `days` business days (Saturday and Sunday skipped), as `YYYY-MM-DD`. */
export function addBusinessDays(isoDate: string, days: number): string | null {
  const date = parseCalendarDate(isoDate);
  if (!date) return null;
  let remaining = days;
  while (remaining > 0) {
    date.setUTCDate(date.getUTCDate() + 1);
    const weekday = date.getUTCDay();
    if (weekday !== 0 && weekday !== 6) remaining -= 1;
  }
  return date.toISOString().slice(0, 10);
}

/** The date a show's payout is promised by: five business days after its last day. */
export function payoutDueDate(lastDay: string): string | null {
  return addBusinessDays(lastDay, PAYOUT_PROMISE_BUSINESS_DAYS);
}

export interface PayoutTimeline {
  lastDay: string;
  dueDate: string;
  /** Today on the show's calendar. */
  today: string;
  /** The show's last day is behind us, in the show's own timezone. */
  showEnded: boolean;
  /** The promised date has passed: the club must never be shown it as still expected. */
  pastDue: boolean;
}

/**
 * Where today sits against a show's payout promise. `timeZone` is the show's
 * (its first trial's zone, through getTrialTimezone): "today" is the show's
 * calendar day, not the browser's.
 */
export function payoutTimeline(
  lastDay: string | null,
  timeZone: string,
  now: Date
): PayoutTimeline | null {
  const day = showCalendarDay(lastDay);
  if (!day) return null;
  const dueDate = payoutDueDate(day);
  if (!dueDate) return null;
  const today = calendarDateInTimeZone(now, timeZone);
  return { lastDay: day, dueDate, today, showEnded: today > day, pastDue: today > dueDate };
}
