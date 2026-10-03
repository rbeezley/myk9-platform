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
        trialName: 'Trial 1',
        trialNumber: 'Trial 1',
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
        trialName: 'Trial 2',
        trialNumber: 'Trial 2',
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

  it('reads Not set, muted, for a class with no judge and no start time (MYK9-930)', () => {
    const day = mockData[0] as DayTimelineData;
    const trial = day.trials[0]!;
    const element = trial.elements[0]!;
    mockReturnData = [
      {
        ...day,
        trials: [
          {
            ...trial,
            elements: [
              { ...element, levels: [{ ...element.levels[0]!, judgeName: '', startTime: null }] },
            ],
          },
        ],
      },
    ];
    render(<CompactScheduleTimeline showId="show-1" />);

    const notSet = screen.getAllByText('Not set');
    expect(notSet.length).toBeGreaterThanOrEqual(2);
    for (const el of notSet) expect(el).toHaveClass('text-muted-foreground');
    expect(screen.queryByText(/TBD/)).not.toBeInTheDocument();
  });

  it('shows manager start-time editors only when enabled', () => {
    const { rerender } = render(<CompactScheduleTimeline showId="show-1" canEditSchedule />);
    expect(screen.getByRole('button', { name: /edit start time for start/i })).toBeInTheDocument();

    rerender(<CompactScheduleTimeline showId="show-1" />);
    expect(screen.queryByRole('button', { name: /edit start time/i })).not.toBeInTheDocument();
  });

  describe('as a launcher for managers (MYK9-942)', () => {
    function trialWithClasses(count: number): DayTimelineData[] {
      const day = mockData[0] as DayTimelineData;
      const trial = day.trials[0]!;
      const element = trial.elements[0]!;
      const template = element.levels[0]!;
      const levels = Array.from({ length: count }, (_, index) => ({
        ...template,
        classId: `class-${index + 1}`,
        className: `Container Class ${index + 1}`,
        entryCount: 2,
      }));
      return [{ ...day, trials: [{ ...trial, elements: [{ ...element, levels }] }] }];
    }

    it('links Add Trial and all classes to the setup flows, never the legacy ?tab=classes', () => {
      render(<CompactScheduleTimeline showId="show-1" canEditSchedule />);

      expect(screen.getByRole('link', { name: 'Add Trial' })).toHaveAttribute(
        'href',
        '/secretary/create-show/wizard?showId=show-1&mode=add-trials'
      );
      expect(screen.getByRole('link', { name: /view all classes/i })).toHaveAttribute(
        'href',
        '/shows/show-1?select=classes'
      );
      for (const link of screen.getAllByRole('link')) {
        expect(link.getAttribute('href')).not.toContain('tab=classes');
      }
    });

    it("links each trial to adding classes and to that trial's class management", () => {
      render(<CompactScheduleTimeline showId="show-1" canEditSchedule />);

      expect(screen.getByRole('link', { name: /add classes to trial 1/i })).toHaveAttribute(
        'href',
        '/secretary/create-show/wizard?showId=show-1&mode=add-classes&trialId=trial-1'
      );
      expect(screen.getByRole('link', { name: /manage classes in trial 1/i })).toHaveAttribute(
        'href',
        '/shows/show-1?select=classes&trialId=trial-1'
      );
    });

    it('lists every class in a trial with no overflow link', () => {
      mockReturnData = trialWithClasses(8);
      render(<CompactScheduleTimeline showId="show-1" canEditSchedule />);

      expect(screen.getByText('Container Class 8')).toBeInTheDocument();
      expect(screen.queryByText(/more classes/i)).not.toBeInTheDocument();
    });

    it("shows the trial's total entries next to its class count", () => {
      mockReturnData = trialWithClasses(3);
      render(<CompactScheduleTimeline showId="show-1" canEditSchedule />);

      expect(screen.getByText('3 classes · 6 entries')).toBeInTheDocument();
    });

    it('offers Add Trial on an empty schedule and Add Classes on a trial with none', () => {
      mockReturnData = [];
      const { rerender } = render(<CompactScheduleTimeline showId="show-1" canEditSchedule />);
      expect(screen.getByRole('link', { name: 'Add Trial' })).toBeInTheDocument();

      mockReturnData = trialWithClasses(0);
      rerender(<CompactScheduleTimeline showId="show-1" canEditSchedule />);
      expect(screen.getByText('No classes scheduled.')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /add classes to trial 1/i })).toBeInTheDocument();
    });

    it('leaves the exhibitor view unchanged: capped list, no launcher links or entry totals', () => {
      mockReturnData = trialWithClasses(8);
      render(<CompactScheduleTimeline showId="show-1" />);

      expect(screen.queryByText('Container Class 7')).not.toBeInTheDocument();
      expect(screen.getByRole('link', { name: /view 2 more classes/i })).toHaveAttribute(
        'href',
        '/shows/show-1?tab=classes'
      );
      expect(screen.getByText('8 classes')).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Add Trial' })).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: /add classes to/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: /manage classes in/i })).not.toBeInTheDocument();
    });
  });

  describe('entry breakdown for managers (MYK9-943)', () => {
    const breakdowns = new Map([['class-1', { entered: 6, pending: 2 }]]);

    it('shows entered and a pending link to that class review, instead of the raw entry count', () => {
      render(
        <CompactScheduleTimeline
          showId="show-1"
          canEditSchedule
          entryBreakdownByClassId={breakdowns}
        />
      );

      expect(screen.getByText('6 entered')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: '2 pending in Container Novice' })).toHaveAttribute(
        'href',
        '/shows/show-1/entries?mode=review&attention=pending&trial=trial-1&class=class-1'
      );
      expect(screen.queryByText('8 entries')).not.toBeInTheDocument();
      expect(screen.getByText('1 class · 8 entries')).toBeInTheDocument();
    });

    it('reads a class with no entries as 0 entered, with no pending link', () => {
      render(
        <CompactScheduleTimeline
          showId="show-1"
          canEditSchedule
          entryBreakdownByClassId={new Map()}
        />
      );

      expect(screen.getByText('0 entered')).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: /pending in/ })).not.toBeInTheDocument();
    });

    it('keeps the plain entry count when no breakdown is available (visitor, or entries still loading)', () => {
      render(<CompactScheduleTimeline showId="show-1" canEditSchedule />);

      expect(screen.getByText('8 entries')).toBeInTheDocument();
      expect(screen.queryByText(/entered$/)).not.toBeInTheDocument();
    });
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
