import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ScheduleSummary } from '@/components/shows/overview/ScheduleSummary';
import type { DaySummary } from '@/utils/schedule-summary';

// Mock useScheduleSummary
let mockSchedule: DaySummary[] | null = null;

vi.mock('@/hooks/queries/useScheduleSummary', () => ({
  useScheduleSummary: () => ({ data: mockSchedule }),
}));

/** Helper to build a DaySummary with a single trial */
function dayWithTrial(
  date: string,
  trialNumber: string | null,
  disciplines: DaySummary['disciplines']
): DaySummary {
  return {
    date,
    trials: [{ trialNumber, disciplines }],
    disciplines,
  };
}

describe('ScheduleSummary', () => {
  it('returns null when no schedule data', () => {
    mockSchedule = null;
    const { container } = render(<ScheduleSummary showId="show-1" />);
    expect(container.firstElementChild).toBeNull();
  });

  it('returns null when schedule is empty', () => {
    mockSchedule = [];
    const { container } = render(<ScheduleSummary showId="show-1" />);
    expect(container.firstElementChild).toBeNull();
  });

  it('renders day dates and discipline names', () => {
    mockSchedule = [
      dayWithTrial('2026-03-21', null, [
        {
          name: 'Agility',
          elements: ['Standard', 'JWW'],
          levels: ['Novice', 'Open'],
          classNames: [],
        },
      ]),
    ];
    render(<ScheduleSummary showId="show-1" />);
    expect(screen.getByText('Schedule')).toBeInTheDocument();
    expect(screen.getByText(/March 21/)).toBeInTheDocument();
    expect(screen.getByText('Agility')).toBeInTheDocument();
  });

  it('renders elements and levels in parentheses', () => {
    mockSchedule = [
      dayWithTrial('2026-03-21', null, [
        {
          name: 'Agility',
          elements: ['Standard', 'JWW'],
          levels: ['Novice'],
          classNames: [],
        },
      ]),
    ];
    render(<ScheduleSummary showId="show-1" />);
    expect(screen.getByText(/Standard, JWW/)).toBeInTheDocument();
    expect(screen.getByText(/Novice/)).toBeInTheDocument();
  });

  it('formats level range when more than 2 levels', () => {
    mockSchedule = [
      dayWithTrial('2026-03-21', null, [
        {
          name: 'Agility',
          elements: [],
          levels: ['Novice', 'Open', 'Excellent', 'Master'],
          classNames: [],
        },
      ]),
    ];
    render(<ScheduleSummary showId="show-1" />);
    expect(screen.getByText(/Novice–Master/)).toBeInTheDocument();
  });

  it('renders class names for Other discipline', () => {
    mockSchedule = [
      dayWithTrial('2026-03-21', null, [
        { name: 'Other', elements: [], levels: [], classNames: ['FAST', 'T2B'] },
      ]),
    ];
    render(<ScheduleSummary showId="show-1" />);
    expect(screen.getByText('Other')).toBeInTheDocument();
    expect(screen.getByText('FAST, T2B')).toBeInTheDocument();
  });

  it('renders multiple days', () => {
    mockSchedule = [
      dayWithTrial('2026-03-21', null, [
        { name: 'Agility', elements: [], levels: ['Novice'], classNames: [] },
      ]),
      dayWithTrial('2026-03-22', null, [
        { name: 'Obedience', elements: [], levels: ['Open'], classNames: [] },
      ]),
    ];
    render(<ScheduleSummary showId="show-1" />);
    expect(screen.getByText(/March 21/)).toBeInTheDocument();
    expect(screen.getByText(/March 22/)).toBeInTheDocument();
    expect(screen.getByText('Agility')).toBeInTheDocument();
    expect(screen.getByText('Obedience')).toBeInTheDocument();
  });

  it('renders trial numbers when present', () => {
    mockSchedule = [
      {
        date: '2026-03-21',
        trials: [
          {
            trialNumber: '1',
            disciplines: [
              { name: 'Container', elements: [], levels: ['Novice', 'Master'], classNames: [] },
            ],
          },
          {
            trialNumber: '2',
            disciplines: [
              { name: 'Container', elements: [], levels: ['Advanced'], classNames: [] },
            ],
          },
        ],
        disciplines: [
          {
            name: 'Container',
            elements: [],
            levels: ['Novice', 'Advanced', 'Master'],
            classNames: [],
          },
        ],
      },
    ];
    render(<ScheduleSummary showId="show-1" />);
    expect(screen.getByText('Trial 1')).toBeInTheDocument();
    expect(screen.getByText('Trial 2')).toBeInTheDocument();
  });
});
