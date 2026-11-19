import { describe, it, expect } from 'vitest';
import {
  premiumClassChangeText,
  premiumTrialClassFeeText,
  premiumTrialWaitlistText,
} from '../premiumEntryTerms';
import { makeClassComparator } from '../pdf/bodies/classOrder';

const comparator = makeClassComparator('AKC');
const cls = (element: string, extra: Record<string, unknown> = {}) => ({
  element,
  level: 'Novice',
  section: null,
  ...extra,
});

describe('premiumTrialWaitlistText (MYK9-2231)', () => {
  it('a class setting of its own wins over the show, trial by trial', () => {
    const saturday = { classes: [cls('Containers', { allowWaitlist: true }), cls('Buried')] };
    const sunday = { classes: [cls('Containers'), cls('Buried', { allowWaitlist: false })] };
    // Show waitlist off: only the class that opted in.
    expect(premiumTrialWaitlistText(saturday, { allowWaitlist: false }, comparator)).toBe(
      'Classes taking a waitlist: Containers Novice.'
    );
    expect(premiumTrialWaitlistText(sunday, { allowWaitlist: false }, comparator)).toBeNull();
    // Show waitlist on: every class but the one that opted out.
    expect(premiumTrialWaitlistText(saturday, { allowWaitlist: true }, comparator)).toBe(
      'Classes taking a waitlist: Buried Novice, Containers Novice.'
    );
    expect(premiumTrialWaitlistText(sunday, { allowWaitlist: true }, comparator)).toBe(
      'Classes taking a waitlist: Containers Novice.'
    );
  });

  it('prints nothing when nothing says waitlist (an older premium)', () => {
    expect(premiumTrialWaitlistText({ classes: [cls('Buried')] }, {}, comparator)).toBeNull();
  });

  it('makes no promise about how a spot is offered', () => {
    const text = premiumTrialWaitlistText(
      { classes: [cls('Buried')] },
      { allowWaitlist: true },
      comparator
    );
    expect(text).not.toMatch(/offer|automatic|refund/i);
  });
});

describe('premiumTrialClassFeeText (MYK9-2231)', () => {
  it('prints the pre-entry fee of a class unlike the show fee', () => {
    const trial = { classes: [cls('Containers', { entryFee: 17.5 }), cls('Buried')] };
    expect(premiumTrialClassFeeText(trial, { preEntryFee: 25 }, comparator)).toBe(
      'Class fees (pre-entry): Containers Novice $17.50.'
    );
  });

  it('prints nothing for a class fee equal to the show pre-entry fee, zero or null', () => {
    const trial = {
      classes: [
        cls('Containers', { entryFee: 25 }),
        cls('Buried', { entryFee: 0 }),
        cls('Interior', { entryFee: null }),
      ],
    };
    expect(premiumTrialClassFeeText(trial, { preEntryFee: 25 }, comparator)).toBeNull();
  });

  it('prints a repeated class and fee once', () => {
    const trial = {
      classes: [cls('Containers', { entryFee: 20 }), cls('Containers', { entryFee: 20 })],
    };
    expect(premiumTrialClassFeeText(trial, { preEntryFee: 25 }, comparator)).toBe(
      'Class fees (pre-entry): Containers Novice $20.'
    );
  });

  it('labels a name-only class by its name', () => {
    const trial = {
      classes: [{ element: '', level: '', section: null, name: 'Detective', entryFee: 30 }],
    };
    expect(premiumTrialClassFeeText(trial, { preEntryFee: 25 }, comparator)).toBe(
      'Class fees (pre-entry): Detective $30.'
    );
  });

  // Owner decision on MYK9-2231: day-of pricing stays with the show's fee table.
  it('never prints a day-of price, even when the show has a day-of fee', () => {
    const trial = { classes: [cls('Containers', { entryFee: 20 })] };
    const show = { preEntryFee: 25, dayOfFee: 30 };
    expect(premiumTrialClassFeeText(trial, show, comparator)).not.toMatch(/day|surcharge|\$5/i);
  });
});

describe('premiumClassChangeText (MYK9-2231)', () => {
  it('uses the owner wording for both states', () => {
    expect(premiumClassChangeText({ allowClassChangesAfterClose: true })).toBe(
      "Class changes, including move-ups, may be requested after entries close. Each request needs the trial secretary's approval."
    );
    expect(premiumClassChangeText({ allowClassChangesAfterClose: false })).toBe(
      'Class changes cannot be requested after entries close.'
    );
  });

  it('prints nothing on a premium generated before the column', () => {
    expect(premiumClassChangeText({})).toBeNull();
    expect(premiumClassChangeText({ allowClassChangesAfterClose: null })).toBeNull();
  });
});
