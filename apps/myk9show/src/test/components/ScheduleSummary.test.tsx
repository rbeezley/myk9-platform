import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { ScheduleSummary } from '@/components/shows/overview/ScheduleSummary';
import type { DayTimelineData } from '@/components/schedule/schedule-timeline.types';
import { CLASS_STATUS } from '@myk9/core';

let mockData: DayTimelineData[] | null = null;

vi.mock('@/hooks/queries/useScheduleTimeline', () => ({
  useScheduleTimeline: () => ({
    data: mockData,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

/** Helper to build a DayTimelineData with a single trial containing the given elements */
function dayWithElements(
  date: string,
  trialNumber: string | null,
  elements: DayTimelineData['trials'][number]['elements']
): DayTimelineData {
  return {
    date,
    trials: [
      {
        trialId: `trial-${date}-${trialNumber ?? '0'}`,
        trialNumber,
        plannedStartTime: null,
        elements,
      },
    ],
  };
}

function renderWithRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe('ScheduleSummary', () => {
  it('renders empty state when no schedule data', () => {
    mockData = null;
    renderWithRouter(<ScheduleSummary showId="show-1" />);
    expect(screen.getByText('No schedule available')).toBeInTheDocument();
  });

  it('renders empty state when schedule is empty', () => {
    mockData = [];
    renderWithRouter(<ScheduleSummary showId="show-1" />);
    expect(screen.getByText('No schedule available')).toBeInTheDocument();
  });

  it('renders day dates and element names', () => {
    mockData = [
      dayWithElements('2026-03-21', null, [
        {
          element: 'Standard',
          startTime: null,
          levelRange: 'Novice–Open',
          status: CLASS_STATUS.SCHEDULED,
          levels: [],
          completedCount: 0,
          totalCount: 0,
        },
        {
          element: 'JWW',
          startTime: null,
          levelRange: 'Novice–Open',
          status: CLASS_STATUS.SCHEDULED,
          levels: [],
          completedCount: 0,
          totalCount: 0,
        },
      ]),
    ];
    renderWithRouter(<ScheduleSummary showId="show-1" />);
    expect(screen.getByText('Schedule')).toBeInTheDocument();
    expect(screen.getByText(/March 21, 2026/)).toBeInTheDocument();
    expect(screen.getByText('Standard')).toBeInTheDocument();
    expect(screen.getByText('JWW')).toBeInTheDocument();
  });

  it('renders level ranges on element cards', () => {
    mockData = [
      dayWithElements('2026-03-21', null, [
        {
          element: 'Standard',
          startTime: null,
          levelRange: 'Novice',
          status: CLASS_STATUS.SCHEDULED,
          levels: [],
          completedCount: 0,
          totalCount: 0,
        },
      ]),
    ];
    renderWithRouter(<ScheduleSummary showId="show-1" />);
    expect(screen.getByText(/Novice/)).toBeInTheDocument();
  });

  it('renders abbreviated level range for multiple levels', () => {
    mockData = [
      dayWithElements('2026-03-21', null, [
        {
          element: 'Standard',
          startTime: null,
          levelRange: 'Novice–Master',
          status: CLASS_STATUS.SCHEDULED,
          levels: [],
          completedCount: 0,
          totalCount: 0,
        },
      ]),
    ];
    renderWithRouter(<ScheduleSummary showId="show-1" />);
    expect(screen.getByText(/Novice–Master/)).toBeInTheDocument();
  });

  it('renders element names for non-discipline classes', () => {
    mockData = [
      dayWithElements('2026-03-21', null, [
        {
          element: 'FAST',
          startTime: null,
          levelRange: '',
          status: CLASS_STATUS.SCHEDULED,
          levels: [],
          completedCount: 0,
          totalCount: 0,
        },
        {
          element: 'T2B',
          startTime: null,
          levelRange: '',
          status: CLASS_STATUS.SCHEDULED,
          levels: [],
          completedCount: 0,
          totalCount: 0,
        },
      ]),
    ];
    renderWithRouter(<ScheduleSummary showId="show-1" />);
    expect(screen.getByText('FAST')).toBeInTheDocument();
    expect(screen.getByText('T2B')).toBeInTheDocument();
  });

  it('renders multiple days', () => {
    mockData = [
      dayWithElements('2026-03-21', null, [
        {
          element: 'Standard',
          startTime: null,
          levelRange: 'Novice',
          status: CLASS_STATUS.SCHEDULED,
          levels: [],
          completedCount: 0,
          totalCount: 0,
        },
      ]),
      dayWithElements('2026-03-22', null, [
        {
          element: 'Container',
          startTime: null,
          levelRange: 'Open',
          status: CLASS_STATUS.SCHEDULED,
          levels: [],
          completedCount: 0,
          totalCount: 0,
        },
      ]),
    ];
    renderWithRouter(<ScheduleSummary showId="show-1" />);
    expect(screen.getByText(/March 21, 2026/)).toBeInTheDocument();
    expect(screen.getByText(/March 22, 2026/)).toBeInTheDocument();
    expect(screen.getByText('Standard')).toBeInTheDocument();
    expect(screen.getByText('Container')).toBeInTheDocument();
  });

  it('renders trial numbers when present', () => {
    mockData = [
      {
        date: '2026-03-21',
        trials: [
          {
            trialId: 'trial-1',
            trialNumber: '1',
            plannedStartTime: null,
            elements: [
              {
                element: 'Container',
                startTime: null,
                levelRange: 'Novice–Master',
                status: CLASS_STATUS.SCHEDULED,
                levels: [],
                completedCount: 0,
                totalCount: 0,
              },
            ],
          },
          {
            trialId: 'trial-2',
            trialNumber: '2',
            plannedStartTime: null,
            elements: [
              {
                element: 'Container',
                startTime: null,
                levelRange: 'Adv',
                status: CLASS_STATUS.SCHEDULED,
                levels: [],
                completedCount: 0,
                totalCount: 0,
              },
            ],
          },
        ],
      },
    ];
    renderWithRouter(<ScheduleSummary showId="show-1" />);
    expect(screen.getByText(/Trial 1/)).toBeInTheDocument();
    expect(screen.getByText(/Trial 2/)).toBeInTheDocument();
  });
});
