import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { EnhancedTrainingJournal, type TrainingEntry } from './EnhancedTrainingJournal';
import type { TrainingGoal } from '@/types/training';

vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
      <div {...props}>{children}</div>
    ),
  },
}));

const entry: TrainingEntry = {
  id: 'entry-1',
  title: 'Container drill',
  content: 'Worked corners',
  date: new Date('2026-05-01T12:00:00Z'),
  duration: 30,
  skills: ['Containers'],
  difficulty: 3,
  progress: 'excellent',
  photos: [],
};

const goal: TrainingGoal = {
  id: 'goal-1',
  dog_id: 'dog-123',
  owner_id: 'user-123',
  title: 'Earn NW1 by September',
  target_date: '2026-09-01',
  sport_tag: 'Scent Work',
  notes: null,
  completed_at: null,
  created_at: '2026-05-01T00:00:00Z',
  updated_at: '2026-05-01T00:00:00Z',
};

describe('EnhancedTrainingJournal quick actions', () => {
  it('opens a progress report with training metrics', () => {
    render(<EnhancedTrainingJournal entries={[entry]} />);

    fireEvent.click(screen.getByRole('button', { name: /view progress report/i }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Progress Report')).toBeInTheDocument();
    expect(screen.getAllByText('Containers').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/1 sessions .* 30 min/i).length).toBeGreaterThan(0);
  });

  it('creates and completes training goals', () => {
    const onCreateGoal = vi.fn();
    const onToggleGoal = vi.fn();

    render(
      <EnhancedTrainingJournal
        entries={[entry]}
        goals={[goal]}
        onCreateGoal={onCreateGoal}
        onToggleGoal={onToggleGoal}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /set training goals/i }));
    fireEvent.change(screen.getByPlaceholderText(/earn nw1/i), {
      target: { value: 'Improve buried hides' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^add$/i }));

    expect(onCreateGoal).toHaveBeenCalledWith({
      title: 'Improve buried hides',
      target_date: null,
      sport_tag: null,
    });

    fireEvent.click(screen.getByRole('button', { name: /complete/i }));

    expect(onToggleGoal).toHaveBeenCalledWith(goal);
  });
});
