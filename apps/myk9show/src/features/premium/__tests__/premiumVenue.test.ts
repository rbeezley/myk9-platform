import { describe, expect, it } from 'vitest';
import { composePremiumVenue } from '../premiumVenue';
import { buildPremiumFacts } from '../premiumFacts';
import { generatedPremium } from './fixtures/generatedPremium';
import { parseGeneratedPremium } from '../premiumPublishSchema';

describe('composePremiumVenue (MYK9-2230)', () => {
  it('prints the location exactly as before when the show has no address', () => {
    expect(composePremiumVenue({ venue: 'Louisville', city: 'Elsewhere', state: 'KY' })).toBe(
      'Louisville'
    );
  });

  it('composes label, street and locality from separate columns', () => {
    expect(
      composePremiumVenue({
        venue: 'County Fairgrounds',
        venueName: 'Expo Hall',
        address: '100 Austin Avenue',
        city: 'Austin',
        state: 'TX',
        zipCode: '78701',
      })
    ).toBe('Expo Hall, 100 Austin Avenue, Austin, TX 78701');
  });

  it('falls back to the location label and skips missing locality parts', () => {
    expect(
      composePremiumVenue({ venue: 'County Fairgrounds', address: '12 Fair Road', state: 'KY' })
    ).toBe('County Fairgrounds, 12 Fair Road, KY');
  });

  it('feeds the facts venue every style reads', () => {
    const premium = generatedPremium('County Fairgrounds');
    premium.show = {
      ...premium.show,
      address: '12 Fair Road',
      city: 'Lexington',
      state: 'KY',
      zipCode: '40502',
    };
    expect(buildPremiumFacts(premium).venue).toBe(
      'County Fairgrounds, 12 Fair Road, Lexington, KY 40502'
    );
    expect(buildPremiumFacts(generatedPremium('Louisville')).venue).toBe('Louisville');
  });
});

describe('premium venue: review fixes (MYK9-2230)', () => {
  it('keeps the address parts through the publish schema', () => {
    const premium = generatedPremium('County Fairgrounds');
    Object.assign(premium.show, {
      venueName: null,
      address: '12 Fair Road',
      city: 'Lexington',
      state: 'KY',
      zipCode: '40502',
    });
    const parsed = parseGeneratedPremium(JSON.parse(JSON.stringify(premium)));
    expect(parsed.show).toMatchObject({
      address: '12 Fair Road',
      city: 'Lexington',
      state: 'KY',
      zipCode: '40502',
    });
    expect(buildPremiumFacts(parsed).venue).toBe(
      'County Fairgrounds, 12 Fair Road, Lexington, KY 40502'
    );
  });

  it('prints a part only once when the location repeats it', () => {
    expect(
      composePremiumVenue({ venue: '12 Fair Road', address: '12 fair road', city: 'Lexington' })
    ).toBe('12 Fair Road, Lexington');
    expect(
      composePremiumVenue({
        venue: '12 Fair Road, Lexington, KY 40502',
        address: '12 Fair Road',
        city: 'Lexington',
        state: 'KY',
        zipCode: '40502',
      })
    ).toBe('12 Fair Road, Lexington, KY 40502');
  });
});
