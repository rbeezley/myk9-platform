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
        entryWindowNotOpen={false}
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
        entryWindowNotOpen={false}
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
        entryWindowNotOpen={false}
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

/**
 * Round-3 restructure (MYK9-565): round 2's spacer test rendered a fixture
 * with <footer> BEFORE <FinalCtaBand> and asserted spacer-after-footer --
 * the INVERSE of the real page, where FinalCtaBand sat mid-<main>, before
 * <MonogramFooter>. That fixture certified a layout where the fixed bar
 * covered the footer's last block (measured in real Chrome at 375x812:
 * `.mg-footer__meta` at y 756-800 under the bar at y 771-836).
 *
 * This exercises the REAL component tree instead. jsdom has no layout
 * engine, so it can't reproduce the pixel overlap directly -- it proves the
 * structural fix: FinalCtaBand now renders after <MonogramFooter>, so its
 * in-flow spacer is the last element under the page root, reserving space
 * at the actual end of the document rather than opening a gap mid-page. The
 * pixel geometry itself is covered by a Playwright assertion at 375x812
 * (src/test/e2e/monogram-sticky-cta.spec.ts).
 */
describe('MonogramLandingPage — sticky-bar spacer sits at the end of the document', () => {
  function stubHeight(px: number) {
    Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        height: px,
        width: 375,
        top: 0,
        left: 0,
        right: 375,
        bottom: px,
        x: 0,
        y: 0,
      }),
    });
  }

  afterEach(() => {
    mockViewport(false);
  });

  it('reserves the bar height AFTER the footer, not mid-page', () => {
    stubHeight(65);
    mockViewport(true);
    const { container } = render(
      <MonogramLandingPage
        show={{ id: 'show-1', name: baseData.showName } as never}
        trial={null}
        allTrials={[]}
        hasEntryClassInventory
        entryWindowNotOpen={false}
      />
    );

    const bar = screen.getByRole('region', { name: /enter this show/i });
    const root = container.firstElementChild as HTMLElement;
    const spacer = bar.previousElementSibling as HTMLElement;

    // The spacer is the reserved-space element FinalCtaBand renders right
    // before its fixed bar (aria-hidden, sized to the bar's measured
    // height). It must be the SECOND-TO-LAST child under the page root --
    // i.e. immediately after <MonogramFooter> and immediately before the
    // bar itself -- not sitting mid-page next to the hero.
    expect(spacer).toHaveAttribute('aria-hidden', 'true');
    expect(spacer.style.height).toBe('65px');
    expect(root.lastElementChild).toBe(bar);
    expect(root.lastElementChild?.previousElementSibling).toBe(spacer);
    expect(spacer.previousElementSibling?.tagName).toBe('FOOTER');

    // No OTHER bare "just a height" aria-hidden spacer exists earlier in
    // the tree (i.e. it did not also/instead render mid-<main>, next to the
    // CTA it repeats -- the exact bug round 2 shipped). Matched on the exact
    // style signature `height: 65px;` alone, not a substring match, since
    // the page's decorative monogram glyphs are also `aria-hidden` and
    // happen to carry other height-related styling.
    const bareHeightSpacers = Array.from(
      container.querySelectorAll<HTMLElement>('[aria-hidden="true"]')
    ).filter(el => el.getAttribute('style')?.trim() === 'height: 65px;');
    expect(bareHeightSpacers).toEqual([spacer]);
  });
});
