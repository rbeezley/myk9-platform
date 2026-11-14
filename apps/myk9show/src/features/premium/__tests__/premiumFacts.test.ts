import { describe, it, expect } from 'vitest';
import { generatedPremium } from './fixtures/generatedPremium';
import {
  PREMIUM_FACT_CATALOG,
  buildPremiumFacts,
  pickSupplementalFacts,
  formatPhone,
} from '../premiumFacts';

describe('premiumFacts', () => {
  it('lists each fact once', () => {
    const ids = PREMIUM_FACT_CATALOG.map(f => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('formats a date range, payment methods and phones once for every style', () => {
    const premium = generatedPremium();
    premium.show.acceptChecks = true;
    premium.show.acceptCash = true;
    premium.secretary.phone = '9185550000';
    const facts = buildPremiumFacts(premium);
    expect(facts.fees.paymentMethods).toEqual(['Checks', 'Cash']);
    expect(facts.secretary.phone).toBe(formatPhone('9185550000'));
    expect(facts.dateRange).toContain('–');
    expect(facts.club).toBe('Bluegrass KC');
  });

  it('falls back to Host Club and an empty venue when the show has neither', () => {
    const premium = generatedPremium();
    premium.club.name = null;
    premium.show.venue = null;
    const facts = buildPremiumFacts(premium);
    expect(facts.club).toBe('Host Club');
    expect(facts.venue).toBe('');
  });

  it('normalises a missing supplemental slice to empty facts', () => {
    expect(pickSupplementalFacts(undefined)).toEqual({
      vetClinic: null,
      accommodations: [],
      coverImageUrl: null,
      hospitalityNotes: null,
      awardsDescription: null,
      additionalNotes: null,
    });
  });
});
