import { beforeEach, describe, expect, it, vi } from 'vitest';

import { render, screen, waitFor } from '@/test/utils/testUtils';

const { getClassById, updateClass } = vi.hoisted(() => ({
  getClassById: vi.fn(),
  updateClass: vi.fn(),
}));

vi.mock('@/services/replication', () => ({
  replicatedClassesTable: { getClassById, updateClass },
}));

import { ClassScoringSwitch, JudgeScoringChoice } from './FocusedClassScoring';

describe('Show Desk scoring controls (MYK9-1971)', () => {
  beforeEach(() => {
    getClassById.mockReset();
    updateClass.mockReset();
    getClassById.mockResolvedValue({ id: 'c1', scoresOnPaper: null });
  });

  it('switches one class to paper in one tap, with no confirmation', async () => {
    const { user } = render(
      <ClassScoringSwitch
        classId="c1"
        className="Container Novice"
        scoresOnPaper={null}
        showUsesDeviceScoring
      />
    );
    expect(screen.getByRole('button', { name: 'Scores on a phone' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    await user.click(screen.getByRole('button', { name: 'Scores on paper' }));
    await waitFor(() => expect(updateClass).toHaveBeenCalledWith('c1', { scoresOnPaper: true }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('reads a class that follows a paper show as paper, and switching to a phone writes false', async () => {
    const { user } = render(
      <ClassScoringSwitch
        classId="c1"
        className="Container Novice"
        scoresOnPaper={null}
        showUsesDeviceScoring={false}
      />
    );
    expect(screen.getByRole('button', { name: 'Scores on paper' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    await user.click(screen.getByRole('button', { name: 'Scores on a phone' }));
    await waitFor(() => expect(updateClass).toHaveBeenCalledWith('c1', { scoresOnPaper: false }));
  });

  it('sets every class of the judge, and says later classes follow the show', async () => {
    const { user } = render(
      <JudgeScoringChoice judgeName="Pat Lee" state="phone" classIds={['c1', 'c2']} />
    );
    expect(screen.getByRole('group', { name: 'Every class Pat Lee judges' })).toBeInTheDocument();
    expect(screen.getByText(/follow the show's setting/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Scores on paper' }));
    await waitFor(() => expect(updateClass).toHaveBeenCalledTimes(2));
    expect(updateClass).toHaveBeenCalledWith('c1', { scoresOnPaper: true });
    expect(updateClass).toHaveBeenCalledWith('c2', { scoresOnPaper: true });
  });

  it('says so when the judge classes are mixed and presses neither', () => {
    render(<JudgeScoringChoice judgeName="Pat Lee" state="mixed" classIds={['c1', 'c2']} />);
    expect(screen.getByText(/Some classes are on paper/)).toBeInTheDocument();
    for (const name of ['Scores on paper', 'Scores on a phone']) {
      expect(screen.getByRole('button', { name })).toHaveAttribute('aria-pressed', 'false');
    }
  });
});
