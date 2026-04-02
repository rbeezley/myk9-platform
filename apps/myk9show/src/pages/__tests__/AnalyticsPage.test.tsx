import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import type { StatsEntry } from '@/components/analytics/analytics-utils';

// ── Mock data ──────────────────────────────────────────────────────────

const mockEntries: StatsEntry[] = [
  {
    id: 'e1',
    dogId: 'd1',
    dogCallName: 'Rex',
    showId: 's1',
    showName: 'Spring Trial',
    showDate: '2025-03-01',
    classId: 'c1',
    className: 'Tracking',
    classElement: 'TD',
    classLevel: 'Novice',
    resultText: 'Q',
    searchTimeSeconds: 120,
    totalFaults: 0,
    finalPlacement: 1,
    organization: 'AKC',
  },
  {
    id: 'e2',
    dogId: 'd1',
    dogCallName: 'Rex',
    showId: 's2',
    showName: 'Summer Trial',
    showDate: '2025-06-15',
    classId: 'c2',
    className: 'Tracking',
    classElement: 'TD',
    classLevel: 'Open',
    resultText: 'NQ',
    searchTimeSeconds: 200,
    totalFaults: 3,
    finalPlacement: null,
    organization: 'AKC',
  },
  {
    id: 'e3',
    dogId: 'd2',
    dogCallName: 'Luna',
    showId: 's1',
    showName: 'Spring Trial',
    showDate: '2025-03-01',
    classId: 'c3',
    className: 'Tracking',
    classElement: 'TDX',
    classLevel: 'Novice',
    resultText: 'Q',
    searchTimeSeconds: 95,
    totalFaults: 0,
    finalPlacement: 1,
    organization: 'UKC',
  },
];

// ── Mocks ──────────────────────────────────────────────────────────────

const mockUseMyLifetimeStats =
  vi.fn<() => { data: StatsEntry[] | undefined; isLoading: boolean }>();

vi.mock('@/hooks/queries/useMyLifetimeStats', () => ({
  useMyLifetimeStats: () => mockUseMyLifetimeStats(),
}));

const mockUseSubscriptionGate = vi.fn<
  (options?: { trialShowCount?: number }) => {
    tier: 'free' | 'premium';
    isPremium: boolean;
    isExpired: boolean;
    isInTrial: boolean;
    isLoading: boolean;
  }
>();

vi.mock('@/hooks/useSubscriptionGate', () => ({
  useSubscriptionGate: (options?: { trialShowCount?: number }) => mockUseSubscriptionGate(options),
  TRIAL_SHOW_LIMIT: 3,
}));

// Mock recharts to avoid rendering issues in jsdom
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="responsive-container">{children}</div>
  ),
  PieChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="pie-chart">{children}</div>
  ),
  Pie: () => null,
  Cell: () => null,
  AreaChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="area-chart">{children}</div>
  ),
  Area: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
}));

// ── Lazy import ────────────────────────────────────────────────────────

import AnalyticsPage from '../AnalyticsPage';

// ── Tests ──────────────────────────────────────────────────────────────

describe('AnalyticsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSubscriptionGate.mockReturnValue({
      tier: 'premium',
      isPremium: true,
      isExpired: false,
      isInTrial: false,
      isLoading: false,
    });
  });

  it('shows skeleton while loading', () => {
    mockUseMyLifetimeStats.mockReturnValue({ data: undefined, isLoading: true });

    render(<AnalyticsPage />, { initialRoute: '/analytics' });

    // StatsSummaryCardsSkeleton renders StatCardSkeleton components which have animate-pulse
    const skeletons = document.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('shows empty state when there are no entries', () => {
    mockUseMyLifetimeStats.mockReturnValue({ data: [], isLoading: false });

    render(<AnalyticsPage />, { initialRoute: '/analytics' });

    expect(screen.getByText('No Analytics Yet')).toBeInTheDocument();
    expect(
      screen.getByText('Enter shows and get scored to see your performance analytics here.')
    ).toBeInTheDocument();
  });

  it('renders summary cards and charts when data is available', () => {
    mockUseMyLifetimeStats.mockReturnValue({
      data: mockEntries,
      isLoading: false,
    });

    render(<AnalyticsPage />, { initialRoute: '/analytics' });

    // Summary cards should be rendered (check for stat labels)
    expect(screen.getByText('Entries')).toBeInTheDocument();
    expect(screen.getAllByText('Q Rate').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Best Time')).toBeInTheDocument();
    expect(screen.getByText('Avg Time')).toBeInTheDocument();

    // Dog names appear in breakdown cards and fastest times table
    expect(screen.getAllByText('Rex').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Luna').length).toBeGreaterThanOrEqual(1);
  });

  it('renders dog filter with available dogs', () => {
    mockUseMyLifetimeStats.mockReturnValue({
      data: mockEntries,
      isLoading: false,
    });

    render(<AnalyticsPage />, { initialRoute: '/analytics' });

    const dogFilter = screen.getByTestId('dog-filter');
    expect(dogFilter).toBeInTheDocument();
  });

  it('renders organization filter with available orgs', () => {
    mockUseMyLifetimeStats.mockReturnValue({
      data: mockEntries,
      isLoading: false,
    });

    render(<AnalyticsPage />, { initialRoute: '/analytics' });

    const orgFilter = screen.getByTestId('org-filter');
    expect(orgFilter).toBeInTheDocument();
  });

  it('does not show filters when there is no data', () => {
    mockUseMyLifetimeStats.mockReturnValue({ data: [], isLoading: false });

    render(<AnalyticsPage />, { initialRoute: '/analytics' });

    expect(screen.queryByTestId('dog-filter')).not.toBeInTheDocument();
    expect(screen.queryByTestId('org-filter')).not.toBeInTheDocument();
  });

  describe('premium gating', () => {
    it('shows all sections for premium subscribers', () => {
      mockUseMyLifetimeStats.mockReturnValue({ data: mockEntries, isLoading: false });
      mockUseSubscriptionGate.mockReturnValue({
        tier: 'premium',
        isPremium: true,
        isExpired: false,
        isInTrial: false,
        isLoading: false,
      });

      render(<AnalyticsPage />, { initialRoute: '/analytics' });

      // Free sections visible
      expect(screen.getByText('Entries')).toBeInTheDocument();

      // Gated sections visible (not locked)
      expect(screen.getAllByText('Rex').length).toBeGreaterThanOrEqual(1);
      expect(screen.queryByText('Upgrade Now')).not.toBeInTheDocument();
    });

    it('shows upgrade cards for free users past trial', () => {
      mockUseMyLifetimeStats.mockReturnValue({ data: mockEntries, isLoading: false });
      mockUseSubscriptionGate.mockReturnValue({
        tier: 'free',
        isPremium: false,
        isExpired: false,
        isInTrial: false,
        isLoading: false,
      });

      render(<AnalyticsPage />, { initialRoute: '/analytics' });

      // Free sections still visible
      expect(screen.getByText('Entries')).toBeInTheDocument();

      // Gated sections replaced with upgrade prompts
      const upgradeButtons = screen.getAllByText('Upgrade Now');
      expect(upgradeButtons.length).toBe(3);
    });

    it('shows all sections for trial users with trial banner', () => {
      mockUseMyLifetimeStats.mockReturnValue({ data: mockEntries, isLoading: false });
      mockUseSubscriptionGate.mockReturnValue({
        tier: 'premium',
        isPremium: true,
        isExpired: false,
        isInTrial: true,
        isLoading: false,
      });

      render(<AnalyticsPage />, { initialRoute: '/analytics' });

      // All sections visible
      expect(screen.getByText('Entries')).toBeInTheDocument();
      expect(screen.getAllByText('Rex').length).toBeGreaterThanOrEqual(1);
      expect(screen.queryByText('Upgrade Now')).not.toBeInTheDocument();

      // Trial banner visible
      expect(screen.getByText(/exploring Premium Analytics free/)).toBeInTheDocument();
      expect(screen.getByText('Learn more')).toBeInTheDocument();
    });

    it('does not show trial banner when there is no data', () => {
      mockUseMyLifetimeStats.mockReturnValue({ data: [], isLoading: false });
      mockUseSubscriptionGate.mockReturnValue({
        tier: 'premium',
        isPremium: true,
        isExpired: false,
        isInTrial: true,
        isLoading: false,
      });

      render(<AnalyticsPage />, { initialRoute: '/analytics' });

      expect(screen.getByText('No Analytics Yet')).toBeInTheDocument();
      expect(screen.queryByText(/exploring Premium Analytics free/)).not.toBeInTheDocument();
    });

    it('does not show trial banner for paid premium users', () => {
      mockUseMyLifetimeStats.mockReturnValue({ data: mockEntries, isLoading: false });
      mockUseSubscriptionGate.mockReturnValue({
        tier: 'premium',
        isPremium: true,
        isExpired: false,
        isInTrial: false,
        isLoading: false,
      });

      render(<AnalyticsPage />, { initialRoute: '/analytics' });

      expect(screen.queryByText(/exploring Premium Analytics free/)).not.toBeInTheDocument();
    });

    it('does not pass trialShowCount while entries are loading', () => {
      mockUseMyLifetimeStats.mockReturnValue({ data: undefined, isLoading: true });

      render(<AnalyticsPage />, { initialRoute: '/analytics' });

      expect(mockUseSubscriptionGate).toHaveBeenCalledWith(undefined);
    });

    it('passes trialShowCount after entries finish loading', () => {
      mockUseMyLifetimeStats.mockReturnValue({ data: mockEntries, isLoading: false });

      render(<AnalyticsPage />, { initialRoute: '/analytics' });

      expect(mockUseSubscriptionGate).toHaveBeenCalledWith({ trialShowCount: 2 });
    });
  });
});
