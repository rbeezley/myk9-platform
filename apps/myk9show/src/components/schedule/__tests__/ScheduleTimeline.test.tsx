import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import userEvent from '@testing-library/user-event';
import { ScheduleTimeline, SCHEDULE_TIMELINE_RESERVED_MIN_HEIGHT_PX } from '../ScheduleTimeline';
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
            levelRange: 'Novice–Master',
            status: CLASS_STATUS.COMPLETED,
            levels: [
              {
                classId: 'class-container-novice',
                level: 'Novice',
                status: CLASS_STATUS.COMPLETED,
                entryCount: 5,
                startTime: null,
              },
              {
                classId: 'class-container-master',
                level: 'Master',
                status: CLASS_STATUS.COMPLETED,
                entryCount: 3,
                startTime: null,
              },
            ],
            completedCount: 2,
            totalCount: 2,
          },
          {
            element: 'Buried',
            startTime: '09:30:00',
            levelRange: 'Novice–Master',
            status: CLASS_STATUS.IN_PROGRESS,
            levels: [
              {
                classId: 'class-buried-novice',
                level: 'Novice',
                status: CLASS_STATUS.IN_PROGRESS,
                entryCount: 4,
                startTime: null,
              },
            ],
            completedCount: 0,
            totalCount: 1,
          },
        ],
      },
    ],
  },
];

let mockIsLoading = false;
let mockReturnData: DayTimelineData[] | undefined = mockData;

vi.mock('@/hooks/queries/useScheduleTimeline', () => ({
  useScheduleTimeline: () => ({
    data: mockIsLoading ? undefined : mockReturnData,
    isLoading: mockIsLoading,
    error: null,
    refetch: vi.fn(),
  }),
}));

const renderWithRouter = render;

describe('ScheduleTimeline', () => {
  beforeEach(() => {
    mockIsLoading = false;
    mockReturnData = mockData;
  });

  it('reserves min-height in the loading skeleton to prevent CLS', () => {
    mockIsLoading = true;
    renderWithRouter(<ScheduleTimeline showId="show-1" />);
    const skeleton = screen.getByTestId('schedule-timeline-skeleton');
    expect(skeleton).toBeInTheDocument();
    expect((skeleton as HTMLElement).style.minHeight).toBe(
      `${SCHEDULE_TIMELINE_RESERVED_MIN_HEIGHT_PX}px`
    );
    expect(skeleton).toHaveAttribute('aria-busy', 'true');
  });

  it('does not render skeleton when data is loaded', () => {
    mockIsLoading = false;
    renderWithRouter(<ScheduleTimeline showId="show-1" />);
    expect(screen.queryByTestId('schedule-timeline-skeleton')).not.toBeInTheDocument();
    expect(screen.getByText('Schedule')).toBeInTheDocument();
  });

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

  it('labels element cards as links to the class, not the trial', () => {
    renderWithRouter(<ScheduleTimeline showId="show-1" />);
    const containerLink = screen.getByRole('link', { name: /open container novice/i });
    expect(containerLink).toBeInTheDocument();
    expect(containerLink).toHaveAttribute(
      'href',
      '/shows/show-1/trials/t1/classes/class-container-novice'
    );

    const buriedLink = screen.getByRole('link', { name: /open buried novice/i });
    expect(buriedLink).toHaveAttribute(
      'href',
      '/shows/show-1/trials/t1/classes/class-buried-novice'
    );
  });

  it('links the trial heading to the trial details page', () => {
    renderWithRouter(<ScheduleTimeline showId="show-1" />);
    const trialLink = screen.getByRole('link', { name: /trial 1/i });
    expect(trialLink).toHaveAttribute('href', '/shows/show-1/trials/t1');
  });

  it('shows the summed entry count on the element card', () => {
    renderWithRouter(<ScheduleTimeline showId="show-1" />);
    expect(screen.getByText(/8 entries/)).toBeInTheDocument();
    expect(screen.getByText(/4 entries/)).toBeInTheDocument();
  });

  it('renders status badges', () => {
    renderWithRouter(<ScheduleTimeline showId="show-1" />);
    // Shared grammar keeps the complete/in-progress labels consistent.
    expect(screen.getByText('Completed')).toBeInTheDocument();
    expect(screen.getByText('In Progress')).toBeInTheDocument();
  });

  it('renders level ranges', () => {
    renderWithRouter(<ScheduleTimeline showId="show-1" />);
    const levelTexts = screen.getAllByText(/Novice–Master/);
    expect(levelTexts.length).toBeGreaterThanOrEqual(2);
  });

  it('navigates to the class, not the trial, on element card click', async () => {
    const user = userEvent.setup();
    renderWithRouter(<ScheduleTimeline showId="show-1" />);
    const containerLink = screen.getByRole('link', { name: /open container novice/i });
    await user.click(containerLink);
    expect(containerLink).toHaveAttribute(
      'href',
      '/shows/show-1/trials/t1/classes/class-container-novice'
    );
  });
});
