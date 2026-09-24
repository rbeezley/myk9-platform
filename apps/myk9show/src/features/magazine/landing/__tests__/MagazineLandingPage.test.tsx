/**
 * MYK9-633: Magazine repeated the entry CTA twice (StickyNav /
 * FinalEditorialBand) — the same shape MYK9-565 fixed on Monogram. Exactly
 * one entry CTA at desktop width (the header nav), plus exactly one more —
 * a mobile-only sticky bottom bar reusing the same copy — below 640px.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { MagazineLandingPage } from '../MagazineLandingPage';
import type { MagazineLandingData } from '../types';
import { mockViewportWidth } from '@/test/utils/mockViewportWidth';

vi.mock('../../fonts', () => ({ ensureMagazineFontsLoaded: vi.fn() }));

const baseData: MagazineLandingData = {
  clubName: 'Magazine Kennel Club',
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
  monogramLetters: 'MKC',
  coverCaption: null,
  officers: [],
};

vi.mock('../useMagazineLandingData', () => ({
  useMagazineLandingData: () => baseData,
}));

describe('MagazineLandingPage — entry CTA count (MYK9-633)', () => {
  afterEach(() => {
    mockViewportWidth(1280);
  });

  it('renders exactly one entry CTA at desktop width', () => {
    mockViewportWidth(1280);
    const { container } = render(
      <MagazineLandingPage
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
      <MagazineLandingPage
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
      <MagazineLandingPage
        show={{ id: 'show-1', name: baseData.showName } as never}
        trial={null}
        allTrials={[]}
        hasEntryClassInventory
        entryWindowNotOpen={false}
      />
    );

    const links = screen.getAllByRole('link', { name: /enter the trial/i });
    expect(links).toHaveLength(2);
    for (const link of links) {
      expect(link).toHaveAttribute('href', baseData.entryWizardUrl);
    }
    expect(container.querySelectorAll(`a[href="${baseData.entryWizardUrl}"]`)).toHaveLength(2);
  });
});
