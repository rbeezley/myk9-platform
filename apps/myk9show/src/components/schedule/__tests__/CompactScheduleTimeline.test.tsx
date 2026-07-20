import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen } from '@/test/utils/testUtils';
import { CLASS_STATUS } from '@myk9/core';
import { CompactScheduleTimeline } from '../CompactScheduleTimeline';
import type { DayTimelineData } from '../schedule-timeline.types';

const mockData: DayTimelineData[] = [
  {
    date: '2026-08-01',
    trials: [
      {
        trialId: 'trial-1',
        trialNumber: '1',
        plannedStartTime: '08:00:00',
        elements: [
          {
            element: 'Container',
            startTime: '08:00:00',
            levelRange: 'Novice',
            status: CLASS_STATUS.SCHEDULED,
            completedCount: 0,
            totalCount: 1,
            levels: [
              {
                classId: 'class-1',
                className: 'Container Novice',
                level: 'Novice',
                status: CLASS_STATUS.SCHEDULED,
                entryCount: 8,
                startTime: '08:00:00',
                judgeId: 'judge-1',
                judgeName: 'Patel',
              },
            ],
          },
        ],
      },
      {
        trialId: 'trial-2',
        trialNumber: '2',
        plannedStartTime: '13:00:00',
        elements: [
          {
            element: 'Buried',
            startTime: '13:00:00',
            levelRange: 'Advanced',
            status: CLASS_STATUS.IN_PROGRESS,
            completedCount: 0,
            totalCount: 1,
            levels: [
              {
                classId: 'class-2',
                className: 'Buried Advanced',
                level: 'Advanced',
                status: CLASS_STATUS.IN_PROGRESS,
                entryCount: 4,
                startTime: '13:00:00',
                judgeId: 'judge-2',
                judgeName: 'Lee',
              },
            ],
          },
        ],
      },
    ],
  },
];

let mockIsLoading = false;
let mockError: Error | null = null;
let mockReturnData: DayTimelineData[] | undefined = mockData;
const mockRefetch = vi.fn();

vi.mock('@/hooks/queries/useScheduleTimeline', () => ({
  useScheduleTimeline: () => ({
    data: mockIsLoading ? undefined : mockReturnData,
    isLoading: mockIsLoading,
    error: mockError,
    refetch: mockRefetch,
  }),
}));

describe('CompactScheduleTimeline', () => {
  beforeEach(() => {
    mockIsLoading = false;
    mockError = null;
    mockReturnData = mockData;
    mockRefetch.mockReset();
  });

  it('groups multiple trials by date and trial number', () => {
    render(<CompactScheduleTimeline showId="show-1" />);

    expect(screen.getByText('Trial 1')).toBeInTheDocument();
    expect(screen.getByText('Trial 2')).toBeInTheDocument();
    expect(screen.getAllByText(/Saturday, August 1, 2026/)).toHaveLength(2);
    expect(screen.getByText('Container Novice')).toBeInTheDocument();
    expect(screen.queryByText('Buried Advanced')).not.toBeInTheDocument();
  });

  it('expands a collapsed trial without changing another trial', async () => {
    const user = userEvent.setup();
    render(<CompactScheduleTimeline showId="show-1" />);

    await user.click(screen.getByRole('button', { name: /expand trial 2/i }));

    expect(screen.getByText('Container Novice')).toBeInTheDocument();
    expect(screen.getByText('Buried Advanced')).toBeInTheDocument();
  });

  it('links to the complete Classes view and class/trial details', () => {
    render(<CompactScheduleTimeline showId="show-1" />);

    expect(screen.getByRole('link', { name: /view all classes/i })).toHaveAttribute(
      'href',
      '/shows/show-1?tab=classes'
    );
    expect(screen.getByRole('link', { name: /open container novice/i })).toHaveAttribute(
      'href',
      '/shows/show-1/trials/trial-1/classes/class-1'
    );
    expect(screen.getByRole('link', { name: /view trial details/i })).toHaveAttribute(
      'href',
      '/shows/show-1/trials/trial-1'
    );
  });

  it('shows manager start-time editors only when enabled', () => {
    const { rerender } = render(<CompactScheduleTimeline showId="show-1" canEditSchedule />);
    expect(screen.getByRole('button', { name: /edit start time for start/i })).toBeInTheDocument();

    rerender(<CompactScheduleTimeline showId="show-1" />);
    expect(screen.queryByRole('button', { name: /edit start time/i })).not.toBeInTheDocument();
  });

  it('keeps loading, error, and empty states honest', () => {
    mockIsLoading = true;
    const { rerender } = render(<CompactScheduleTimeline showId="show-1" />);
    expect(screen.getByTestId('compact-schedule-skeleton')).toBeInTheDocument();

    mockIsLoading = false;
    mockError = new Error('offline');
    rerender(<CompactScheduleTimeline showId="show-1" />);
    expect(screen.getByText(/couldn’t load the schedule/i)).toBeInTheDocument();

    mockError = null;
    mockReturnData = [];
    rerender(<CompactScheduleTimeline showId="show-1" />);
    expect(screen.getByText(/no schedule is available yet/i)).toBeInTheDocument();
  });
});
