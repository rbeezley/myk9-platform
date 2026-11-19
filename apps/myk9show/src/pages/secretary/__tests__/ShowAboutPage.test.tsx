import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import type { Show } from '@/types/show-types';
import ShowAboutPage from '../ShowAboutPage';
import { useShowStore } from '@/store/showStore';

const harness = vi.hoisted(() => ({
  outlet: undefined as unknown,
  wifi: { data: undefined as unknown, isLoading: false, isError: false },
  policy: { data: undefined as unknown, isLoading: false, isError: false },
}));

vi.mock('@/components/shows/ShowDetails/showManagementOutlet', () => ({
  useShowManagementOutlet: () => harness.outlet,
}));
vi.mock('@/hooks/queries/useShowVenueWifi', () => ({ useShowVenueWifi: () => harness.wifi }));
vi.mock('@/features/payments/useEffectiveWithdrawalPolicy', () => ({
  useEffectiveWithdrawalPolicy: () => harness.policy,
}));
vi.mock('@/features/premium/OwnPremiumCard', () => ({
  OwnPremiumCard: () => <div id="setup-publish-premium" data-testid="own-premium-card" />,
}));
vi.mock('@/features/premium/PremiumDownloadCard', () => ({
  PremiumDownloadCard: () => <div id="setup-publish-premium" data-testid="premium-card" />,
}));
// The checklist has its own test (ShowAboutPage.premiumRequirements.test.tsx).
vi.mock('@/features/premium/usePremiumRequirements', () => ({
  usePremiumRequirements: () => ({ items: [], registry: 'AKC' }),
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
} as unknown as Show;

beforeEach(() => {
  harness.outlet = { show, canManageShow: true, judges: [], managerEntryCount: 12 };
  harness.wifi = {
    data: { venueWifiNetwork: 'ExpoGuest', venueWifiPassword: 'dogs1234' },
    isLoading: false,
    isError: false,
  };
  harness.policy = {
    data: {
      policy: null,
      text: 'Heartland refunds: full until December 1.\nAfter that, $5.00 is kept.',
      textSource: 'club',
      registryId: 'AKC',
    },
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
    // MYK9-1976: About prints the text exhibitors read, here the club's, line breaks kept.
    expect(screen.getByTestId('withdrawal-policy-text').textContent).toBe(
      'Heartland refunds: full until December 1.\nAfter that, $5.00 is kept.'
    );
    expect(screen.getByText(/The club’s text/)).toBeInTheDocument();
    expect(screen.getByText('Service fees are non-refundable.')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Entries and fees' })).toBeInTheDocument();
    expect(screen.getByTestId('officials')).toBeInTheDocument();
    expect(screen.getByTestId('judges')).toBeInTheDocument();
    expect(screen.getByTestId('share')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^edit show$/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /view as exhibitor/i })).toBeInTheDocument();
  });

  it('links managers to the Access codes panel on Show Desk, the Actions menu href', () => {
    render(<ShowAboutPage />, { initialRoute: '/shows/show-1/about' });
    const link = screen.getByRole('link', { name: /access codes/i });
    expect(link).toHaveAttribute('href', '/shows/show-1?tool=access-codes');
    expect(link).toHaveTextContent('Codes for judges and ringside phones');
    expect(screen.queryByRole('button', { name: /regenerate/i })).toBeNull();
  });

  it('hides the Access codes row when Judges score on devices is off', () => {
    harness.outlet = {
      show: { ...show, usesDeviceScoring: false },
      canManageShow: true,
      judges: [],
      managerEntryCount: 12,
    };
    render(<ShowAboutPage />, { initialRoute: '/shows/show-1/about' });
    expect(screen.queryByRole('link', { name: /access codes/i })).toBeNull();
  });

  it('shows no Access codes row to a non-manager', () => {
    harness.outlet = { show, canManageShow: false, judges: [], managerEntryCount: 12 };
    render(<ShowAboutPage />, { initialRoute: '/shows/show-1/about' });
    expect(screen.queryByRole('link', { name: /access codes/i })).toBeNull();
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

  it('says so when no Wi-Fi is set, and prints the default policy text when none is written', () => {
    harness.wifi = {
      data: { venueWifiNetwork: null, venueWifiPassword: null },
      isLoading: false,
      isError: false,
    };
    harness.policy = {
      data: {
        policy: null,
        text: 'Refund policy: contact the club.',
        textSource: 'default',
        registryId: 'AKC',
      },
      isLoading: false,
      isError: false,
    };
    render(<ShowAboutPage />, { initialRoute: '/shows/show-1/about' });
    expect(screen.getByText('No Wi-Fi set.')).toBeInTheDocument();
    expect(screen.getByText('Refund policy: contact the club.')).toBeInTheDocument();
    expect(screen.getByText(/The default text/)).toBeInTheDocument();
  });

  it('does not invent empty facts when the reads are paused with nothing cached', () => {
    harness.wifi = { data: undefined, isLoading: false, isError: false };
    harness.policy = { data: undefined, isLoading: false, isError: false };
    render(<ShowAboutPage />, { initialRoute: '/shows/show-1/about' });
    expect(screen.queryByText('No Wi-Fi set.')).toBeNull();
    expect(screen.queryByTestId('withdrawal-policy-text')).toBeNull();
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

  it('always shows the Landing page card: a show is published or not, with no switch (MYK9-2054)', () => {
    render(<ShowAboutPage />, { initialRoute: '/shows/show-1/about' });
    expect(screen.getByTestId('landing-card')).toBeInTheDocument();
    expect(screen.getByTestId('premium-card')).toBeInTheDocument();
  });

  it('scrolls to the landing card when a link targets it', async () => {
    render(<ShowAboutPage />, { initialRoute: '/shows/show-1/about#setup-publish-landing' });
    await waitFor(() => expect(Element.prototype.scrollIntoView).toHaveBeenCalled());
    expect(
      vi
        .mocked(Element.prototype.scrollIntoView)
        .mock.contexts.some(el => (el as Element).id === 'setup-publish-landing')
    ).toBe(true);
  });

  it('swaps the generated premium card for the own-premium card when the club publishes its own', () => {
    harness.outlet = {
      show: { ...show, publishesOwnPremium: true } as Show,
      canManageShow: true,
      judges: [],
      managerEntryCount: 12,
    };
    render(<ShowAboutPage />, { initialRoute: '/shows/show-1/about' });
    expect(screen.getByTestId('own-premium-card')).toBeInTheDocument();
    expect(screen.queryByTestId('premium-card')).toBeNull();
  });

  it('follows the own-premium switch flipped locally before the cached show catches up', () => {
    useShowStore.setState({ shows: [{ ...show, publishesOwnPremium: true } as Show] });
    try {
      render(<ShowAboutPage />, { initialRoute: '/shows/show-1/about' });
      expect(screen.getByTestId('own-premium-card')).toBeInTheDocument();
    } finally {
      useShowStore.setState({ shows: [] });
    }
  });
});
