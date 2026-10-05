import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { JudgeCapacityOverview } from '../JudgeCapacityOverview';
import type { JudgeDayCapacity } from '@/types/waitlist-types';

const judgeDays: JudgeDayCapacity[] = [
  {
    judgeId: 'j1',
    judgeName: 'Jane Doe',
    showDate: '2026-05-01',
    capacity: 125,
    confirmedCount: 100,
    waitlistCount: 8,
    mailInReserved: 10,
    availableSpots: 15,
    classIds: ['c1', 'c2'],
    classNames: ['Novice A', 'Open B'],
  },
  {
    judgeId: 'j2',
    judgeName: 'John Smith',
    showDate: '2026-05-01',
    capacity: 125,
    confirmedCount: 125,
    waitlistCount: 12,
    mailInReserved: 0,
    availableSpots: 0,
    classIds: ['c3'],
    classNames: ['Excellent A'],
  },
];

describe('JudgeCapacityOverview', () => {
  it('renders a card per judge-day', () => {
    render(<JudgeCapacityOverview judgeDays={judgeDays} onViewWaitList={vi.fn()} />);
    expect(screen.getByText('Jane Doe')).toBeInTheDocument();
    expect(screen.getByText('John Smith')).toBeInTheDocument();
  });

  it('shows entry counts for Jane Doe', () => {
    render(<JudgeCapacityOverview judgeDays={judgeDays} onViewWaitList={vi.fn()} />);
    expect(screen.getByText('100 / 125 entries')).toBeInTheDocument();
  });

  it('shows wait list badge for John Smith who is full', () => {
    render(<JudgeCapacityOverview judgeDays={judgeDays} onViewWaitList={vi.fn()} />);
    expect(screen.getByText('12 on wait list')).toBeInTheDocument();
  });

  it('shows Full badge when availableSpots is 0', () => {
    render(<JudgeCapacityOverview judgeDays={judgeDays} onViewWaitList={vi.fn()} />);
    expect(screen.getByText('Full')).toBeInTheDocument();
  });

  it('shows mail-in reserved text when mailInReserved > 0', () => {
    render(<JudgeCapacityOverview judgeDays={judgeDays} onViewWaitList={vi.fn()} />);
    expect(screen.getByText('10 mail-in reserved')).toBeInTheDocument();
  });

  it('calls onViewWaitList with correct judgeId and showDate', async () => {
    const user = userEvent.setup();
    const onViewWaitList = vi.fn();
    render(<JudgeCapacityOverview judgeDays={judgeDays} onViewWaitList={onViewWaitList} />);

    const buttons = screen.getAllByRole('button', { name: 'View Wait List' });
    await user.click(buttons[0]);

    expect(onViewWaitList).toHaveBeenCalledWith('j1', '2026-05-01');
  });

  it('renders empty state when no judge days', () => {
    render(<JudgeCapacityOverview judgeDays={[]} onViewWaitList={vi.fn()} />);
    expect(screen.getByText(/no judge-day assignments/i)).toBeInTheDocument();
  });
});

describe('JudgeCapacityOverview over-limit (MYK9-1006)', () => {
  const base: JudgeDayCapacity = {
    judgeId: 'j9',
    judgeName: 'Over Judge',
    showDate: '2026-05-01',
    capacity: 2,
    confirmedCount: 3,
    waitlistCount: 0,
    mailInReserved: 0,
    availableSpots: 0,
    classIds: ['c9'],
    classNames: ['Open'],
  };

  it('says how far over the limit a day is and explains it, not just "0 spots available"', () => {
    render(<JudgeCapacityOverview judgeDays={[base]} onViewWaitList={vi.fn()} />);
    expect(screen.getByText('1 over the limit')).toBeInTheDocument();
    expect(screen.getByText(/limit was lowered/i)).toBeInTheDocument();
    expect(screen.queryByText(/spots? available/)).not.toBeInTheDocument();
    expect(screen.getByText('Full')).toBeInTheDocument();
  });

  it('exactly at the limit is Full with no over-limit text', () => {
    render(
      <JudgeCapacityOverview
        judgeDays={[{ ...base, confirmedCount: 2 }]}
        onViewWaitList={vi.fn()}
      />
    );
    expect(screen.getByText('Full')).toBeInTheDocument();
    expect(screen.getByText('0 spots available')).toBeInTheDocument();
    expect(screen.queryByText(/over the limit/)).not.toBeInTheDocument();
  });

  it('under the limit shows spots available and no over-limit text', () => {
    render(
      <JudgeCapacityOverview
        judgeDays={[{ ...base, confirmedCount: 1, availableSpots: 1 }]}
        onViewWaitList={vi.fn()}
      />
    );
    expect(screen.getByText('1 spot available')).toBeInTheDocument();
    expect(screen.queryByText(/over the limit/)).not.toBeInTheDocument();
    expect(screen.queryByText('Full')).not.toBeInTheDocument();
  });
});
