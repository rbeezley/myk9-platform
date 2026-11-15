import { describe, it, expect } from 'vitest';
import { generatedPremium } from './fixtures/generatedPremium';
import {
  PREMIUM_FACT_CATALOG,
  AKC_EVENT_COMMITTEE_MINIMUM,
  buildCommitteeFacts,
  buildOfficerFacts,
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

describe('buildOfficerFacts (MYK9-2045)', () => {
  it('lists "Title: Name" in the Officers list position order, Club secretary for secretary', () => {
    expect(
      buildOfficerFacts([
        { position: 'board_member', name: 'Zed Board' },
        { position: 'secretary', name: 'Sam Typed' },
        { position: 'board_member', name: 'Abe Board' },
        { position: 'president', name: 'Pat President' },
      ])
    ).toEqual([
      { title: 'President', name: 'Pat President' },
      { title: 'Club secretary', name: 'Sam Typed' },
      { title: 'Board Member', name: 'Abe Board' },
      { title: 'Board Member', name: 'Zed Board' },
    ]);
  });

  it('prints nothing for no officers, blank names or an unknown position', () => {
    expect(buildOfficerFacts(undefined)).toEqual([]);
    expect(buildOfficerFacts([])).toEqual([]);
    expect(
      buildOfficerFacts([
        { position: 'president', name: '  ' },
        { position: 'janitor', name: 'Nobody' },
      ])
    ).toEqual([]);
  });

  it('puts the club officers on the facts every style prints from', () => {
    const premium = generatedPremium();
    premium.officers = [{ position: 'treasurer', name: 'Tia Treasurer' }];
    expect(buildPremiumFacts(premium).officers).toEqual([
      { title: 'Treasurer', name: 'Tia Treasurer' },
    ]);
    expect(buildPremiumFacts(generatedPremium()).officers).toEqual([]);
  });
});

describe('Event Committee facts (MYK9-2064)', () => {
  it('trims names, keeps the list order and drops blanks', () => {
    expect(buildCommitteeFacts(['  Pat Chair ', '', '   ', 'Sam Typed'])).toEqual([
      'Pat Chair',
      'Sam Typed',
    ]);
    expect(buildCommitteeFacts(undefined)).toEqual([]);
    expect(buildCommitteeFacts([])).toEqual([]);
  });

  it('puts the committee on the facts every style prints from, [] when none', () => {
    const premium = generatedPremium();
    premium.committee = ['Pat Chair', 'Sam Typed'];
    expect(buildPremiumFacts(premium).committee).toEqual(['Pat Chair', 'Sam Typed']);
    expect(buildPremiumFacts(generatedPremium()).committee).toEqual([]);
  });

  it('marks the committee required for AKC with a minimum of five, for the checklist to read', () => {
    const entry = PREMIUM_FACT_CATALOG.find(f => f.id === 'committee');
    expect(entry?.requiredBy).toEqual(['AKC']);
    expect(entry?.minimumBy).toEqual({ AKC: 5 });
    expect(AKC_EVENT_COMMITTEE_MINIMUM).toBe(5);
  });
});
