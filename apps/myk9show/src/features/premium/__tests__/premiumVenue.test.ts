import { describe, expect, it } from 'vitest';
import { composePremiumVenue } from '../premiumVenue';
import { buildPremiumFacts } from '../premiumFacts';
import { generatedPremium } from './fixtures/generatedPremium';

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
