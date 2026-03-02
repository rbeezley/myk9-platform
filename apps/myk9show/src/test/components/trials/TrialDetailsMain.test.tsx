import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import TrialDetailsMain from '@/components/trials/TrialDetailsMain';
import { TrialStatisticsData } from '@/components/trials/TrialDetail/TrialStatistics';
import { Trial, TrialClass } from '@/components/trials/types/trial.types';

// Mock navigation
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// Helper to wrap component with router
const renderWithRouter = (ui: React.ReactElement) => {
  return render(<BrowserRouter>{ui}</BrowserRouter>);
};

// Mock trial data
const mockTrial: Trial & { classes?: TrialClass[] } = {
  id: 'trial-1',
  showId: 'show-1',
  organization: 'Scent Work',
  status: 'Upcoming',
  trialDate: '2024-06-15',
  trialNumber: 'T001',
  eventNumber: 'E001',
  plannedStartTime: '9:00 AM',
  order: 1,
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
  onEdit: vi.fn(),
  onDelete: vi.fn(),
  onAddClassesFromTemplate: vi.fn(),
  onEditClass: vi.fn(),
  onDeleteClass: vi.fn(),
  onPrevTrial: vi.fn(),
  onNextTrial: vi.fn(),
};

describe('TrialDetailsMain', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Statistics Cards - Contextual Subtitles', () => {
    it('displays contextual subtitle instead of percent change for judges', () => {
      renderWithRouter(
        <TrialDetailsMain trial={mockTrial} statistics={mockStatistics} {...mockHandlers} />
      );

      // Should show "1 active" instead of "+50%"
      expect(screen.getByText('1 active')).toBeInTheDocument();
      expect(screen.queryByText('+50%')).not.toBeInTheDocument();
    });

    it('shows progress text for classes card', () => {
      renderWithRouter(
        <TrialDetailsMain trial={mockTrial} statistics={mockStatistics} {...mockHandlers} />
      );

      // Should show "3 of 12 completed"
      expect(screen.getByText('3 of 12 completed')).toBeInTheDocument();
    });

    it('shows scored count for entries card', () => {
      renderWithRouter(
        <TrialDetailsMain trial={mockTrial} statistics={mockStatistics} {...mockHandlers} />
      );

      // Should show "24 scored"
      expect(screen.getByText('24 scored')).toBeInTheDocument();
    });

    it('hides Qualified Rate card when no completed classes', () => {
      renderWithRouter(
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
      renderWithRouter(
        <TrialDetailsMain trial={mockTrial} statistics={mockStatistics} {...mockHandlers} />
      );

      // Should show Qualified Rate
      expect(screen.getByText('Qualified Rate')).toBeInTheDocument();
      expect(screen.getByText('18 of 24 qualified')).toBeInTheDocument();
    });

    it('shows "None active" when no judges are active', () => {
      renderWithRouter(
        <TrialDetailsMain
          trial={mockTrial}
          statistics={mockStatisticsNoCompleted}
          {...mockHandlers}
        />
      );

      expect(screen.getByText('None active')).toBeInTheDocument();
    });
  });

  describe('Trial Info Card', () => {
    it('does not display Order field', () => {
      renderWithRouter(
        <TrialDetailsMain trial={mockTrial} statistics={mockStatistics} {...mockHandlers} />
      );

      // Should not show "Order" label
      const orderLabels = screen.queryAllByText('Order');
      expect(orderLabels.length).toBe(0);
    });

    it('displays Total Classes field instead of Order', () => {
      renderWithRouter(
        <TrialDetailsMain trial={mockTrial} statistics={mockStatistics} {...mockHandlers} />
      );

      // Should have Total Classes label in the info card
      const infoCard = document.querySelector('.myk9-show-info-card');
      const labels = infoCard?.querySelectorAll('.myk9-show-info-label') || [];
      const hasLabel = Array.from(labels).some(label => label.textContent === 'Total Classes');
      expect(hasLabel).toBe(true);
    });

    it('displays Trial Number and Event Number', () => {
      renderWithRouter(
        <TrialDetailsMain trial={mockTrial} statistics={mockStatistics} {...mockHandlers} />
      );

      expect(screen.getByText('Trial Number')).toBeInTheDocument();
      expect(screen.getByText('Event Number')).toBeInTheDocument();
    });
  });

  describe('Action Buttons', () => {
    it('displays Edit button visibly (not hidden in dropdown)', async () => {
      renderWithRouter(
        <TrialDetailsMain trial={mockTrial} statistics={mockStatistics} {...mockHandlers} />
      );

      // Find the visible edit button by its title
      const editButton = screen.getByTitle('Edit Trial');
      expect(editButton).toBeVisible();
    });

    it('calls onEdit when Edit button is clicked', async () => {
      const user = userEvent.setup();
      renderWithRouter(
        <TrialDetailsMain trial={mockTrial} statistics={mockStatistics} {...mockHandlers} />
      );

      const editButton = screen.getByTitle('Edit Trial');
      await user.click(editButton);

      expect(mockHandlers.onEdit).toHaveBeenCalledTimes(1);
    });

    it('keeps Delete in dropdown menu', () => {
      renderWithRouter(
        <TrialDetailsMain trial={mockTrial} statistics={mockStatistics} {...mockHandlers} />
      );

      // Delete should not be immediately visible (it's in the dropdown)
      expect(screen.queryByRole('menuitem', { name: /delete trial/i })).not.toBeInTheDocument();
    });

    it('has a dropdown menu trigger button', () => {
      renderWithRouter(
        <TrialDetailsMain trial={mockTrial} statistics={mockStatistics} {...mockHandlers} />
      );

      // The dropdown menu trigger should exist in the DOM
      // It's the button that contains the more-vertical icon
      const buttons = screen.getAllByRole('button');
      // There should be multiple buttons including the dropdown trigger
      expect(buttons.length).toBeGreaterThan(1);
    });
  });

  describe('Trial Navigation', () => {
    it('renders prev/next navigation buttons when multiple trials exist', () => {
      renderWithRouter(
        <TrialDetailsMain
          trial={mockTrial}
          statistics={mockStatistics}
          {...mockHandlers}
          prevTrialId="prev-123"
          nextTrialId="next-456"
          currentTrialIndex={1}
          totalTrials={3}
        />
      );

      expect(screen.getByTitle('Previous Trial')).toBeInTheDocument();
      expect(screen.getByTitle('Next Trial')).toBeInTheDocument();
      expect(screen.getByText('2 of 3')).toBeInTheDocument();
    });

    it('does not render navigation when only one trial', () => {
      renderWithRouter(
        <TrialDetailsMain
          trial={mockTrial}
          statistics={mockStatistics}
          {...mockHandlers}
          totalTrials={1}
        />
      );

      expect(screen.queryByTitle('Previous Trial')).not.toBeInTheDocument();
      expect(screen.queryByTitle('Next Trial')).not.toBeInTheDocument();
    });

    it('disables prev button when no previous trial', () => {
      renderWithRouter(
        <TrialDetailsMain
          trial={mockTrial}
          statistics={mockStatistics}
          {...mockHandlers}
          prevTrialId={null}
          nextTrialId="next-456"
          currentTrialIndex={0}
          totalTrials={3}
        />
      );

      const prevButton = screen.getByTitle('Previous Trial');
      expect(prevButton).toBeDisabled();
    });

    it('disables next button when no next trial', () => {
      renderWithRouter(
        <TrialDetailsMain
          trial={mockTrial}
          statistics={mockStatistics}
          {...mockHandlers}
          prevTrialId="prev-123"
          nextTrialId={null}
          currentTrialIndex={2}
          totalTrials={3}
        />
      );

      const nextButton = screen.getByTitle('Next Trial');
      expect(nextButton).toBeDisabled();
    });

    it('calls onPrevTrial when previous button is clicked', async () => {
      const user = userEvent.setup();
      renderWithRouter(
        <TrialDetailsMain
          trial={mockTrial}
          statistics={mockStatistics}
          {...mockHandlers}
          prevTrialId="prev-123"
          nextTrialId="next-456"
          currentTrialIndex={1}
          totalTrials={3}
        />
      );

      await user.click(screen.getByTitle('Previous Trial'));
      expect(mockHandlers.onPrevTrial).toHaveBeenCalledTimes(1);
    });

    it('calls onNextTrial when next button is clicked', async () => {
      const user = userEvent.setup();
      renderWithRouter(
        <TrialDetailsMain
          trial={mockTrial}
          statistics={mockStatistics}
          {...mockHandlers}
          prevTrialId="prev-123"
          nextTrialId="next-456"
          currentTrialIndex={1}
          totalTrials={3}
        />
      );

      await user.click(screen.getByTitle('Next Trial'));
      expect(mockHandlers.onNextTrial).toHaveBeenCalledTimes(1);
    });
  });

  describe('Status Badge', () => {
    it('renders status badge with correct class for Upcoming', () => {
      renderWithRouter(
        <TrialDetailsMain
          trial={{ ...mockTrial, status: 'Upcoming' }}
          statistics={mockStatistics}
          {...mockHandlers}
        />
      );

      // Use container query to find the status badge in the header
      const badge = document.querySelector('.myk9-show-info-header .myk9-show-status');
      expect(badge).toHaveClass('myk9-show-status-upcoming');
    });

    it('renders status badge with correct class for In Progress', () => {
      renderWithRouter(
        <TrialDetailsMain
          trial={{ ...mockTrial, status: 'In Progress' }}
          statistics={mockStatistics}
          {...mockHandlers}
        />
      );

      // Use container query to find the status badge in the header
      const badge = document.querySelector('.myk9-show-info-header .myk9-show-status');
      expect(badge).toHaveClass('myk9-show-status-in-progress');
    });
  });
});
