import { describe, it, expect, vi } from 'vitest';
import { CLASS_STATUS } from '@myk9/core';
import { render, screen } from '@/test/utils/testUtils';
import { ElementCard } from '../ElementCard';
import type { ElementSummary } from '../schedule-timeline.types';

vi.mock('@/services/replication', () => ({
  replicatedClassesTable: { updateClass: vi.fn() },
}));

vi.mock('@/lib/queryClient', () => ({
  queryClient: { invalidateQueries: vi.fn() },
}));

const element: ElementSummary = {
  element: 'Container',
  startTime: '09:00:00',
  levelRange: 'Novice',
  status: CLASS_STATUS.SCHEDULED,
  levels: [
    {
      classId: 'class-1',
      level: 'Novice',
      status: CLASS_STATUS.SCHEDULED,
      entryCount: 5,
      startTime: '09:00:00',
    },
  ],
  completedCount: 0,
  totalCount: 1,
};

const baseProps = {
  element,
  href: '/shows/show-1/map/trials/trial-1/classes/class-1',
  ariaLabel: 'Open Container Novice',
  entryCount: 5,
  showId: 'show-1',
  trialId: 'trial-1',
};

describe('ElementCard schedule-editing gate', () => {
  it('renders read-only start time (no editor) when canEditSchedule is omitted', () => {
    render(<ElementCard {...baseProps} />);
    expect(screen.getByText(/9:00 AM/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /edit start time/i })).not.toBeInTheDocument();
  });

  it('renders read-only start time when canEditSchedule is false', () => {
    render(<ElementCard {...baseProps} canEditSchedule={false} />);
    expect(screen.queryByRole('button', { name: /edit start time/i })).not.toBeInTheDocument();
  });

  it('renders the inline editor when canEditSchedule is true', () => {
    render(<ElementCard {...baseProps} canEditSchedule />);
    expect(screen.getByRole('button', { name: /edit start time/i })).toBeInTheDocument();
  });

  it('lists each level time on read-only cards when levels start at different times', () => {
    const multiLevel: ElementSummary = {
      ...element,
      levelRange: 'Novice–Advanced',
      levels: [
        {
          classId: 'class-1',
          level: 'Novice',
          status: CLASS_STATUS.SCHEDULED,
          entryCount: 5,
          startTime: '09:00:00',
        },
        {
          classId: 'class-2',
          level: 'Advanced',
          status: CLASS_STATUS.SCHEDULED,
          entryCount: 3,
          startTime: '13:30:00',
        },
      ],
      totalCount: 2,
    };
    render(<ElementCard {...baseProps} element={multiLevel} entryCount={8} />);
    const list = screen.getByTestId('per-level-times');
    expect(list).toHaveTextContent('Novice: 9:00 AM');
    expect(list).toHaveTextContent('Advanced: 1:30 PM');
    // The aggregate earliest time is dropped in favor of the per-level list.
    expect(screen.queryByText(/^9:00 AM ·/)).not.toBeInTheDocument();
  });

  it('keeps the single aggregate time on read-only cards when all levels share it', () => {
    const sameTime: ElementSummary = {
      ...element,
      levels: [
        {
          classId: 'class-1',
          level: 'Novice',
          status: CLASS_STATUS.SCHEDULED,
          entryCount: 5,
          startTime: '09:00:00',
        },
        {
          classId: 'class-2',
          level: 'Advanced',
          status: CLASS_STATUS.SCHEDULED,
          entryCount: 3,
          startTime: '09:00:00',
        },
      ],
      totalCount: 2,
    };
    render(<ElementCard {...baseProps} element={sameTime} />);
    expect(screen.queryByTestId('per-level-times')).not.toBeInTheDocument();
    expect(screen.getByText(/9:00 AM/)).toBeInTheDocument();
  });
});
