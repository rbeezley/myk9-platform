import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ScheduleSummary } from '@/components/shows/overview/ScheduleSummary';

// Mock useScheduleSummary
let mockSchedule: Array<{
  date: string;
  disciplines: Array<{
    name: string;
    elements: string[];
    levels: string[];
    classNames: string[];
  }>;
}> | null = null;

vi.mock('@/hooks/queries/useScheduleSummary', () => ({
  useScheduleSummary: () => ({ data: mockSchedule }),
}));

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
      {
        date: '2026-03-21',
        disciplines: [
          { name: 'Agility', elements: ['Standard', 'JWW'], levels: ['Novice', 'Open'], classNames: [] },
        ],
      },
    ];
    render(<ScheduleSummary showId="show-1" />);
    expect(screen.getByText('Schedule')).toBeInTheDocument();
    expect(screen.getByText(/March 21/)).toBeInTheDocument();
    expect(screen.getByText('Agility')).toBeInTheDocument();
  });

  it('renders elements and levels for disciplines', () => {
    mockSchedule = [
      {
        date: '2026-03-21',
        disciplines: [
          { name: 'Agility', elements: ['Standard', 'JWW'], levels: ['Novice'], classNames: [] },
        ],
      },
    ];
    render(<ScheduleSummary showId="show-1" />);
    expect(screen.getByText(/Standard, JWW/)).toBeInTheDocument();
    expect(screen.getByText(/Novice/)).toBeInTheDocument();
  });

  it('formats level range when more than 2 levels', () => {
    mockSchedule = [
      {
        date: '2026-03-21',
        disciplines: [
          {
            name: 'Agility',
            elements: [],
            levels: ['Novice', 'Open', 'Excellent', 'Master'],
            classNames: [],
          },
        ],
      },
    ];
    render(<ScheduleSummary showId="show-1" />);
    expect(screen.getByText(/Novice–Master/)).toBeInTheDocument();
  });

  it('renders class names for Other discipline', () => {
    mockSchedule = [
      {
        date: '2026-03-21',
        disciplines: [
          { name: 'Other', elements: [], levels: [], classNames: ['FAST', 'T2B'] },
        ],
      },
    ];
    render(<ScheduleSummary showId="show-1" />);
    expect(screen.getByText('Other')).toBeInTheDocument();
    expect(screen.getByText('FAST, T2B')).toBeInTheDocument();
  });

  it('renders multiple days', () => {
    mockSchedule = [
      {
        date: '2026-03-21',
        disciplines: [{ name: 'Agility', elements: [], levels: ['Novice'], classNames: [] }],
      },
      {
        date: '2026-03-22',
        disciplines: [{ name: 'Obedience', elements: [], levels: ['Open'], classNames: [] }],
      },
    ];
    render(<ScheduleSummary showId="show-1" />);
    expect(screen.getByText(/March 21/)).toBeInTheDocument();
    expect(screen.getByText(/March 22/)).toBeInTheDocument();
    expect(screen.getByText('Agility')).toBeInTheDocument();
    expect(screen.getByText('Obedience')).toBeInTheDocument();
  });
});
