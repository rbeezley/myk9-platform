/**
 * MYK9-633: Gazette repeated the entry CTA twice (StickyNav /
 * FinalCtaSection) — the same shape MYK9-565 fixed on Monogram. Exactly one
 * entry CTA at desktop width (the header nav), plus exactly one more — a
 * mobile-only sticky bottom bar reusing the same copy — below 640px.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { GazetteLandingPage } from '../GazetteLandingPage';
import type { GazetteLandingData } from '../types';

vi.mock('../../fonts', () => ({ ensureGazetteFontsLoaded: vi.fn() }));

const baseData: GazetteLandingData = {
  clubName: 'Gazette Kennel Club',
  showName: 'Heartland Scent Work Classic',
  showSubtitle: 'AKC Licensed Trial',
  welcomeText: null,
  trialChairName: null,
  trialChairTitle: null,
  entryOpenDate: '2026-04-01',
  entryCloseDate: '2099-01-01',
  confirmationDate: null,
  trialStartDate: '2026-08-01',
  trialEndDate: '2026-08-03',
  timezone: 'America/Chicago',
  venueName: 'Expo Hall',
  venueAddress: '100 Dog Show Lane',
  venueCity: 'Tulsa, OK',
  trials: [],
  judges: [],
  entryCount: 12,
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
  secretaryPhone: null,
  licenseLanguage: 'AKC Licensed Trial',
  memberClubLanguage: 'A member club of the American Kennel Club.',
  journeySteps: [],
  entryWizardUrl: '/shows/show-1/register',
  volumeRoman: 'I',
  edition: 1,
  motto: 'The Sporting Record',
  established: null,
  cityLabel: null,
  schedule: [],
  officers: [],
};

vi.mock('../useGazetteLandingData', () => ({
  useGazetteLandingData: () => baseData,
}));

function mockViewport(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches,
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

describe('GazetteLandingPage — entry CTA count (MYK9-633)', () => {
  afterEach(() => {
    mockViewport(false);
  });

  it('renders exactly one entry CTA at desktop width', () => {
    mockViewport(false);
    render(
      <GazetteLandingPage
        show={{ id: 'show-1', name: baseData.showName } as never}
        trial={null}
        allTrials={[]}
        hasEntryClassInventory
        entryNotYetOpen={false}
      />
    );

    expect(screen.getAllByRole('link', { name: /^enter$/i })).toHaveLength(1);
  });

  it('renders exactly two entry CTAs (header + sticky bar) at 375px', () => {
    mockViewport(true);
    render(
      <GazetteLandingPage
        show={{ id: 'show-1', name: baseData.showName } as never}
        trial={null}
        allTrials={[]}
        hasEntryClassInventory
        entryNotYetOpen={false}
      />
    );

    expect(screen.getAllByRole('link', { name: /^enter$/i })).toHaveLength(2);
  });

  it('uses identical copy and href for the header and mobile sticky CTAs', () => {
    mockViewport(true);
    render(
      <GazetteLandingPage
        show={{ id: 'show-1', name: baseData.showName } as never}
        trial={null}
        allTrials={[]}
        hasEntryClassInventory
        entryNotYetOpen={false}
      />
    );

    const links = screen.getAllByRole('link', { name: /^enter$/i });
    expect(links).toHaveLength(2);
    for (const link of links) {
      expect(link).toHaveAttribute('href', baseData.entryWizardUrl);
    }
  });
});
