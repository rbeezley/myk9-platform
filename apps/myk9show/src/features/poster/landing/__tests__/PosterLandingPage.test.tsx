/**
 * MYK9-633: Poster repeated the entry CTA twice (StickyNav /
 * FinalCtaSection) — the same shape MYK9-565 fixed on Monogram. Exactly one
 * entry CTA at desktop width (the top mono strip), plus exactly one more —
 * a mobile-only sticky bottom bar reusing the same copy — below 640px.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from '@/test/utils/testUtils';
import { PosterLandingPage } from '../PosterLandingPage';
import type { PosterLandingData } from '../types';

vi.mock('../../fonts', async importOriginal => {
  const actual = await importOriginal<typeof import('../../fonts')>();
  return { ...actual, ensurePosterFontsLoaded: vi.fn() };
});

const baseData: PosterLandingData = {
  clubName: 'Poster Kennel Club',
  showName: 'Heartland Scent Work Classic',
  showSubtitle: 'AKC Licensed Trial',
  welcomeText: null,
  trialChairName: null,
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
  licenseLanguage: 'AKC Licensed Trial',
  memberClubLanguage: 'A member club of the American Kennel Club.',
  journeySteps: [],
  entryWizardUrl: '/shows/show-1/register',
  officers: [],
  onTheDay: [],
};

vi.mock('../usePosterLandingData', () => ({
  usePosterLandingData: () => baseData,
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

describe('PosterLandingPage — entry CTA count (MYK9-633)', () => {
  afterEach(() => {
    mockViewport(false);
  });

  it('renders exactly one entry CTA at desktop width', () => {
    mockViewport(false);
    const { container } = render(
      <PosterLandingPage
        show={{ id: 'show-1', name: baseData.showName } as never}
        trial={null}
        allTrials={[]}
        hasEntryClassInventory
        entryNotYetOpen={false}
      />
    );

    expect(container.querySelectorAll(`a[href="${baseData.entryWizardUrl}"]`)).toHaveLength(1);
  });

  it('renders exactly two entry CTAs (header + sticky bar) at 375px', () => {
    mockViewport(true);
    const { container } = render(
      <PosterLandingPage
        show={{ id: 'show-1', name: baseData.showName } as never}
        trial={null}
        allTrials={[]}
        hasEntryClassInventory
        entryNotYetOpen={false}
      />
    );

    expect(container.querySelectorAll(`a[href="${baseData.entryWizardUrl}"]`)).toHaveLength(2);
  });

  it('uses identical copy for the header and mobile sticky CTAs', () => {
    mockViewport(true);
    const { container } = render(
      <PosterLandingPage
        show={{ id: 'show-1', name: baseData.showName } as never}
        trial={null}
        allTrials={[]}
        hasEntryClassInventory
        entryNotYetOpen={false}
      />
    );

    const links = container.querySelectorAll(`a[href="${baseData.entryWizardUrl}"]`);
    expect(links).toHaveLength(2);
    for (const link of Array.from(links)) {
      expect(link.textContent?.trim()).toBe('ENTER →');
    }
  });
});
