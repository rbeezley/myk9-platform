import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AKCPremiumTemplate } from '../AKCPremiumTemplate';
import { UKCPremiumTemplate } from '../UKCPremiumTemplate';
import { buildStyles, INK_SAVER_PALETTE } from '../pdfStyles';
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

const STYLES: PremiumStyle[] = ['gazette', 'fieldGuide'];
const ORGS: Org[] = ['AKC', 'UKC'];
const matrix = STYLES.flatMap(s => ORGS.map(o => [s, o] as const));

function renderTemplate(org: Org, premium: GeneratedPremium) {
  return org === 'AKC'
    ? render(<AKCPremiumTemplate premium={premium} />)
    : render(<UKCPremiumTemplate premium={premium} />);
}

describe('Gazette + Field Guide style matrix', () => {
  it.each(matrix)('renders fully populated %s premium for %s without throwing', (style, org) => {
    const premium = makePremium(org, style);
    expect(() => renderTemplate(org, premium)).not.toThrow();
    // Spot-check core content survived render.
    expect(screen.getAllByText(/Spring Scent Trial/).length).toBeGreaterThan(0);
  });

  it.each(matrix)(
    'renders %s premium with all narrative fields cleared (org=%s) and hides their headers',
    (style, org) => {
      const base = makePremium(org, style);
      const premium: GeneratedPremium = {
        ...base,
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

      // Section headers gated by their bodies must be absent when empty —
      // no orphan headers above blank sections.
      expect(screen.queryByText('Lodging')).toBeNull();
      expect(screen.queryByText('Awards')).toBeNull();
      expect(screen.queryByText('Notices')).toBeNull();
    }
  );
});

describe('Gazette + Field Guide ink-saver palette', () => {
  it.each(STYLES)('buildStyles(%s, { inkSaver: true }) collapses palette to B&W', style => {
    const sheet = buildStyles(style, { inkSaver: true });
    expect(sheet.coverPage.backgroundColor).toBe(INK_SAVER_PALETTE.surfaceColor);
    expect(sheet.sectionTitle.color).toBe(INK_SAVER_PALETTE.accentColor);
  });
});

describe('Gazette masthead — org-conditional license line', () => {
  it('shows "LICENSE NO." for AKC', () => {
    const premium = makePremium('AKC', 'gazette');
    renderTemplate('AKC', premium);
    expect(screen.queryByText(/LICENSE NO\./)).not.toBeNull();
  });

  it('hides "LICENSE NO." for UKC', () => {
    const premium = makePremium('UKC', 'gazette');
    renderTemplate('UKC', premium);
    expect(screen.queryByText(/LICENSE NO\./)).toBeNull();
  });
});
