/**
 * MYK9-979: a show with online entries off is published for its premium only.
 * Its public page has no "Enter this show" anywhere and says how to enter
 * instead. Renders the REAL monogram landing (the committed default style)
 * through ShowPublicLanding, stubbing only the landing's data hook and fonts,
 * so the CTA gate is exercised on the real prop path.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { ShowPublicLanding } from '../ShowPublicLanding';
import { MAIL_IN_ENTRY_NOTE } from '@/features/payments/onlineEntryGate';
import type { Show } from '@/types/show-types';
import type { MonogramLandingData } from '@/features/monogram/landing/types';

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

function renderLanding(onlineEntriesEnabled: boolean | undefined) {
  const show = {
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
      entryWindowNotOpen={false}
    />
  );
}

describe('ShowPublicLanding — online entries off (MYK9-979)', () => {
  afterEach(() => {
    mockViewport(false);
  });

  it.each([
    ['desktop', false],
    ['mobile', true],
  ])('has no "Enter this show" at %s width and says how to enter', (_label, mobile) => {
    mockViewport(mobile);
    renderLanding(false);

    expect(screen.queryByRole('link', { name: /enter this show/i })).not.toBeInTheDocument();
    expect(screen.getByRole('note', { name: /how to enter/i })).toHaveTextContent(
      MAIL_IN_ENTRY_NOTE
    );
    // The landing's own "why no Enter button" copy must not blame missing classes.
    expect(screen.queryByText(/no classes are assigned/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/assign classes/i)).not.toBeInTheDocument();
  });

  it('positive control: the same show with online entries on offers "Enter this show" and no note', () => {
    mockViewport(false);
    renderLanding(true);

    expect(screen.getAllByRole('link', { name: /enter this show/i }).length).toBeGreaterThan(0);
    expect(screen.queryByRole('note', { name: /how to enter/i })).not.toBeInTheDocument();
  });

  it('withholds "Enter this show" while the switch is unknown, without a mail-in claim', () => {
    // Codex P2 on #2707: a cached row from before the column existed.
    mockViewport(false);
    renderLanding(undefined);

    expect(screen.queryByRole('link', { name: /enter this show/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('note', { name: /how to enter/i })).not.toBeInTheDocument();
  });
});
