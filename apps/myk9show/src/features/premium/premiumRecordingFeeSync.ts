import { buildPremiumRecordingFee, premiumRecordingFeeDates } from '@myk9/core';
import type { GeneratedPremium } from '@/types/premium-types';

/**
 * MYK9-2044: the premium with its recording fee statement resolved again from the trials it
 * prints and the show's start date, through the same @myk9/core builder generate-premium
 * mirrors. A premium edited and republished without Regenerate goes through here, so it states
 * the fee for the trial dates as they are now (a trial moved across a rate change states the new
 * rate) instead of dropping the line or carrying a stale one forward.
 *
 * The trials must already be the live ones (no cancelled or deleted trial): the schedule the
 * premium prints is the list the fee prices.
 */
export function withCurrentRecordingFee(premium: GeneratedPremium): GeneratedPremium {
  const dates = premiumRecordingFeeDates(
    premium.trials.map(trial => ({ date: trial.date })),
    premium.show.startDate
  );
  return { ...premium, recordingFee: buildPremiumRecordingFee(premium.org, dates) };
}
