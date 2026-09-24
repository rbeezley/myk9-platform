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
import { mockViewportWidth } from '@/test/utils/mockViewportWidth';

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

describe('GazetteLandingPage — entry CTA count (MYK9-633)', () => {
  afterEach(() => {
    mockViewportWidth(1280);
  });

  it('renders exactly one entry CTA at desktop width', () => {
    mockViewportWidth(1280);
    const { container } = render(
      <GazetteLandingPage
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
      <GazetteLandingPage
        show={{ id: 'show-1', name: baseData.showName } as never}
        trial={null}
        allTrials={[]}
        hasEntryClassInventory
        entryWindowNotOpen={false}
      />
    );

    expect(container.querySelectorAll(`a[href="${baseData.entryWizardUrl}"]`)).toHaveLength(2);
  });

  it('uses identical accessible name for the header and mobile sticky CTAs', () => {
    mockViewportWidth(375);
    const { container } = render(
      <GazetteLandingPage
        show={{ id: 'show-1', name: baseData.showName } as never}
        trial={null}
        allTrials={[]}
        hasEntryClassInventory
        entryWindowNotOpen={false}
      />
    );

    const links = screen.getAllByRole('link', { name: /^enter$/i });
    expect(links).toHaveLength(2);
    for (const link of links) {
      expect(link).toHaveAttribute('href', baseData.entryWizardUrl);
    }
    // Every entry-wizard-href link found by href must ALSO be one of the
    // two accessibly-named "Enter" links — otherwise a stray, differently
    // named link to the same URL would pass the count above undetected.
    expect(container.querySelectorAll(`a[href="${baseData.entryWizardUrl}"]`)).toHaveLength(2);
  });
});
