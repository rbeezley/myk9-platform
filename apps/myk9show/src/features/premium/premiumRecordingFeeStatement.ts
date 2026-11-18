import { buildPremiumRecordingFee, premiumRecordingFeeDates } from '@myk9/core';
import type { GeneratedPremium } from '@/types/premium-types';

/** The parts of a premium document the recording fee statement is derived from. */
export interface PremiumRecordingFeeDocument {
  org: GeneratedPremium['org'];
  show: Pick<GeneratedPremium['show'], 'startDate'>;
  trials: ReadonlyArray<Pick<GeneratedPremium['trials'][number], 'date'>>;
}

/**
 * MYK9-2044: "AKC recording fee: $5.50 per entry" for this premium document, or null. Derived,
 * never stored: from the document's organization and the trial dates its schedule prints (else its
 * start date), through the @myk9/core table. The PDF facts and the published snapshot both call
 * this on the premium they render or freeze, so they agree with each other and with the schedule,
 * however the premium was produced (Regenerate, or an edit republished without one).
 */
export function premiumRecordingFeeText(premium: PremiumRecordingFeeDocument): string | null {
  const dates = premiumRecordingFeeDates(
    premium.trials.map(trial => ({ date: trial.date })),
    premium.show.startDate
  );
  return buildPremiumRecordingFee(premium.org, dates)?.text ?? null;
}
