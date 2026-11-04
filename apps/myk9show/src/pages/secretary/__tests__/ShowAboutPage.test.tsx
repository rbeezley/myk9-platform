import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import type { Show } from '@/types/show-types';
import ShowAboutPage from '../ShowAboutPage';

const harness = vi.hoisted(() => ({
  outlet: undefined as unknown,
  wifi: { data: undefined as unknown, isLoading: false, isError: false },
  policy: { data: undefined as unknown, isLoading: false, isError: false },
}));

vi.mock('@/components/shows/ShowDetails/showManagementOutlet', () => ({
  useShowManagementOutlet: () => harness.outlet,
}));
vi.mock('@/hooks/queries/useShowVenueWifi', () => ({ useShowVenueWifi: () => harness.wifi }));
vi.mock('@/hooks/queries/useShowWithdrawalPolicySummary', () => ({
  useShowWithdrawalPolicySummary: () => harness.policy,
}));
vi.mock('@/features/premium/PremiumDownloadCard', () => ({
  PremiumDownloadCard: () => <div id="setup-publish-premium" data-testid="premium-card" />,
}));
vi.mock('@/features/premium/LandingPageCard', () => ({
  LandingPageCard: () => <div id="setup-publish-landing" data-testid="landing-card" />,
}));
vi.mock('@/components/shows/overview/ShowOfficials', () => ({
  ShowOfficials: () => <div data-testid="officials" />,
}));
vi.mock('@/components/shows/overview/JudgesList', () => ({
  JudgesList: () => <div data-testid="judges" />,
}));
vi.mock('@/components/shows/overview/ShareEvent', () => ({
  ShareEvent: () => <div data-testid="share" />,
}));

const show = {
  id: 'show-1',
  name: 'Heartland Classic',
  location: 'Tulsa Expo Hall, Tulsa, OK',
  clubName: 'Heartland Club',
  preEntryFee: '25',
  assignedJudges: [],
  usesLandingPage: true,
} as unknown as Show;

beforeEach(() => {
  harness.outlet = { show, canManageShow: true, judges: [], managerEntryCount: 12 };
  harness.wifi = {
    data: { venueWifiNetwork: 'ExpoGuest', venueWifiPassword: 'dogs1234' },
    isLoading: false,
    isError: false,
  };
  harness.policy = {
    data: { cutoffDate: '2026-12-01', retentionType: 'flat', retentionValue: 500, notes: null },
    isLoading: false,
    isError: false,
  };
  Element.prototype.scrollIntoView = vi.fn();
});

describe('ShowAboutPage (MYK9-1683)', () => {
  it('renders the publish cards, facts, officials, judges and share for a manager', () => {
    render(<ShowAboutPage />, { initialRoute: '/shows/show-1/about' });
    expect(screen.getByTestId('premium-card')).toBeInTheDocument();
    expect(screen.getByTestId('landing-card')).toBeInTheDocument();
    expect(screen.getAllByText('Tulsa Expo Hall, Tulsa, OK').length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: /view on google maps/i })).toHaveAttribute(
      'href',
      expect.stringContaining('google.com/maps')
    );
    expect(screen.getByText(/ExpoGuest/)).toBeInTheDocument();
    expect(screen.getByText(/Full refund of the entry fee until/)).toBeInTheDocument();
    expect(screen.getByText(/after that, \$5\.00 is kept/)).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Entries and fees' })).toBeInTheDocument();
    expect(screen.getByTestId('officials')).toBeInTheDocument();
    expect(screen.getByTestId('judges')).toBeInTheDocument();
    expect(screen.getByTestId('share')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^edit show$/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /view as exhibitor/i })).toBeInTheDocument();
  });

  it('has nothing editable in place', () => {
    const { container } = render(<ShowAboutPage />, { initialRoute: '/shows/show-1/about' });
    expect(container.querySelectorAll('input, textarea, select')).toHaveLength(0);
    expect(screen.queryByRole('switch')).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('links to Email delivery for this show', () => {
    render(<ShowAboutPage />, { initialRoute: '/shows/show-1/about' });
    expect(screen.getByRole('link', { name: 'Email delivery' })).toHaveAttribute(
      'href',
      '/secretary/messages?showId=show-1&view=email'
    );
  });

  it('says so when no Wi-Fi or withdrawal policy is set', () => {
    harness.wifi = {
      data: { venueWifiNetwork: null, venueWifiPassword: null },
      isLoading: false,
      isError: false,
    };
    harness.policy = {
      data: { cutoffDate: null, retentionType: null, retentionValue: null, notes: null },
      isLoading: false,
      isError: false,
    };
    render(<ShowAboutPage />, { initialRoute: '/shows/show-1/about' });
    expect(screen.getByText('No Wi-Fi set.')).toBeInTheDocument();
    expect(screen.getByText(/club default withdrawal policy/)).toBeInTheDocument();
  });

  it('does not invent empty facts when the reads are paused with nothing cached', () => {
    harness.wifi = { data: undefined, isLoading: false, isError: false };
    harness.policy = { data: undefined, isLoading: false, isError: false };
    render(<ShowAboutPage />, { initialRoute: '/shows/show-1/about' });
    expect(screen.queryByText('No Wi-Fi set.')).toBeNull();
    expect(screen.queryByText(/club default withdrawal policy/)).toBeNull();
    expect(screen.getByText(/Wi-Fi is unavailable/)).toBeInTheDocument();
    expect(screen.getByText(/withdrawal policy is unavailable/)).toBeInTheDocument();
  });

  it.each(['setup-publish', 'setup-publish-premium', 'setup-publish-landing'])(
    'scrolls #%s into view on arrival',
    async anchor => {
      render(<ShowAboutPage />, { initialRoute: `/shows/show-1/about#${anchor}` });
      await waitFor(() => expect(Element.prototype.scrollIntoView).toHaveBeenCalled());
    }
  );

  it('does not scroll without a publish anchor', () => {
    render(<ShowAboutPage />, { initialRoute: '/shows/show-1/about' });
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
  });

  it('hides the Landing page card when the landing page switch is off, and keeps Premium (MYK9-1686)', () => {
    harness.outlet = {
      show: { ...show, usesLandingPage: false } as Show,
      canManageShow: true,
      judges: [],
      managerEntryCount: 12,
    };
    render(<ShowAboutPage />, { initialRoute: '/shows/show-1/about' });
    expect(screen.queryByTestId('landing-card')).toBeNull();
    expect(screen.getByTestId('premium-card')).toBeInTheDocument();
  });

  it('hides the Landing page card for a show that has never set the switch', () => {
    harness.outlet = {
      show: { ...show, usesLandingPage: undefined } as Show,
      canManageShow: true,
      judges: [],
      managerEntryCount: 12,
    };
    render(<ShowAboutPage />, { initialRoute: '/shows/show-1/about' });
    expect(screen.queryByTestId('landing-card')).toBeNull();
  });

  it('falls back to the premium card when a link targets the hidden landing card', async () => {
    harness.outlet = {
      show: { ...show, usesLandingPage: false } as Show,
      canManageShow: true,
      judges: [],
      managerEntryCount: 12,
    };
    render(<ShowAboutPage />, { initialRoute: '/shows/show-1/about#setup-publish-landing' });
    await waitFor(() => expect(Element.prototype.scrollIntoView).toHaveBeenCalled());
    expect(
      vi
        .mocked(Element.prototype.scrollIntoView)
        .mock.contexts.some(el => (el as Element).id === 'setup-publish-premium')
    ).toBe(true);
  });
});
