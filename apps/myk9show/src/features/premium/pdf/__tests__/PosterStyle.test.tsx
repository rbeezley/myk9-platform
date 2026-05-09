import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AKCPremiumTemplate } from '../AKCPremiumTemplate';
import { UKCPremiumTemplate } from '../UKCPremiumTemplate';
import { buildStyles, INK_SAVER_PALETTE, STYLE_TOKENS } from '../pdfStyles';
import { isPosterMinimumDataMet } from '../bodies/posterPredicates';
import type { GeneratedPremium } from '../../../../types/premium-types';

type Org = 'AKC' | 'UKC';

function makePremium(org: Org): GeneratedPremium {
  return {
    org,
    style: 'poster',
    templateId: null,
    show: {
      name: 'Spring Scent Work',
      startDate: '2026-06-12',
      endDate: '2026-06-14',
      venue: '123 Main St, Tulsa, OK 74101',
      entryOpenDate: '2026-04-01',
      entryCloseDate: '2026-05-15',
      preEntryFee: 20,
      dayOfFee: 25,
      acceptChecks: true,
      acceptCash: false,
    },
    club: { name: 'Test Club', logoUrl: null },
    secretary: {
      name: 'Jane Smith',
      email: 'jane@test.com',
      phone: '918-555-0000',
      mailingAddress: '456 Oak Ave',
    },
    officials: { chairman: 'Bob Jones', steward: 'Sue Hart' },
    trials: [
      {
        name: 'Saturday Trial 1',
        date: '2026-06-13',
        startTime: '9:00 AM',
        eventNumber: `${org}-2026-001`,
        type: 'Scent Work',
        judges: [{ name: 'Alice Judge', elements: ['Container'] }],
        classes: [{ element: 'Container', level: 'Novice', section: 'A' }],
      },
    ],
    supplemental: {
      vetClinic: { name: 'Animal ER', address: '789 Vet Blvd', phone: '918-999-0000' },
      accommodations: [{ name: 'La Quinta', address: '100 Hotel Rd', phone: '918-111-2222' }],
      hospitalityNotes: 'Lunch on Saturday.',
      awardsDescription: 'Ribbons 1st through 4th.',
      additionalNotes: 'Parking is free.',
    },
    narratives: {
      showHours: 'Building opens at 8:00 AM.',
      trialInformation: 'Novice title required for Advanced.',
    },
  };
}

const ORGS: Org[] = ['AKC', 'UKC'];

function renderTemplate(org: Org, premium: GeneratedPremium) {
  return org === 'AKC'
    ? render(<AKCPremiumTemplate premium={premium} />)
    : render(<UKCPremiumTemplate premium={premium} />);
}

describe('Poster style — full-data render', () => {
  it.each(ORGS)('renders fully populated poster premium for %s without throwing', org => {
    const premium = makePremium(org);
    expect(() => renderTemplate(org, premium)).not.toThrow();
    // Hero stack splits the show name into per-line words; assert one of them
    // landed in the rendered tree.
    expect(screen.getAllByText('Spring').length).toBeGreaterThan(0);
    // PosterBody body copy uses a sentence form distinct from StandardBody —
    // confirm the typography-shift body actually rendered, not the fallback.
    expect(screen.getAllByText(/About the Trial/).length).toBeGreaterThan(0);
  });
});

describe('Poster style — minimum-data fallback', () => {
  it.each(ORGS)(
    'falls back to StandardBody when judges + fees + trials are all empty (%s)',
    org => {
      const premium: GeneratedPremium = {
        ...makePremium(org),
        trials: [],
        show: {
          ...makePremium(org).show,
          preEntryFee: 0,
          dayOfFee: 0,
        },
      };
      expect(isPosterMinimumDataMet(premium)).toBe(false);

      renderTemplate(org, premium);

      // StandardBody emits "Trials & Judges" as a section title; PosterBody
      // emits the same label but PosterBody also emits "About the Trial",
      // which StandardBody never produces. Assert the fallback path by
      // confirming PosterBody's distinctive label is absent.
      expect(screen.queryByText('About the Trial')).toBeNull();
      // And confirm a label only StandardBody emits IS present.
      expect(screen.getAllByText('Entry Information').length).toBeGreaterThan(0);
    }
  );

  it('isPosterMinimumDataMet returns true when judges + fees + trials all populated', () => {
    expect(isPosterMinimumDataMet(makePremium('AKC'))).toBe(true);
  });

  it('isPosterMinimumDataMet returns false when trials list is empty', () => {
    const premium: GeneratedPremium = { ...makePremium('AKC'), trials: [] };
    expect(isPosterMinimumDataMet(premium)).toBe(false);
  });

  it('isPosterMinimumDataMet returns false when judges are missing on every trial', () => {
    const base = makePremium('AKC');
    const premium: GeneratedPremium = {
      ...base,
      trials: base.trials.map(t => ({ ...t, judges: [] })),
    };
    expect(isPosterMinimumDataMet(premium)).toBe(false);
  });
});

describe('Poster style — ink-saver palette', () => {
  it('buildStyles(poster, { inkSaver: true }) collapses palette to B&W', () => {
    const sheet = buildStyles('poster', { inkSaver: true });
    expect(sheet.sectionTitle.color).toBe(INK_SAVER_PALETTE.accentColor);
    expect(sheet.pullQuoteLabel.color).toBe(INK_SAVER_PALETTE.secondaryColor);
    expect(sheet.coverPage.backgroundColor).toBe(INK_SAVER_PALETTE.surfaceColor);
  });

  it('STYLE_TOKENS.poster keeps the designed palette without ink-saver', () => {
    expect(STYLE_TOKENS.poster.accentColor).toBe('#c83b1a');
    expect(STYLE_TOKENS.poster.secondaryColor).toBe('#1f1d18');
    expect(STYLE_TOKENS.poster.surfaceColor).toBe('#f3ede0');
    expect(STYLE_TOKENS.poster.bodyLayout).toBe('poster');
    expect(STYLE_TOKENS.poster.coverStyle).toBe('poster');
  });
});
