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

  it('prints no terms for a show that sets none', () => {
    const facts = buildPremiumFacts(generatedPremium());
    expect(facts.terms).toEqual([]);
  });

  it('builds the junior fee and refund wording once', () => {
    const premium = generatedPremium();
    premium.show.juniorHandlerFee = 12.5;
    premium.show.withdrawal = {
      show: {
        withdrawal_cutoff_date: '2026-05-01',
        withdrawal_retention_type: 'flat',
        withdrawal_retention_value: 500,
        withdrawal_policy_notes: null,
      },
      club: null,
    };
    expect(buildPremiumFacts(premium, 'AKC').terms).toEqual([
      { id: 'juniorHandlerFee', label: 'Junior handler fee (handler under 18)', value: '$12.50' },
      {
        id: 'withdrawals',
        label: 'Withdrawals',
        value:
          'Full refund of the entry fee until May 1, 2026; after that, $5.00 is kept. Service fees are non-refundable.',
      },
      {
        id: 'pulls',
        label: 'Pulls',
        value: "Refunds for a pull are at the club's discretion.",
      },
    ]);
  });

  it('falls back to the club default when the show declares no policy', () => {
    const premium = generatedPremium();
    premium.show.withdrawal = {
      show: {},
      club: { default_withdrawal_policy_notes: 'Contact the secretary.' },
    };
    const ids = buildPremiumFacts(premium).terms.map(t => t.id);
    expect(ids).toEqual(['withdrawals', 'pulls']);
  });

  it('treats a zero junior fee as unset', () => {
    const premium = generatedPremium();
    premium.show.juniorHandlerFee = 0;
    premium.show.withdrawal = { show: {}, club: null };
    expect(buildPremiumFacts(premium).terms).toEqual([]);
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
