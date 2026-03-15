import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { JudgesList } from '@/components/shows/overview/JudgesList';
import type { ShowJudgeAssignment } from '@/types/judge-types';

describe('JudgesList', () => {
  const judges: ShowJudgeAssignment[] = [
    {
      judgeId: 'j1',
      judgeName: 'Doris Taylor',
      assignedDate: '2026-03-21',
      assignedClasses: ['c1', 'c2', 'c3'],
    },
    {
      judgeId: 'j2',
      judgeName: 'Frank Miller',
      assignedDate: '2026-03-21',
      assignedClasses: ['c4'],
    },
  ];

  it('renders list of judges with names', () => {
    render(<JudgesList judges={judges} />);
    expect(screen.getByText('Doris Taylor')).toBeInTheDocument();
    expect(screen.getByText('Frank Miller')).toBeInTheDocument();
  });

  it('shows assigned class count', () => {
    render(<JudgesList judges={judges} />);
    expect(screen.getByText('3 classes assigned')).toBeInTheDocument();
    expect(screen.getByText('1 class assigned')).toBeInTheDocument();
  });

  it('shows "Judges not yet announced" when empty', () => {
    render(<JudgesList judges={[]} />);
    expect(screen.getByText(/judges not yet announced/i)).toBeInTheDocument();
  });

  it('shows "Judges not yet announced" when undefined', () => {
    render(<JudgesList />);
    expect(screen.getByText(/judges not yet announced/i)).toBeInTheDocument();
  });

  it('renders section heading', () => {
    render(<JudgesList judges={judges} />);
    expect(screen.getByText('Judges')).toBeInTheDocument();
  });
});
