import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import type { Show } from '@/types/show-types';
import ShowAboutPage from '../ShowAboutPage';

const harness = vi.hoisted(() => ({
  outlet: undefined as unknown,
  officials: { data: undefined as unknown },
  committee: null as string[] | null,
  runPublish: vi.fn(),
}));

vi.mock('@/components/shows/ShowDetails/showManagementOutlet', () => ({
  useShowManagementOutlet: () => harness.outlet,
}));
vi.mock('@/hooks/queries/useShowOfficials', () => ({
  useShowOfficials: () => harness.officials,
}));
vi.mock('@/services/database/club-memberships/committee', () => ({
  fetchShowCommittee: async () => harness.committee,
}));
vi.mock('@/features/premium/usePremiumPublishControl', () => ({
  usePremiumPublishControl: () => ({
    run: harness.runPublish,
    isBusy: false,
    publishFailed: false,
    failureMessage: '',
    info: undefined,
    infoState: 'ready',
    hasPublishedPremium: false,
    stale: false,
    landingUnpublished: false,
    needsRepublish: false,
    action: { label: 'Generate & publish premium' },
  }),
}));
vi.mock('@/features/premium/LandingPageCard', () => ({ LandingPageCard: () => null }));
vi.mock('@/components/shows/about/ShowAboutFacts', () => ({
  ShowAboutEntries: () => null,
  ShowAboutWhere: () => null,
  ShowAboutWithdrawal: () => null,
}));
vi.mock('@/components/shows/overview/AboutThisShowCard', () => ({
  AboutThisShowCard: () => null,
}));
vi.mock('@/components/shows/about/ShowAboutAccessCodesLink', () => ({
  ShowAboutAccessCodesLink: () => null,
}));

const show = {
  id: 'show-1',
  name: 'Heartland Classic',
  location: '',
  clubId: 'club-1',
  clubName: 'Heartland Club',
  startDate: '2026-06-01',
  entryOpenDate: '',
  entryCloseDate: '',
  preEntryFee: '25',
  assignedJudges: [],
} as unknown as Show;

function outlet(overrides: Record<string, unknown> = {}) {
  return {
    show,
    canManageShow: true,
    judges: [{ judgeId: 'j1', judgeName: 'Alice Judge', assignedClasses: ['c1'] }],
    managerEntryCount: 0,
    trials: [{ id: 't1', name: 'Saturday', eventNumber: 'AKC-1' }],
    classes: [{ id: 'c1', name: 'Container Novice', trialId: 't1', meta: '' }],
    ...overrides,
  };
}

beforeEach(() => {
  harness.outlet = outlet();
  harness.officials = {
    data: {
      secretaries: [{ personId: 'p1', firstName: 'Jane', lastName: 'Smith' }],
      chairmen: [],
      stewards: [],
    },
  };
  harness.committee = ['A', 'B', 'C'];
  harness.runPublish.mockClear();
  Element.prototype.scrollIntoView = vi.fn();
});

describe('ShowAboutPage premium requirements (MYK9-2053)', () => {
  it('lists what the registry requires that is empty, with links, and keeps publish enabled', async () => {
    render(<ShowAboutPage />, { initialRoute: '/shows/show-1/about' });

    expect(await screen.findByText(/AKC requires the show's location/)).toBeInTheDocument();
    expect(screen.getByText(/AKC requires when entries open and close/)).toBeInTheDocument();
    expect(screen.getByText(/AKC requires the Trial Chair/)).toBeInTheDocument();
    expect(
      await screen.findByText(/at least 5 Event Committee members; 3 are listed/)
    ).toBeInTheDocument();
    // Present facts are not listed.
    expect(screen.queryByText(/requires the Trial Secretary\. Add/)).toBeNull();
    // A named Secretary with no typed mailing address is listed (MYK9-2065); no Chair, so no Chair address.
    expect(screen.getByText(/requires the Trial Secretary's mailing address/)).toBeInTheDocument();
    expect(screen.queryByText(/Trial Chair's mailing address/)).toBeNull();
    expect(screen.queryByText(/requires the name of the club/)).toBeNull();

    expect(
      screen.getByRole('link', { name: /Fix it: AKC requires the show's location/ })
    ).toHaveAttribute('href', '/shows/show-1?edit=true');
    expect(
      screen.getByRole('link', { name: /Fix it: AKC requires the Trial Chair/ })
    ).toHaveAttribute('href', '/shows/show-1?edit=true&editTab=personnel');
    expect(
      screen.getByRole('link', { name: /Fix it: AKC requires at least 5 Event Committee/ })
    ).toHaveAttribute('href', '/clubs/club-1?tab=members');

    // Warns, never blocks.
    expect(screen.getByRole('button', { name: /Generate & publish premium/ })).toBeEnabled();
  });

  it('lists each trial that lacks a judge or an event number on its own, with no duplicate keys', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    harness.outlet = outlet({
      trials: [
        { id: 't1', name: 'Saturday', eventNumber: 'AKC-1' },
        { id: 't2', name: 'Sunday', eventNumber: '' },
        { id: 't3', name: 'Monday', eventNumber: '' },
      ],
      classes: [
        { id: 'c1', name: 'Container Novice', trialId: 't1', meta: '' },
        { id: 'c2', name: 'Container Novice', trialId: 't2', meta: '' },
        { id: 'c3', name: 'Container Novice', trialId: 't3', meta: '' },
      ],
    });
    render(<ShowAboutPage />, { initialRoute: '/shows/show-1/about' });

    expect(
      await screen.findByText(
        'AKC requires a judge for Sunday. Assign one to its classes in Select classes.'
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'AKC requires a judge for Monday. Assign one to its classes in Select classes.'
      )
    ).toBeInTheDocument();
    expect(screen.queryByText(/requires a judge for Saturday/)).toBeNull();
    expect(screen.getByText(/requires an event number for Sunday/)).toBeInTheDocument();
    expect(screen.getByText(/requires an event number for Monday/)).toBeInTheDocument();
    const keyWarnings = errorSpy.mock.calls.filter(call => String(call[0]).includes('same key'));
    expect(keyWarnings).toEqual([]);
    errorSpy.mockRestore();
  });

  it('says nothing about the committee while it could not be read', async () => {
    harness.committee = null;
    render(<ShowAboutPage />, { initialRoute: '/shows/show-1/about' });
    expect(await screen.findByText(/AKC requires the show's location/)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText(/Event Committee/)).toBeNull());
  });

  it('shows no list to a club that publishes its own premium', () => {
    harness.outlet = outlet({ show: { ...show, publishesOwnPremium: true } });
    render(<ShowAboutPage />, { initialRoute: '/shows/show-1/about' });
    expect(screen.queryByRole('region', { name: 'Premium list requirements' })).toBeNull();
  });

  it('shows no list to someone who cannot manage the show', () => {
    harness.outlet = outlet({ canManageShow: false });
    render(<ShowAboutPage />, { initialRoute: '/shows/show-1/about' });
    expect(screen.queryByRole('region', { name: 'Premium list requirements' })).toBeNull();
  });
});
