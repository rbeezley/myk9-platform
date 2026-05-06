import type { GeneratedPremium } from '../../../../types/premium-types';

/**
 * Returns true when the show has enough data for the Poster's compressed
 * single-page hero to look credible — i.e., judges AND fees AND trials are
 * all present. If any one is missing, render the standard body instead so
 * the Poster never ships as a half-empty sheet.
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
