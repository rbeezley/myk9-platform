import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AKCPremiumTemplate } from '../AKCPremiumTemplate';
import { UKCPremiumTemplate } from '../UKCPremiumTemplate';
import { buildStyles, INK_SAVER_PALETTE, resolveTokens, STYLE_TOKENS } from '../pdfStyles';
import type { GeneratedPremium, PremiumStyle } from '../../../../types/premium-types';

type Org = 'AKC' | 'UKC';

function makePremium(org: Org, style: PremiumStyle): GeneratedPremium {
  return {
    org,
    style,
    templateId: null,
    show: {
      name: 'Spring Scent Trial',
      startDate: '2026-06-01',
      endDate: '2026-06-02',
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
        date: '2026-06-01',
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
      coverImageUrl: null,
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

const STYLES: PremiumStyle[] = ['magazine', 'heritage'];
const ORGS: Org[] = ['AKC', 'UKC'];
const matrix = STYLES.flatMap(s => ORGS.map(o => [s, o] as const));

function renderTemplate(org: Org, premium: GeneratedPremium) {
  return org === 'AKC'
    ? render(<AKCPremiumTemplate premium={premium} />)
    : render(<UKCPremiumTemplate premium={premium} />);
}

describe('Magazine + Heritage style matrix', () => {
  it.each(matrix)('renders fully populated %s premium for %s without throwing', (style, org) => {
    const premium = makePremium(org, style);
    expect(() => renderTemplate(org, premium)).not.toThrow();
    // Spot-check core content survived render.
    expect(screen.getAllByText('Spring Scent Trial').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Building opens at 8:00 AM/).length).toBeGreaterThan(0);
  });

  it.each(matrix)(
    'renders %s premium with all narrative fields cleared (org=%s) and hides their headers',
    (style, org) => {
      const premium: GeneratedPremium = {
        ...makePremium(org, style),
        officials: { chairman: null, steward: null },
        supplemental: {
          vetClinic: null,
          accommodations: [],
          hospitalityNotes: null,
          awardsDescription: null,
          additionalNotes: null,
        },
      };
      expect(() => renderTemplate(org, premium)).not.toThrow();

      // Section headers gated by their narrative bodies must be absent when
      // empty — no orphaned headers above blank sections.
      expect(screen.queryByText('Hospitality')).toBeNull();
      expect(screen.queryByText('Awards')).toBeNull();
      expect(screen.queryByText('Additional Information')).toBeNull();
      expect(screen.queryByText('Accommodations')).toBeNull();
      expect(screen.queryByText('Officials')).toBeNull();
    }
  );
});

describe('Magazine sparse-show (no trials)', () => {
  it.each(['AKC', 'UKC'] as Org[])(
    'renders magazine cover without crashing when trials is empty (org=%s) — italic placeholder path',
    org => {
      const premium: GeneratedPremium = {
        ...makePremium(org, 'magazine'),
        trials: [],
      };
      // This exercises the !hasSubstantiveContent branch in AtAGlancePanel,
      // which renders "Details coming soon" with fontStyle:'italic' on
      // Cormorant Garamond — the family must have an italic variant registered.
      expect(() => renderTemplate(org, premium)).not.toThrow();
      expect(screen.getAllByText('Details coming soon').length).toBeGreaterThan(0);
    }
  );
});

describe('Magazine + Heritage ink-saver palette', () => {
  it.each(STYLES)('buildStyles(%s, { inkSaver: true }) collapses palette to B&W', style => {
    const sheet = buildStyles(style, { inkSaver: true });
    // The accentColor lands on the section title color; secondary on
    // pull-quote labels; surface on the cover page background.
    expect(sheet.sectionTitle.color).toBe(INK_SAVER_PALETTE.accentColor);
    expect(sheet.pullQuoteLabel.color).toBe(INK_SAVER_PALETTE.secondaryColor);
    expect(sheet.coverPage.backgroundColor).toBe(INK_SAVER_PALETTE.surfaceColor);
  });

  it.each(STYLES)('resolveTokens(%s) without inkSaver keeps the designed palette', style => {
    const tokens = resolveTokens(style);
    expect(tokens.accentColor).toBe(STYLE_TOKENS[style].accentColor);
    expect(tokens.secondaryColor).toBe(STYLE_TOKENS[style].secondaryColor);
    expect(tokens.surfaceColor).toBe(STYLE_TOKENS[style].surfaceColor);
  });
});

describe('Magazine cover image', () => {
  it('renders uploaded cover art instead of the At a Glance fallback', () => {
    const base = makePremium('AKC', 'magazine');
    const premium: GeneratedPremium = {
      ...base,
      supplemental: { ...base.supplemental, coverImageUrl: 'data:image/png;base64,abc123' },
    };

    renderTemplate('AKC', premium);

    expect(screen.queryByText('Details coming soon')).toBeNull();
    expect(screen.queryByText(/Elements/)).toBeNull();
  });
});
