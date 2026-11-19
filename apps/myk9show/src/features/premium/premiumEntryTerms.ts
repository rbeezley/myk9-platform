/**
 * MYK9-2227: the premium's street address, per-trial entry limit, per-class fees, and the
 * waitlist and move-up rules, each formatted once for every style (they read these through
 * {@link buildPremiumFacts}). Every function returns null / [] when the fact is not set, so a
 * style prints nothing for it, never a placeholder.
 *
 * The wording follows the app's own copy for the same settings (the Waitlist settings card and
 * the exhibitor class-availability note): joining a waitlist is free, a spot is offered, and
 * nothing here promises a refund.
 */
import type { GeneratedPremium } from '@/types/premium-types';
import { formatPremiumClassLabel } from './premiumClassLabel';
import { normalizeEntryLimit } from './premiumEntryLimit';

type PremiumShow = GeneratedPremium['show'];
type PremiumTrial = GeneratedPremium['trials'][number];
type PremiumClass = PremiumTrial['classes'][number];

const clean = (value: string | null | undefined): string => value?.trim() ?? '';

/**
 * The venue as one address: the venue's name, the street (`shows.location`), then
 * "City, ST 12345". A part the street already says (a location typed as a full address) is
 * not repeated. '' when the show has none of it.
 */
export function premiumVenueText(
  show: Pick<PremiumShow, 'venue' | 'venueName' | 'venueCity' | 'venueState' | 'venueZip'>
): string {
  const street = clean(show.venue);
  const name = clean(show.venueName);
  const city = clean(show.venueCity);
  const state = clean(show.venueState);
  const zip = clean(show.venueZip);
  const streetLower = street.toLowerCase();
  const said = (part: string) => part !== '' && streetLower.includes(part.toLowerCase());

  const stateZip = [said(state) ? '' : state, said(zip) ? '' : zip].filter(Boolean).join(' ');
  const cityLine = [said(city) ? '' : city, stateZip].filter(Boolean).join(', ');
  const nameLine = name && name.toLowerCase() !== streetLower && !said(name) ? name : '';
  return [nameLine, street, cityLine].filter(Boolean).join(', ');
}

/** "Waitlist: ..." and "Move-ups: ..." lines for the show's rules, [] for a premium that has neither. */
export function premiumEntryRuleLines(
  show: Pick<PremiumShow, 'allowWaitlist' | 'waitlistAutoOffer' | 'allowClassChangesAfterClose'>
): string[] {
  const lines: string[] = [];
  if (show.allowWaitlist === true) {
    const offer =
      show.waitlistAutoOffer === false
        ? 'the trial secretary offers it to the next entry on the waitlist'
        : 'it is offered to the next entry on the waitlist automatically';
    lines.push(
      `Waitlist: when a class is full, new entries join the waitlist. Joining is free and you pay only if you claim a spot. When a spot opens, ${offer}.`
    );
  } else if (show.allowWaitlist === false) {
    lines.push('Waitlist: none. When a class is full, new entries are turned away.');
  }
  if (show.allowClassChangesAfterClose === true) {
    lines.push(
      'Move-ups: a class change (including a move-up) may be requested after entries close. The trial secretary approves each request.'
    );
  } else if (show.allowClassChangesAfterClose === false) {
    lines.push('Move-ups: class changes cannot be requested after entries close.');
  }
  return lines;
}

/** "$20" or "$20.50", the way the premium's other fees read. */
function money(amount: number): string {
  return Number.isInteger(amount) ? `$${amount}` : `$${amount.toFixed(2)}`;
}

/** "Trial entry limit: 40 entries." for a trial with its own limit, else null. */
export function premiumTrialEntryLimitText(
  trial: Pick<PremiumTrial, 'maxTotalEntries'>
): string | null {
  const limit = normalizeEntryLimit(trial.maxTotalEntries);
  if (limit === null) return null;
  return `Trial entry limit: ${limit} ${limit === 1 ? 'entry' : 'entries'}.`;
}

/**
 * One line per distinct class fee, in the classes' own order: "Class fee $20: Novice Container
 * · Advanced Container". A class with no fee is left out.
 */
export function premiumClassFeeLines(classes: ReadonlyArray<PremiumClass>): string[] {
  const byFee = new Map<number, string[]>();
  for (const cls of classes) {
    const fee = cls.entryFee;
    if (typeof fee !== 'number' || !Number.isFinite(fee) || fee <= 0) continue;
    const labels = byFee.get(fee) ?? [];
    const label = formatPremiumClassLabel(cls);
    if (!labels.includes(label)) labels.push(label);
    byFee.set(fee, labels);
  }
  return [...byFee].map(([fee, labels]) => `Class fee ${money(fee)}: ${labels.join(' · ')}`);
}
