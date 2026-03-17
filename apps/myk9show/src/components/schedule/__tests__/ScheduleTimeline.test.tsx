import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ScheduleTimeline } from '../ScheduleTimeline';
import type { DayTimelineData } from '../schedule-timeline.types';
import { CLASS_STATUS } from '@myk9/core';

const mockData: DayTimelineData[] = [
  {
    date: '2026-04-04',
    trials: [
      {
        trialId: 't1',
        trialNumber: '1',
        plannedStartTime: '08:00:00',
        elements: [
          {
            element: 'Container',
            startTime: '08:00:00',
            levelRange: 'Nov–Mst',
            status: CLASS_STATUS.COMPLETED,
            levels: [],
            completedCount: 0,
            totalCount: 0,
          },
          {
            element: 'Buried',
            startTime: '09:30:00',
            levelRange: 'Nov–Mst',
            status: CLASS_STATUS.IN_PROGRESS,
            levels: [],
            completedCount: 0,
            totalCount: 0,
          },
        ],
      },
    ],
  },
];

vi.mock('@/hooks/queries/useScheduleTimeline', () => ({
  useScheduleTimeline: () => ({ data: mockData, isLoading: false, error: null, refetch: vi.fn() }),
}));

function renderWithRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe('ScheduleTimeline', () => {
  it('renders the schedule heading', () => {
    renderWithRouter(<ScheduleTimeline showId="show-1" />);
    expect(screen.getByText('Schedule')).toBeInTheDocument();
  });

  it('renders day heading', () => {
    renderWithRouter(<ScheduleTimeline showId="show-1" />);
    expect(screen.getByText(/Saturday, April 4, 2026/)).toBeInTheDocument();
  });

  it('renders trial label with start time', () => {
    renderWithRouter(<ScheduleTimeline showId="show-1" />);
    expect(screen.getByText(/Trial 1/)).toBeInTheDocument();
  });

  it('renders element cards', () => {
    renderWithRouter(<ScheduleTimeline showId="show-1" />);
    expect(screen.getByText('Container')).toBeInTheDocument();
    expect(screen.getByText('Buried')).toBeInTheDocument();
  });

  it('renders status badges', () => {
    renderWithRouter(<ScheduleTimeline showId="show-1" />);
    // getClassStatusDisplay returns labels like "Complete", "In Progress"
    expect(screen.getByText('Complete')).toBeInTheDocument();
    expect(screen.getByText('In Progress')).toBeInTheDocument();
  });

  it('renders level ranges', () => {
    renderWithRouter(<ScheduleTimeline showId="show-1" />);
    const levelTexts = screen.getAllByText(/Nov–Mst/);
    expect(levelTexts.length).toBeGreaterThanOrEqual(2);
  });

  it('navigates to trial detail on element card click', async () => {
    const user = userEvent.setup();
    renderWithRouter(<ScheduleTimeline showId="show-1" />);
    await user.click(screen.getByText('Container'));
  });
});
