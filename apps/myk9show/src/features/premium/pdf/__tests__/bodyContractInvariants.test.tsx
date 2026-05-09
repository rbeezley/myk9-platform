// Cross-style invariants every premium body must hold:
//   1. Classes render in progression order (Novice A → B → Advanced →
//      Excellent → Master), regardless of insertion order in the source.
//   2. "Online entries via myK9Show" appears prominently — online is the
//      revenue-generating channel and must be the primary entry method shown.
//
// Mocks @react-pdf primitives down to plain DOM so we can grep the rendered
// tree. Uses a scrambled class list to prove the sort is happening, not just
// that the data was already sorted upstream.

import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { AKCPremiumTemplate } from '../AKCPremiumTemplate';
import { STYLE_TOKENS } from '../pdfStyles';
import type { GeneratedPremium, PremiumStyle } from '../../../../types/premium-types';

vi.mock('@react-pdf/renderer', () => ({
  Document: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="pdf-document">{children}</div>
  ),
  Page: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="pdf-page">{children}</div>
  ),
  View: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Text: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  Image: () => null,
  StyleSheet: { create: (s: unknown) => s },
  Font: { register: vi.fn() },
}));

const ALL_STYLES = Object.keys(STYLE_TOKENS) as PremiumStyle[];

// Deliberately scrambled — if the body forgets to sort, this insertion order
// will leak through and the assertion fails.
const SCRAMBLED_CLASSES = [
  { element: 'Container', level: 'Master', section: null },
  { element: 'Container', level: 'Novice A', section: null },
  { element: 'Container', level: 'Excellent', section: null },
  { element: 'Container', level: 'Novice B', section: null },
  { element: 'Container', level: 'Advanced', section: null },
];

// Search for the body's rendered "Container <Level>" pairs rather than the
// bare level name. Cover summaries and narrative copy ("Novice title required
// for Advanced") also contain bare level words, which would corrupt a
// substring scan.
const EXPECTED_ORDER = [
  'Container Novice A',
  'Container Novice B',
  'Container Advanced',
  'Container Excellent',
  'Container Master',
];

function makePremium(style: PremiumStyle): GeneratedPremium {
  return {
    org: 'AKC',
    style,
    templateId: null,
    show: {
      name: 'June 2026 Trial',
      startDate: '2026-06-13',
      endDate: '2026-06-14',
      venue: '123 Main St',
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
        eventNumber: 'AKC-2026-001',
        type: 'Scent Work',
        judges: [{ name: 'Alice Judge', elements: ['Container'] }],
        classes: SCRAMBLED_CLASSES,
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

describe.each(ALL_STYLES)('body invariants — %s', style => {
  it('renders classes in progression order (Novice A → B → Advanced → Excellent → Master)', () => {
    const { container } = render(
      <AKCPremiumTemplate premium={makePremium(style)} inkSaver={false} />
    );
    const text = container.textContent ?? '';
    const positions = EXPECTED_ORDER.map(level => text.indexOf(level));
    // Every level must appear in the rendered output.
    expect(positions.every(p => p !== -1)).toBe(true);
    // And appear in progression order.
    for (let i = 1; i < positions.length; i++) {
      expect(positions[i]).toBeGreaterThan(positions[i - 1]!);
    }
  });

  it('shows "Online entries via myK9Show" as the primary entry method', () => {
    const { container } = render(
      <AKCPremiumTemplate premium={makePremium(style)} inkSaver={false} />
    );
    expect(container.textContent ?? '').toContain('Online entries via myK9Show');
  });
});
