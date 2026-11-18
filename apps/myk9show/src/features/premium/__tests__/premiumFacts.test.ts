import { describe, it, expect } from 'vitest';
import { generatedPremium } from './fixtures/generatedPremium';
import type { GeneratedPremium } from '@/types/premium-types';
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
    expect(facts.fees.paymentMethods).toEqual(['Credit/Debit Card', 'Checks', 'Cash']);
    expect(facts.secretary.phone).toBe(formatPhone('9185550000'));
    expect(facts.dateRange).toContain('–');
    expect(facts.club).toBe('Bluegrass KC');
  });

  describe('accepted payment methods', () => {
    const methods = (checks: boolean, cash: boolean) => {
      const premium = generatedPremium();
      premium.show.acceptChecks = checks;
      premium.show.acceptCash = cash;
      return buildPremiumFacts(premium).fees.paymentMethods;
    };

    it('lists card alone for a card-only show', () => {
      expect(methods(false, false)).toEqual(['Credit/Debit Card']);
    });

    it('lists card with check', () => {
      expect(methods(true, false)).toEqual(['Credit/Debit Card', 'Checks']);
    });

    it('lists card with cash', () => {
      expect(methods(false, true)).toEqual(['Credit/Debit Card', 'Cash']);
    });

    it('lists card with check and cash', () => {
      expect(methods(true, true)).toEqual(['Credit/Debit Card', 'Checks', 'Cash']);
    });
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

describe('judge facts (MYK9-2067)', () => {
  function premiumWithJudges(judges: NonNullable<GeneratedPremium['trials'][number]['judges']>) {
    const premium = generatedPremium();
    premium.trials = [
      {
        name: 'Saturday',
        date: '2026-05-01',
        startTime: null,
        eventNumber: null,
        type: 'Scent Work',
        judges,
        classes: [
          { element: 'Interior', level: 'Advanced', section: null },
          { element: 'Container', level: 'Novice', section: 'A' },
        ],
      },
    ];
    return premium;
  }

  it('carries the residence and only the classes this trial runs, in its progression order', () => {
    const facts = buildPremiumFacts(
      premiumWithJudges([
        {
          name: 'Jane Smith',
          residence: ' Springfield, IL ',
          classes: ['Interior Advanced', 'Container Novice A', 'Vehicle Master'],
        },
      ])
    );
    expect(facts.trials[0]?.judges).toEqual([
      {
        name: 'Jane Smith',
        residence: 'Springfield, IL',
        classes: ['Container Novice A', 'Interior Advanced'],
      },
    ]);
  });

  it('gives a judge with no city a null residence and a judge with no assignment no classes', () => {
    const facts = buildPremiumFacts(
      premiumWithJudges([
        { name: 'No City', residence: null, classes: ['Container Novice A'] },
        { name: 'Blank City', residence: '  ', classes: [] },
        { name: 'Old Row' },
      ])
    );
    expect(facts.trials[0]?.judges).toEqual([
      { name: 'No City', residence: null, classes: ['Container Novice A'] },
      { name: 'Blank City', residence: null, classes: [] },
      { name: 'Old Row', residence: null, classes: [] },
    ]);
  });

  it('keeps no class line for a show-level judge, who is published with an empty class list', () => {
    const facts = buildPremiumFacts(
      premiumWithJudges([{ name: 'Every Class', residence: 'Austin, TX', classes: [] }])
    );
    expect(facts.trials[0]?.judges[0]?.classes).toEqual([]);
  });
});
