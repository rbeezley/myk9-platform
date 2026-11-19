import {
  livePremiumClasses,
  livePremiumTrials,
  type PremiumScheduleTrialRow,
} from './liveTrials.ts';

/**
 * MYK9-2186: what Regenerate reads from the show's trials to choose the club template: the live
 * trials only, so a cancelled or soft-deleted trial never steers the template.
 */

/** The trial type of the first live trial, which picks the club's premium template. */
export function premiumTemplateTrialType(trials: unknown): string | null {
  return (
    livePremiumTrials(
      trials as Array<PremiumScheduleTrialRow & { trial_type: string | null }> | null
    )[0]?.trial_type ?? null
  );
}
