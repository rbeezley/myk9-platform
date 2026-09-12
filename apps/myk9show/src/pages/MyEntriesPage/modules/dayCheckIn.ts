/**
 * "Today" for the My Shows show-day check-in gate — always the TRIAL's calendar
 * day in the TRIAL's timezone, never the device's (D8).
 *
 * `EntryClass.trialDate` is built by `parseShowDate`, which turns the
 * `trials.date` CALENDAR column into a LOCAL-midnight `Date`. So the calendar
 * day it represents is read with the local getters (`getFullYear` / `getMonth`
 * / `getDate`) — never by formatting that instant in another zone, which would
 * shift it across midnight. `now`, by contrast, is a real instant, so its
 * calendar day is read through `Intl` in the trial's zone. The Eastern-device /
 * Pacific-trial case is pinned in the tests.
 *
 * @module MyEntriesPage/modules/dayCheckIn
 */

import { isClassCheckInEligible } from './entryNextAction';
import type { MyShowClass, MyShowDog } from './groupEntriesByShow';
import type { MyEntry } from './my-entries-types';

/** The calendar day (`YYYY-MM-DD`) a local-midnight `Date` stands for. */
function calendarDayOf(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** The calendar day (`YYYY-MM-DD`) an INSTANT falls on, in the given zone. */
function calendarDayInZone(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find(part => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Trials carry a resolved zone; the migration default covers legacy rows. */
const DEFAULT_TIMEZONE = 'America/New_York';

/**
 * Is the trial's calendar day the same day as `now`, reckoned in the trial's
 * timezone? False when the class carries no trial date.
 */
export function isTrialDayToday(
  trialDate: Date | undefined,
  trialTimezone: string | undefined,
  now: Date
): boolean {
  if (!trialDate || Number.isNaN(trialDate.getTime())) return false;
  return calendarDayOf(trialDate) === calendarDayInZone(now, trialTimezone || DEFAULT_TIMEZONE);
}

/** Is the trial's calendar day still ahead of `now` in the trial's timezone? */
export function isTrialDayAhead(
  trialDate: Date | undefined,
  trialTimezone: string | undefined,
  now: Date
): boolean {
  if (!trialDate || Number.isNaN(trialDate.getTime())) return false;
  return calendarDayOf(trialDate) > calendarDayInZone(now, trialTimezone || DEFAULT_TIMEZONE);
}

/**
 * The weekday name of the trial's calendar day ("Saturday"), or `undefined`
 * when the class carries no trial date.
 *
 * The instant handed to `Intl` is midday UTC on that calendar day, so reading
 * it back in the trial's zone lands on the same day for every offset inside
 * ±12h — i.e. every zone a North American dog show runs in.
 */
export function weekdayLabel(
  trialDate: Date | undefined,
  trialTimezone: string | undefined
): string | undefined {
  if (!trialDate || Number.isNaN(trialDate.getTime())) return undefined;
  const midday = Date.UTC(trialDate.getFullYear(), trialDate.getMonth(), trialDate.getDate(), 12);
  return new Intl.DateTimeFormat('en-US', {
    timeZone: trialTimezone || DEFAULT_TIMEZONE,
    weekday: 'long',
  }).format(midday);
}

/** A class carries no check-in state yet. `'no-status'` is the DB's "not set". */
export function hasNoCheckInState(cls: MyShowClass): boolean {
  return cls.checkInStatus === undefined || cls.checkInStatus === 'no-status';
}

export interface DayCheckInContext {
  now: Date;
  /** The dog's owning order cards, keyed by `MyShowClass.orderId`. */
  ordersById: Record<string, MyEntry>;
  /** Resolved self-check-in cascade by class id; missing entries default open. */
  selfCheckinByClassId?: Record<string, boolean> | undefined;
  /** Whether the show's last day is already behind us. */
  isPastShow: boolean;
}

/** Is the class's own class-scoped self-check-in toggle open? */
export function isSelfCheckinEnabled(
  cls: MyShowClass,
  selfCheckinByClassId: Record<string, boolean> | undefined
): boolean {
  if (!cls.classId) return true;
  return selfCheckinByClassId?.[cls.classId] ?? true;
}

/**
 * Can this one class be checked in right now from My Shows?
 *
 * Every clause of the spec's gate, in one place, so the day button and the row
 * link can never disagree: not past, trial day is today in the trial's zone,
 * check-in eligible by the existing rule, no state yet, toggle open.
 */
export function isClassCheckInAvailableToday(cls: MyShowClass, ctx: DayCheckInContext): boolean {
  if (ctx.isPastShow) return false;
  if (!isTrialDayToday(cls.trialDate, cls.trialTimezone, ctx.now)) return false;
  const order = ctx.ordersById[cls.orderId];
  if (!order || !isClassCheckInEligible(order, cls)) return false;
  if (!hasNoCheckInState(cls)) return false;
  return isSelfCheckinEnabled(cls, ctx.selfCheckinByClassId);
}

export interface DayCheckInTargets {
  /** The classes the day button will check in, in class order. Possibly empty. */
  classes: MyShowClass[];
  /** Weekday of those classes' trial day, for the button label. */
  weekday: string | undefined;
}

/**
 * The classes a dog's one-tap "Check in for <weekday>" button would write.
 *
 * Only today's classes, only ones with no state, only ones the cascade allows —
 * so a half-finished batch can simply be re-derived and retried.
 */
export function deriveDayCheckInTargets(dog: MyShowDog, ctx: DayCheckInContext): DayCheckInTargets {
  const classes = dog.classes.filter(cls => isClassCheckInAvailableToday(cls, ctx));
  return {
    classes,
    weekday: classes[0] ? weekdayLabel(classes[0].trialDate, classes[0].trialTimezone) : undefined,
  };
}
