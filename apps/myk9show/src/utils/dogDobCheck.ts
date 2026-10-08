import { MIN_ENTRY_AGE_MONTHS, getAgeInMonths } from '@/hooks/useEntryEligibility';
import { parseLocalDateString } from '@/utils/dateLocal';

/**
 * Date-of-birth sanity checks for the dog forms (MYK9-1060). A dog saved with
 * a creation-day birthday greys out in the show picker as "too young"; these
 * catch the typo where it is made. Same age math and 6-month floor as the
 * picker (`getAgeInMonths`, `MIN_ENTRY_AGE_MONTHS`) — no second policy.
 */

/** True when the `YYYY-MM-DD` birthday is after `now`. Unparseable input is not "future". */
export function isFutureDob(dateOfBirth: string, now: Date = new Date()): boolean {
  const dob = parseLocalDateString(dateOfBirth);
  return !!dob && dob > now;
}

const formatLongDate = (date: Date): string =>
  date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

/**
 * Non-blocking warning when the birthday makes the dog too young to enter on
 * `onDate` (the show's start date when the form knows it, otherwise today).
 * Puppies are legitimate, so this never blocks a save.
 */
export function getUnderMinAgeDobWarning(
  dateOfBirth: string,
  callName: string,
  onDate?: string
): string | null {
  const dob = parseLocalDateString(dateOfBirth);
  if (!dob || isFutureDob(dateOfBirth)) return null;
  const asOf = (onDate ? parseLocalDateString(onDate) : undefined) ?? new Date();
  if (getAgeInMonths(dateOfBirth, asOf) >= MIN_ENTRY_AGE_MONTHS) return null;
  const name = callName.trim() || 'This dog';
  return `${name} would be under ${MIN_ENTRY_AGE_MONTHS} months on ${formatLongDate(asOf)} and can't be entered. Check the date of birth.`;
}
