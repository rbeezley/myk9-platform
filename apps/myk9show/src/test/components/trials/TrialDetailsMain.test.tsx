import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import TrialDetailsMain from '@/components/trials/TrialDetailsMain';
import { TrialStatisticsData } from '@/components/trials/TrialDetail/TrialStatistics';
import { Trial, TrialClass } from '@/components/trials/types/trial.types';
import { createTestQueryClient } from '@/test/utils/testUtils';

// Mock TrialTimeline to avoid Supabase/query dependencies
vi.mock('@/components/schedule', () => ({
  TrialTimeline: ({ trialId }: { trialId: string }) => (
    <div data-testid="trial-timeline">Timeline for {trialId}</div>
  ),
}));

// Mock TrialClassesTable to simplify rendering
vi.mock('@/components/trials/TrialDetail/TrialClassesTable', () => ({
  TrialClassesTable: () => <div data-testid="trial-classes-table">Classes Table</div>,
}));

// Mock navigation
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

let queryClient: QueryClient;

// Helper to wrap component with router and QueryClientProvider
const renderWithProviders = (ui: React.ReactElement) => {
  queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>{ui}</BrowserRouter>
    </QueryClientProvider>
  );
};

// Mock trial data
const mockTrial: Trial & { classes?: TrialClass[] } = {
  id: 'trial-1',
  showId: 'show-1',
  showName: 'Test Show',
  status: 'Upcoming',
  trialDate: '2024-06-15',
  trialNumber: 'T001',
  eventNumber: 'E001',
  plannedStartTime: '9:00 AM',
  order: '1',
  classes: [
    {
      id: 'class-1',
      element: 'Container',
      level: 'Novice',
      section: 'A',
      status: 'Upcoming',
      judgeId: 'judge-1',
      judgeName: 'John Smith',
      startTime: '2024-06-15T09:00:00',
      entries: 10,
    },
    {
      id: 'class-2',
      element: 'Interior',
      level: 'Novice',
      section: 'A',
      status: 'Completed',
      judgeId: 'judge-1',
      judgeName: 'John Smith',
      startTime: '2024-06-15T10:00:00',
      entries: 8,
    },
  ],
};

// Mock statistics with contextual data
const mockStatistics: TrialStatisticsData = {
  judges: { total: 2, active: 1, onBreak: 1, percentChange: 50 },
  classes: { total: 12, upcoming: 9, completed: 3, percentChange: 25 },
  entries: { total: 96, upcoming: 72, completed: 24, percentChange: 25 },
  qualifiedRate: { percent: 75, qualified: 18, total: 24, percentChange: 10 },
};

// Mock statistics with no completed classes
const mockStatisticsNoCompleted: TrialStatisticsData = {
  judges: { total: 2, active: 0, onBreak: 2, percentChange: 0 },
  classes: { total: 12, upcoming: 12, completed: 0, percentChange: 0 },
  entries: { total: 96, upcoming: 96, completed: 0, percentChange: 0 },
  qualifiedRate: { percent: 0, qualified: 0, total: 0, percentChange: 0 },
};

const mockHandlers = {
  onEditClass: vi.fn(),
  onDeleteClass: vi.fn(),
  onAddClassesFromTemplate: vi.fn(),
};

describe('TrialDetailsMain', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Statistics Cards - Contextual Subtitles', () => {
    it('displays contextual subtitle instead of percent change for judges', () => {
      renderWithProviders(
        <TrialDetailsMain trial={mockTrial} statistics={mockStatistics} {...mockHandlers} />
      );

      // Should show "1 active" instead of "+50%"
      expect(screen.getByText('1 active')).toBeInTheDocument();
      expect(screen.queryByText('+50%')).not.toBeInTheDocument();
    });

    it('shows progress text for classes card', () => {
      renderWithProviders(
        <TrialDetailsMain trial={mockTrial} statistics={mockStatistics} {...mockHandlers} />
      );

      // Should show "3 of 12 completed"
      expect(screen.getByText('3 of 12 completed')).toBeInTheDocument();
    });

    it('shows scored count for entries card', () => {
      renderWithProviders(
        <TrialDetailsMain trial={mockTrial} statistics={mockStatistics} {...mockHandlers} />
      );

      // Should show "24 scored"
      expect(screen.getByText('24 scored')).toBeInTheDocument();
    });

    it('hides Qualified Rate card when no completed classes', () => {
      renderWithProviders(
        <TrialDetailsMain
          trial={mockTrial}
          statistics={mockStatisticsNoCompleted}
          {...mockHandlers}
        />
      );

      // Should not show Qualified Rate card
      expect(screen.queryByText('Qualified Rate')).not.toBeInTheDocument();
    });

    it('shows Qualified Rate card when classes are completed', () => {
      renderWithProviders(
        <TrialDetailsMain trial={mockTrial} statistics={mockStatistics} {...mockHandlers} />
      );

      // Should show Qualified Rate
      expect(screen.getByText('Qualified Rate')).toBeInTheDocument();
      expect(screen.getByText('18 of 24 qualified')).toBeInTheDocument();
    });

    it('shows "None active" when no judges are active', () => {
      renderWithProviders(
        <TrialDetailsMain
          trial={mockTrial}
          statistics={mockStatisticsNoCompleted}
          {...mockHandlers}
        />
      );

      expect(screen.getByText('None active')).toBeInTheDocument();
    });
  });

  describe('Timeline Section', () => {
    it('renders the timeline heading', () => {
      renderWithProviders(
        <TrialDetailsMain trial={mockTrial} statistics={mockStatistics} {...mockHandlers} />
      );

      expect(screen.getByText('Timeline')).toBeInTheDocument();
    });

    it('renders the TrialTimeline component with correct trialId', () => {
      renderWithProviders(
        <TrialDetailsMain trial={mockTrial} statistics={mockStatistics} {...mockHandlers} />
      );

      expect(screen.getByTestId('trial-timeline')).toBeInTheDocument();
      expect(screen.getByText('Timeline for trial-1')).toBeInTheDocument();
    });
  });

  describe('Classes Section', () => {
    it('renders the classes heading', () => {
      renderWithProviders(
        <TrialDetailsMain trial={mockTrial} statistics={mockStatistics} {...mockHandlers} />
      );

      expect(screen.getByText('Classes')).toBeInTheDocument();
    });

    it('renders the TrialClassesTable component', () => {
      renderWithProviders(
        <TrialDetailsMain trial={mockTrial} statistics={mockStatistics} {...mockHandlers} />
      );

      expect(screen.getByTestId('trial-classes-table')).toBeInTheDocument();
    });
  });

  describe('Statistics Cards - Values', () => {
    it('displays correct stat values', () => {
      renderWithProviders(
        <TrialDetailsMain trial={mockTrial} statistics={mockStatistics} {...mockHandlers} />
      );

      // Judges total
      expect(screen.getByText('Judges')).toBeInTheDocument();
      // Classes total
      expect(screen.getByText('Total Classes')).toBeInTheDocument();
      // Entries total
      expect(screen.getByText('Total Entries')).toBeInTheDocument();
    });

    it('displays detail rows for each stat card', () => {
      renderWithProviders(
        <TrialDetailsMain trial={mockTrial} statistics={mockStatistics} {...mockHandlers} />
      );

      // Judges details
      expect(screen.getByText('Active: 1')).toBeInTheDocument();
      expect(screen.getByText('On Break: 1')).toBeInTheDocument();

      // Classes details
      expect(screen.getByText('Upcoming: 9')).toBeInTheDocument();
      expect(screen.getByText('Completed: 3')).toBeInTheDocument();

      // Entries details
      expect(screen.getByText('Upcoming: 72')).toBeInTheDocument();
      expect(screen.getByText('Completed: 24')).toBeInTheDocument();
    });

    it('displays qualified rate details when completed classes exist', () => {
      renderWithProviders(
        <TrialDetailsMain trial={mockTrial} statistics={mockStatistics} {...mockHandlers} />
      );

      expect(screen.getByText('Qualified: 18')).toBeInTheDocument();
      expect(screen.getByText('Total: 24')).toBeInTheDocument();
      expect(screen.getByText('75%')).toBeInTheDocument();
    });
  });
});
