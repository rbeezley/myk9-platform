import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { HeadlineLandingPage } from '../HeadlineLandingPage';

vi.mock('@/features/headline/fonts', () => ({
  ensureHeadlineFontsLoaded: vi.fn(),
}));

vi.mock('@/features/heritage/hooks/useCountdown', () => ({
  useCountdown: () => ({
    days: 12,
    hours: 6,
    minutes: 38,
    seconds: 4,
    closed: false,
    hasTarget: true,
  }),
}));

vi.mock('@/features/heritage/landing/useHeritageLandingData', () => ({
  useHeritageLandingData: () => ({
    clubName: 'Bexar County Kennel Club',
    showName: 'Spring Scent Work Trial',
    showSubtitle: 'AKC Licensed Trial · 2 Trials',
    welcomeText: null,
    trialChairName: null,
    entryOpenDate: '2026-04-15',
    entryCloseDate: '2026-06-03',
    confirmationDate: '2026-06-06',
    trialStartDate: '2026-06-12',
    trialEndDate: '2026-06-14',
    timezone: 'America/Chicago',
    venueName: 'Live Oak Civic Center',
    venueAddress: '8101 Pat Booker Rd',
    venueCity: 'San Antonio, TX',
    trials: [
      { id: 'trial-1', trialNumber: 1, date: '2026-06-12', judgeName: 'Cynthia Beagles' },
      { id: 'trial-2', trialNumber: 2, date: '2026-06-13', judgeName: 'Marcus Whitfield' },
    ],
    judges: [
      {
        id: 'judge-1',
        name: 'Cynthia Beagles',
        city: 'Austin, TX',
        trials: ['I'],
        elements: ['Containers', 'Interiors'],
      },
    ],
    entryCount: 137,
    entryLimit: 360,
    fees: [{ label: 'First entry', amount: '$25.00' }],
    officers: [{ title: 'Trial Chair', name: 'Sarah Whitman' }],
    accommodations: [{ name: 'Hampton Inn Live Oak', address: '0.4 mi', phone: '(210) 555-0100' }],
    hospitalityNotes: 'Lunch and refreshments provided.',
    awardsDescription: 'Rosettes for first through fourth.',
    houseRulesNotes: 'Indoor climate-controlled facility.',
    secretaryName: 'James Nakamura',
    secretaryEmail: 'secretary@example.com',
    licenseLanguage: 'AKC Licensed Scent Work Trial',
    memberClubLanguage: 'A member club of the American Kennel Club.',
    journeySteps: [
      {
        date: '2026-06-03',
        label: 'Entries close',
        description: 'Final deadline for all entries',
        status: 'active',
      },
    ],
    entryWizardUrl: '/shows/show-1/register',
  }),
}));

describe('HeadlineLandingPage', () => {
  const originalTimezone = process.env.TZ;

  afterEach(() => {
    if (originalTimezone) {
      process.env.TZ = originalTimezone;
    } else {
      delete process.env.TZ;
    }
  });

  it('renders the Headline masthead, sections, and entry call to action', () => {
    render(<HeadlineLandingPage show={null} trial={null} allTrials={[]} />);

    expect(screen.getByRole('heading', { name: /Spring Scent Work Trial/i })).toBeTruthy();
    expect(screen.getAllByText('Bexar County Kennel Club').length).toBeGreaterThan(0);
    expect(screen.getByText('Cynthia Beagles')).toBeTruthy();
    expect(screen.getByText('$25')).toBeTruthy();
    expect(screen.getByText('137')).toBeTruthy();
    expect(screen.getAllByRole('link', { name: /enter this show/i })[0]).toHaveAttribute(
      'href',
      '/shows/show-1/register'
    );
  });

  it('renders date-only show dates as Jun 12-14 in the hero and footer', () => {
    process.env.TZ = 'Asia/Tokyo';

    render(<HeadlineLandingPage show={null} trial={null} allTrials={[]} />);

    expect(screen.getAllByText('Jun 12, 2026 – Jun 14, 2026')).toHaveLength(2);
  });
});
