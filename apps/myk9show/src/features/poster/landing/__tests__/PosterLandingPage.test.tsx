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
import { mockViewportWidth } from '@/test/utils/mockViewportWidth';

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

describe('PosterLandingPage — entry CTA count (MYK9-633)', () => {
  afterEach(() => {
    mockViewportWidth(1280);
  });

  it('renders exactly one entry CTA at desktop width', () => {
    mockViewportWidth(1280);
    const { container } = render(
      <PosterLandingPage
        show={{ id: 'show-1', name: baseData.showName } as never}
        trial={null}
        allTrials={[]}
        hasEntryClassInventory
        entryWindowNotOpen={false}
      />
    );

    expect(container.querySelectorAll(`a[href="${baseData.entryWizardUrl}"]`)).toHaveLength(1);
  });

  it('renders exactly two entry CTAs (header + sticky bar) at 375px', () => {
    mockViewportWidth(375);
    const { container } = render(
      <PosterLandingPage
        show={{ id: 'show-1', name: baseData.showName } as never}
        trial={null}
        allTrials={[]}
        hasEntryClassInventory
        entryWindowNotOpen={false}
      />
    );

    expect(container.querySelectorAll(`a[href="${baseData.entryWizardUrl}"]`)).toHaveLength(2);
  });

  it('uses identical copy for the header and mobile sticky CTAs', () => {
    mockViewportWidth(375);
    const { container } = render(
      <PosterLandingPage
        show={{ id: 'show-1', name: baseData.showName } as never}
        trial={null}
        allTrials={[]}
        hasEntryClassInventory
        entryWindowNotOpen={false}
      />
    );

    const links = container.querySelectorAll(`a[href="${baseData.entryWizardUrl}"]`);
    expect(links).toHaveLength(2);
    for (const link of Array.from(links)) {
      expect(link.textContent?.trim()).toBe('ENTER →');
    }
  });
});
