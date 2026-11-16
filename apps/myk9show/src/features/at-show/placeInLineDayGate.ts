import { isTrialDayAhead } from '@/pages/MyEntriesPage/modules/dayCheckIn';
import { parseLocalDateString } from '@/utils/dateLocal';

/**
 * MYK9-2092: before the trial day no exhibitor screen claims a place in line (the order may
 * still be posted the night before). The same day rule the show page and the class page use
 * (`isTrialDayAhead`). These surfaces hold no trial timezone, so the day is judged in the
 * default zone, as that function does when none is given. No date, no gate.
 */
export function isBeforeTrialDay(trialDate: string | null | undefined, now = new Date()): boolean {
  if (!trialDate) return false;
  return isTrialDayAhead(parseLocalDateString(trialDate.slice(0, 10)), undefined, now);
}
