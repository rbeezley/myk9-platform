/**
 * The public page's Enter CTA and service-fee line. Renders the REAL monogram
 * landing (the committed default style) through ShowPublicLanding, stubbing only
 * the landing's data hook and fonts, so the CTA gate is exercised on the real
 * prop path.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { ShowPublicLanding } from '../ShowPublicLanding';
import type { Show } from '@/types/show-types';
import type { MonogramLandingData } from '@/features/monogram/landing/types';

const feeQuery = vi.hoisted(() => ({ state: 'ready' as 'loading' | 'unavailable' | 'ready' }));

vi.mock('@/hooks/queries/usePlatformFeeRates', () => ({
  usePlatformFeeRatesQuery: () => ({
    rates: feeQuery.state === 'ready' ? { percent: 7, flatCents: 0, minCents: 0 } : null,
    state: feeQuery.state,
  }),
}));

const isoDay = (offset: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
};

vi.mock('@/features/monogram/landing/fonts', () => ({ ensureMonogramFontsLoaded: vi.fn() }));

const data: MonogramLandingData = {
  clubName: 'Tri-County Dog Training Club',
  showName: 'Fall Scent Work Trial',
  showSubtitle: 'AKC Licensed Trial',
  welcomeText: null,
  trialChairName: null,
  entryOpenDate: '2026-04-01',
  entryCloseDate: '2099-01-01',
  confirmationDate: null,
  trialStartDate: '2099-02-01',
  trialEndDate: '2099-02-02',
  timezone: 'America/Chicago',
  venueName: 'Expo Hall',
  venueAddress: '100 Dog Show Lane',
  venueCity: 'Tulsa, OK',
  trials: [],
  judges: [],
  entryCount: 0,
  entryLimit: null,
  fees: [],
  accommodations: [],
  vetClinic: null,
  coverImageUrl: null,
  pullQuote: null,
  pullQuoteAttribution: null,
  hospitalityNotes: null,
  awardsDescription: null,
  houseRulesNotes: null,
  secretaryName: null,
  secretaryEmail: null,
  licenseLanguage: 'AKC Licensed Trial',
  memberClubLanguage: 'A member club of the American Kennel Club.',
  journeySteps: [],
  entryWizardUrl: '/shows/show-1/register',
  monogramLetters: 'TDT',
  officers: [],
};

vi.mock('@/features/monogram/landing/useMonogramLandingData', () => ({
  useMonogramLandingData: () => data,
}));

function mockViewport(mobile: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: mobile,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

function renderLanding(
  onlineEntriesEnabled: boolean | undefined,
  window: { entryOpenDate: string; entryCloseDate: string } = {
    entryOpenDate: isoDay(-10),
    entryCloseDate: isoDay(20),
  }
) {
  const show = {
    ...window,
    id: 'show-1',
    name: data.showName,
    style: 'monogram',
    onlineEntriesEnabled,
  } as Show;
  return render(
    <ShowPublicLanding
      show={show}
      landingTrials={[]}
      hasEntryClassInventory
      entryPendingReason={undefined}
    />
  );
}

describe('ShowPublicLanding — Enter CTA gate (MYK9-979)', () => {
  afterEach(() => {
    mockViewport(false);
  });

  it('positive control: a show with online entries on offers "Enter this show"', () => {
    mockViewport(false);
    renderLanding(true);

    expect(screen.getAllByRole('link', { name: /enter this show/i }).length).toBeGreaterThan(0);
  });

  it('withholds "Enter this show" while the switch is unknown', () => {
    // Codex P2 on #2707: a cached row from before the column existed.
    mockViewport(false);
    renderLanding(undefined);

    expect(screen.queryByRole('link', { name: /enter this show/i })).not.toBeInTheDocument();
  });
});

// MYK9-1963: the service fee is said once on the public page, for a show that takes
// online entries, before the exhibitor reaches the wizard's third step.
describe('ShowPublicLanding — service fee line (MYK9-1963)', () => {
  beforeEach(() => {
    feeQuery.state = 'ready';
  });

  it('says the fee, linking how fees work, when online entries are on', () => {
    mockViewport(false);
    renderLanding(true);

    const note = screen.getByRole('note', { name: /service fee/i });
    expect(note).toHaveTextContent('Plus a 7% service fee when you pay online.');
    expect(screen.getByRole('link', { name: 'How our fees work' })).toHaveAttribute(
      'href',
      '/fees'
    );
  });

  it('says nothing about a fee while the switch is unknown', () => {
    mockViewport(false);
    renderLanding(undefined);

    expect(screen.queryByRole('note', { name: /service fee/i })).not.toBeInTheDocument();
  });

  it.each(['loading', 'unavailable'] as const)(
    'says nothing about a fee while the rates are %s',
    state => {
      feeQuery.state = state;
      mockViewport(false);
      renderLanding(true);

      expect(screen.queryByRole('note', { name: /service fee/i })).not.toBeInTheDocument();
    }
  );

  it('says nothing about a fee on a show whose entries have closed', () => {
    mockViewport(false);
    renderLanding(true, { entryOpenDate: isoDay(-30), entryCloseDate: isoDay(-5) });

    expect(screen.queryByRole('note', { name: /service fee/i })).not.toBeInTheDocument();
  });
});
