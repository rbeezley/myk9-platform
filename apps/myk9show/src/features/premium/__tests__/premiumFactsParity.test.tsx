/**
 * MYK9-1952 phase 1: the premium list prints from one list of facts. This is the parity net:
 * the snapshots were taken from main's output BEFORE the refactor, so a style that gains or
 * drops a fact (or changes its wording) fails here.
 */
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { fromAny } from '@total-typescript/shoehorn';
import { AKCPremiumTemplate } from '../pdf/AKCPremiumTemplate';
import { UKCPremiumTemplate } from '../pdf/UKCPremiumTemplate';
import { STYLE_TOKENS } from '../pdf/pdfStyles';
import type { GeneratedPremium, PremiumStyle } from '@/types/premium-types';
import { STYLED_LANDING_BY_STYLE } from '@/features/_shared/styledLandingRegistry';
import type { Show } from '@/types/show-types';
import type { Trial } from '@/components/trials/types/trial.types';
import { render as renderWithProviders } from '@/test/utils/testUtils';

vi.mock('@/hooks/queries/useEntriesDatabase', () => ({
  useEntriesByShowQuery: () => ({ data: [] }),
}));

const ALL_STYLES = Object.keys(STYLE_TOKENS) as PremiumStyle[];
type Org = 'AKC' | 'UKC';

function fullPremium(org: Org, style: PremiumStyle): GeneratedPremium {
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
      acceptCash: true,
    },
    club: { name: 'Test Club', logoUrl: null },
    secretary: {
      name: 'Jane Smith',
      email: 'jane@test.com',
      phone: '9185550000',
      mailingAddress: '456 Oak Ave',
    },
    officials: { chairman: { name: 'Bob Jones', email: 'bob@test.com', phone: '9185550001' } },
    trials: [
      {
        name: 'Saturday Trial 1',
        date: '2026-06-01',
        startTime: '9:00 AM',
        eventNumber: `${org}-2026-001`,
        type: 'Scent Work',
        judges: [
          { name: 'Alice Judge', elements: ['Container', 'Interior'] },
          { name: 'Carl Judge', elements: [] },
        ],
        classes: [
          { element: 'Interior', level: 'Advanced', section: null },
          { element: 'Container', level: 'Novice', section: 'A' },
          { element: 'Container', level: 'Excellent', section: null },
        ],
      },
      {
        name: 'Sunday Trial 2',
        date: '2026-06-02',
        startTime: null,
        eventNumber: null,
        type: 'Scent Work',
        judges: [{ name: 'Alice Judge', elements: ['Vehicle'] }],
        classes: [{ element: 'Vehicle', level: 'Master', section: null }],
      },
    ],
    supplemental: {
      vetClinic: { name: 'Animal ER', address: '789 Vet Blvd', phone: '9189990000' },
      accommodations: [
        { name: 'La Quinta', address: '100 Hotel Rd', phone: '9181112222' },
        { name: 'Motel 6', address: '200 Inn Rd', phone: '' },
      ],
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

function sparsePremium(org: Org, style: PremiumStyle): GeneratedPremium {
  return {
    org,
    style,
    templateId: null,
    show: {
      name: 'Bare Show',
      startDate: '2026-06-01',
      endDate: '2026-06-01',
      venue: null,
      entryOpenDate: null,
      entryCloseDate: null,
      preEntryFee: null,
      dayOfFee: null,
      acceptChecks: false,
      acceptCash: false,
    },
    club: { name: null, logoUrl: null },
    secretary: { name: null, email: null, phone: null, mailingAddress: null },
    officials: { chairman: null },
    trials: [],
    supplemental: {
      vetClinic: null,
      accommodations: [],
      coverImageUrl: null,
      hospitalityNotes: null,
      awardsDescription: null,
      additionalNotes: null,
    },
    narratives: { showHours: '', trialInformation: '' },
  };
}

/** Every text node, one per line, so a snapshot diff names the exact fact that moved. */
function pdfText(org: Org, premium: GeneratedPremium, inkSaver = false): string {
  const result = render(
    org === 'AKC' ? (
      <AKCPremiumTemplate premium={premium} inkSaver={inkSaver} />
    ) : (
      <UKCPremiumTemplate premium={premium} inkSaver={inkSaver} />
    )
  );
  const pages = result.getAllByTestId('pdf-page');
  const lines = pages.map((page, i) => {
    const spans = Array.from(page.querySelectorAll('span')).filter(
      span => !span.querySelector('span')
    );
    return [`--- page ${i + 1} ---`, ...spans.map(s => s.textContent ?? '')].join('\n');
  });
  result.unmount();
  return lines.join('\n');
}

describe('premium PDF facts parity (8 styles)', () => {
  it.each(ALL_STYLES)('%s prints the same facts for a full AKC show', style => {
    expect(pdfText('AKC', fullPremium('AKC', style))).toMatchSnapshot();
  });
  it.each(ALL_STYLES)('%s prints the same facts for a full UKC show', style => {
    expect(pdfText('UKC', fullPremium('UKC', style))).toMatchSnapshot();
  });
  it.each(ALL_STYLES)('%s prints the same facts for a show with everything empty', style => {
    expect(pdfText('AKC', sparsePremium('AKC', style))).toMatchSnapshot();
  });
  it.each(ALL_STYLES)('%s prints the same facts with ink saver on', style => {
    expect(pdfText('AKC', fullPremium('AKC', style), true)).toMatchSnapshot();
  });
});

const PUBLISHED_SHOW: Show = fromAny<Show, unknown>({
  id: 'show-1',
  name: 'Spring Scent Trial',
  organization: 'Test Club',
  location: '123 Main St, Tulsa, OK 74101',
  startDate: '2026-06-01',
  endDate: '2026-06-02',
  entryOpenDate: '2026-04-01',
  entryCloseDate: '2030-05-15',
  preEntryFee: '20',
  dayOfShowFee: '25',
  experienceIsPublished: true,
  experiencePublishedStyle: 'monogram',
  experiencePublishedContent: {
    style: 'monogram',
    generatedAt: '2026-04-01T00:00:00Z',
    narratives: {
      showHours: 'Building opens at 8:00 AM.',
      trialInformation: 'Novice title required for Advanced.',
    },
    supplemental: fullPremium('AKC', 'monogram').supplemental,
    outputs: {},
  },
  trials: [
    {
      id: 't1',
      name: 'Saturday Trial 1',
      date: '2026-06-01',
      classes: [
        { id: 'c1', element: 'Interior', level: 'Advanced' },
        { id: 'c2', element: 'Container', level: 'Novice', section: 'A' },
      ],
    },
  ],
});

const TRIAL = fromAny<Trial, unknown>({
  id: 't1',
  name: 'Saturday Trial 1',
  trialNumber: 1,
  trialDate: '2026-06-01',
});

describe('premium public page facts parity (8 styles)', () => {
  // The Headline landing counts down to entry close; freeze the clock so the text is stable.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-05-01T12:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it.each(ALL_STYLES)('%s prints the same facts for a published show', style => {
    const Component = STYLED_LANDING_BY_STYLE[style];
    const { container } = renderWithProviders(
      <Component show={PUBLISHED_SHOW} trial={TRIAL} allTrials={[TRIAL]} />
    );
    const text = Array.from(container.querySelectorAll('*'))
      .filter(el => el.children.length === 0)
      .map(el => (el.textContent ?? '').trim())
      .filter(Boolean)
      .join('\n');
    expect(text).toMatchSnapshot();
  });
});
