/**
 * MYK9-633: Banner repeated the entry CTA twice (FlagMasthead /
 * FinalFlagBand) — the same shape MYK9-565 fixed on Monogram. Exactly one
 * entry CTA at desktop width, plus exactly one more — a mobile-only sticky
 * bottom bar reusing the same copy — below 640px.
 *
 * MYK9-633 round 2: the desktop CTA lives in StickyNav, not FlagMasthead —
 * the masthead is not sticky, so its own CTA was unreachable once scrolled
 * past (StickyNav's `position: sticky` keeps it in view at every scroll
 * position).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { BannerLandingPage } from '../BannerLandingPage';
import { deriveBannerBrandColors } from '../../hooks/useBannerBrandColor';
import type { BannerLandingData } from '../types';
import { mockViewportWidth } from '@/test/utils/mockViewportWidth';

vi.mock('../../fonts', () => ({
  ensureBannerFontsLoaded: vi.fn(),
  BANNER_DISPLAY_FAMILY: "'Inter Tight', system-ui, sans-serif",
  BANNER_BODY_FAMILY: "'Inter', system-ui, sans-serif",
}));

const baseData: BannerLandingData = {
  clubName: 'Banner Kennel Club',
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
  brandColors: deriveBannerBrandColors('#1a5fb4'),
  officers: [],
  onTheDay: [],
};

vi.mock('../useBannerLandingData', () => ({
  useBannerLandingData: () => baseData,
}));

describe('BannerLandingPage — entry CTA count (MYK9-633)', () => {
  afterEach(() => {
    mockViewportWidth(1280);
  });

  it('renders exactly one entry CTA at desktop width', () => {
    mockViewportWidth(1280);
    render(
      <BannerLandingPage
        show={{ id: 'show-1', name: baseData.showName } as never}
        trial={null}
        allTrials={[]}
        hasEntryClassInventory
        entryNotYetOpen={false}
      />
    );

    expect(screen.getAllByRole('link', { name: /enter this show/i })).toHaveLength(1);
  });

  it('renders exactly two entry CTAs (header + sticky bar) at 375px', () => {
    mockViewportWidth(375);
    render(
      <BannerLandingPage
        show={{ id: 'show-1', name: baseData.showName } as never}
        trial={null}
        allTrials={[]}
        hasEntryClassInventory
        entryNotYetOpen={false}
      />
    );

    expect(screen.getAllByRole('link', { name: /enter this show/i })).toHaveLength(2);
  });

  it('uses identical copy and href for the header and mobile sticky CTAs', () => {
    mockViewportWidth(375);
    render(
      <BannerLandingPage
        show={{ id: 'show-1', name: baseData.showName } as never}
        trial={null}
        allTrials={[]}
        hasEntryClassInventory
        entryNotYetOpen={false}
      />
    );

    const links = screen.getAllByRole('link', { name: /enter this show/i });
    expect(links).toHaveLength(2);
    for (const link of links) {
      expect(link).toHaveAttribute('href', baseData.entryWizardUrl);
    }
  });
});
