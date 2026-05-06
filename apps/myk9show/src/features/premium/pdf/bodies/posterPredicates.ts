import type { GeneratedPremium } from '../../../../types/premium-types';

/**
 * Predicate: is there enough data on the show to make the Poster's compressed
 * single-page hero credible? When all of judges, fees, and trials are missing
 * the Poster collapses into a near-empty sheet — fall back to StandardBody so
 * a half-empty hero never ships.
 *
 * Lives in its own module so the PosterBody component file exports only the
 * component (keeps Vite Fast Refresh happy).
 */
export function isPosterMinimumDataMet(data: GeneratedPremium): boolean {
  const hasJudges = data.trials?.some(t => t.judges?.length > 0) ?? false;
  const hasFees = !!data.show?.preEntryFee || !!data.show?.dayOfFee;
  const hasTrials = (data.trials?.length ?? 0) > 0;
  return hasJudges && hasFees && hasTrials;
}
