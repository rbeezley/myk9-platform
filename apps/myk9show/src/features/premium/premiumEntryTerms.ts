import type { GeneratedPremium } from '@/types/premium-types';
import { classAllowsWaitlist } from '@/utils/classAllowsWaitlist';
import { formatPremiumClassLabel } from './premiumClassLabel';

/**
 * MYK9-2231 (owner decision, 2026-11-19): the waitlist, class-fee and move-up lines a premium
 * prints. Each returns null (nothing prints in any style) when it has nothing to say.
 */
type PremiumTrial = GeneratedPremium['trials'][number];
type PremiumClass = PremiumTrial['classes'][number];
type PremiumShow = GeneratedPremium['show'];
type ClassComparator = (a: PremiumClass, b: PremiumClass) => number;

/**
 * The classes of one trial that take a waitlist, by trial. A class's own setting wins over the
 * show's (MYK9-1019, the one live rule). No promise about how a spot is offered.
 */
export function premiumTrialWaitlistText(
  trial: Pick<PremiumTrial, 'classes'>,
  show: Pick<PremiumShow, 'allowWaitlist'>,
  comparator: ClassComparator
): string | null {
  const labels = [
    ...new Set(
      (trial.classes ?? [])
        .filter(c => classAllowsWaitlist(c.allowWaitlist, show.allowWaitlist))
        .sort(comparator)
        .map(formatPremiumClassLabel)
    ),
  ];
  return labels.length > 0 ? `Classes taking a waitlist: ${labels.join(', ')}.` : null;
}

const formatFee = (n: number): string => `$${Number.isInteger(n) ? n : n.toFixed(2)}`;

/**
 * The pre-entry fee of each class with its own fee (classes.entry_fee above 0, MYK9-1931). A
 * class fee equal to the show's pre-entry fee prints nothing. Day-of pricing stays with the
 * show's fee table (owner decision on MYK9-2231). Each class and fee prints once.
 */
export function premiumTrialClassFeeText(
  trial: Pick<PremiumTrial, 'classes'>,
  show: Pick<PremiumShow, 'preEntryFee'>,
  comparator: ClassComparator
): string | null {
  const parts = [
    ...new Set(
      (trial.classes ?? [])
        .filter(
          c => typeof c.entryFee === 'number' && c.entryFee > 0 && c.entryFee !== show.preEntryFee
        )
        .sort(comparator)
        .map(c => `${formatPremiumClassLabel(c)} ${formatFee(c.entryFee as number)}`)
    ),
  ];
  return parts.length > 0 ? `Class fees (pre-entry): ${parts.join('; ')}.` : null;
}

/** The owner's exact wording; null (no line) on a premium generated before the column. */
export function premiumClassChangeText(
  show: Pick<PremiumShow, 'allowClassChangesAfterClose'>
): string | null {
  if (typeof show.allowClassChangesAfterClose !== 'boolean') return null;
  return show.allowClassChangesAfterClose
    ? "Class changes, including move-ups, may be requested after entries close. Each request needs the trial secretary's approval."
    : 'Class changes cannot be requested after entries close.';
}
