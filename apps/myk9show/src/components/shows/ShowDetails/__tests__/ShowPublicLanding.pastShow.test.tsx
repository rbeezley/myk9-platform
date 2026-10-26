/**
 * MYK9-1423: a show that has already run offers no late-entry help and no mailto for it.
 * Renders the REAL monogram landing through ShowPublicLanding, stubbing only the landing's
 * data hook, fonts and the officials read, so the past-show flag is exercised on the real
 * provider path rather than a hand-built context.
 */
import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { ShowPublicLanding } from '../ShowPublicLanding';
import type { Show } from '@/types/show-types';
import type { MonogramLandingData } from '@/features/monogram/landing/types';

vi.mock('@/features/monogram/landing/fonts', () => ({ ensureMonogramFontsLoaded: vi.fn() }));

vi.mock('@/hooks/queries/useShowOfficials', () => ({
  useShowOfficials: () => ({
    isSuccess: true,
    data: {
      secretaries: [{ firstName: 'Pat', lastName: 'Secretary', email: 'pat@example.com' }],
      chairmen: [],
      stewards: [],
    },
  }),
}));

const data: MonogramLandingData = {
  clubName: 'Tri-County Dog Training Club',
  showName: 'Fall Scent Work Trial',
  showSubtitle: 'AKC Licensed Trial',
  welcomeText: null,
  trialChairName: null,
  entryOpenDate: '2020-04-01',
  entryCloseDate: '2020-05-01',
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

function renderLanding(startDate: string, endDate: string) {
  const show = {
    id: 'show-1',
    name: data.showName,
    style: 'monogram',
    onlineEntriesEnabled: true,
    startDate,
    endDate,
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

describe('ShowPublicLanding — late-entry contact on a finished show (MYK9-1423)', () => {
  it('a past show says it has taken place, with no late-entry copy and no mailto', () => {
    const { container } = renderLanding('2020-06-01', '2020-06-02');

    expect(screen.getAllByText('This show has already taken place.').length).toBeGreaterThan(0);
    expect(screen.queryByText(/late-entry/i)).not.toBeInTheDocument();
    expect(container.querySelector('a[href^="mailto:"]')).toBeNull();
  });

  it('positive control: closed entries on an upcoming show keep the sentence and the mailto', () => {
    const { container } = renderLanding('2099-02-01', '2099-02-02');

    expect(screen.getAllByText(/for late-entry help/i).length).toBeGreaterThan(0);
    expect(container.querySelector('a[href="mailto:pat@example.com"]')).not.toBeNull();
    expect(screen.queryByText('This show has already taken place.')).not.toBeInTheDocument();
  });
});
