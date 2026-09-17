/**
 * MYK9-565: a human tester (Richard's wife) counted THREE "Enter the Show" /
 * "Enter this Show" calls to action on a public show page — top, middle, and
 * bottom, with inconsistent copy. Per the product owner's decision, the fix
 * is: exactly one entry CTA at desktop width (the sticky header nav), plus
 * exactly one more — a mobile-only sticky bottom bar reusing the same copy —
 * below 640px.
 *
 * This is a real-prop-shape render of the actual page tree (StickyNav +
 * HeroBlock + ... + FinalCtaBand), only stubbing the data-fetch hook so the
 * test doesn't need a full Show/Trial fixture. It is the render test the
 * MYK9-565 acceptance criteria asked for: red (3 CTAs, both widths) on
 * `main`, green (1 desktop / 2 mobile) after.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { MonogramLandingPage } from '../MonogramLandingPage';
import type { MonogramLandingData } from '../types';

vi.mock('../fonts', () => ({ ensureMonogramFontsLoaded: vi.fn() }));

const baseData: MonogramLandingData = {
  clubName: 'Monogram Kennel Club',
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
  officers: [],
};

vi.mock('../useMonogramLandingData', () => ({
  useMonogramLandingData: () => baseData,
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

describe('MonogramLandingPage — entry CTA count (MYK9-565)', () => {
  afterEach(() => {
    mockViewport(false);
  });

  it('renders exactly one entry CTA at desktop width', () => {
    mockViewport(false);
    render(
      <MonogramLandingPage
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
    mockViewport(true);
    render(
      <MonogramLandingPage
        show={{ id: 'show-1', name: baseData.showName } as never}
        trial={null}
        allTrials={[]}
        hasEntryClassInventory
        entryNotYetOpen={false}
      />
    );

    expect(screen.getAllByRole('link', { name: /enter this show/i })).toHaveLength(2);
  });

  it('uses identical copy for the header and mobile sticky CTAs', () => {
    mockViewport(true);
    render(
      <MonogramLandingPage
        show={{ id: 'show-1', name: baseData.showName } as never}
        trial={null}
        allTrials={[]}
        hasEntryClassInventory
        entryNotYetOpen={false}
      />
    );

    const links = screen.getAllByRole('link', { name: /enter this show/i });
    const labels = links.map(link => link.textContent?.trim());
    expect(new Set(labels).size).toBe(1);
    for (const link of links) {
      expect(link).toHaveAttribute('href', '/shows/show-1/register');
    }
  });
});
