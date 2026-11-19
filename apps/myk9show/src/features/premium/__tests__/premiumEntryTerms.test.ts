import { describe, expect, it } from 'vitest';
import {
  premiumClassFeeLines,
  premiumEntryRuleLines,
  premiumTrialEntryLimitText,
  premiumVenueText,
} from '../premiumEntryTerms';

describe('premiumVenueText (MYK9-2227)', () => {
  it('composes the venue name, street and city line', () => {
    expect(
      premiumVenueText({
        venue: '100 Main St',
        venueName: 'Expo Hall',
        venueCity: 'Louisville',
        venueState: 'KY',
        venueZip: '40202',
      })
    ).toBe('Expo Hall, 100 Main St, Louisville, KY 40202');
  });

  it('keeps an older premium (street only) as it was', () => {
    expect(premiumVenueText({ venue: 'Louisville' })).toBe('Louisville');
    expect(premiumVenueText({ venue: null })).toBe('');
  });

  it('does not repeat a part the street already says', () => {
    expect(
      premiumVenueText({
        venue: '100 Main St, Louisville, KY 40202',
        venueName: '100 Main St',
        venueCity: 'Louisville',
        venueState: 'KY',
        venueZip: '40202',
      })
    ).toBe('100 Main St, Louisville, KY 40202');
  });
});

describe('premiumEntryRuleLines (MYK9-2227)', () => {
  it('prints nothing for a premium that carries neither setting', () => {
    expect(premiumEntryRuleLines({})).toEqual([]);
    expect(
      premiumEntryRuleLines({ allowWaitlist: null, allowClassChangesAfterClose: null })
    ).toEqual([]);
  });

  it('says the waitlist is free and the secretary offers spots when auto-offer is off', () => {
    const [line] = premiumEntryRuleLines({ allowWaitlist: true, waitlistAutoOffer: false });
    expect(line).toContain('Joining is free and you pay only if you claim a spot');
    expect(line).toContain('the trial secretary offers it');
  });

  it('says spots are offered automatically otherwise', () => {
    const [line] = premiumEntryRuleLines({ allowWaitlist: true, waitlistAutoOffer: true });
    expect(line).toContain('offered to the next entry on the waitlist automatically');
  });

  it('says full classes turn entries away when there is no waitlist', () => {
    expect(premiumEntryRuleLines({ allowWaitlist: false })).toEqual([
      'Waitlist: none. When a class is full, new entries are turned away.',
    ]);
  });

  it('states move-ups either way and never mentions a refund', () => {
    const on = premiumEntryRuleLines({ allowClassChangesAfterClose: true }).join(' ');
    const off = premiumEntryRuleLines({ allowClassChangesAfterClose: false }).join(' ');
    expect(on).toContain('may be requested after entries close');
    expect(off).toContain('cannot be requested after entries close');
    expect(
      premiumEntryRuleLines({
        allowWaitlist: true,
        allowClassChangesAfterClose: true,
      })
        .join(' ')
        .toLowerCase()
    ).not.toContain('refund');
  });
});

describe('trial limit and class fees (MYK9-2227)', () => {
  it('states a trial limit and nothing for none', () => {
    expect(premiumTrialEntryLimitText({ maxTotalEntries: 37 })).toBe(
      'Trial entry limit: 37 entries.'
    );
    expect(premiumTrialEntryLimitText({ maxTotalEntries: 1 })).toBe('Trial entry limit: 1 entry.');
    expect(premiumTrialEntryLimitText({ maxTotalEntries: null })).toBeNull();
    expect(premiumTrialEntryLimitText({})).toBeNull();
  });

  it('groups classes by fee, in order, and skips classes without one', () => {
    expect(
      premiumClassFeeLines([
        { element: 'Containers', level: 'Novice', section: null, entryFee: 17.5 },
        { element: 'Interior', level: 'Novice', section: null, entryFee: 20 },
        { element: 'Exterior', level: 'Novice', section: null, entryFee: 17.5 },
        { element: 'Buried', level: 'Novice', section: null, entryFee: null },
        { element: 'Handler Discrimination', level: 'Novice', section: null },
      ])
    ).toEqual([
      'Class fee $17.50: Containers Novice · Exterior Novice',
      'Class fee $20: Interior Novice',
    ]);
  });
});
